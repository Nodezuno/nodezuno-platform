// Package ethereum implements the authenticated native gRPC Ethereum proxy.
package ethereum

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log/slog"
	"math"
	"math/big"
	"regexp"
	"time"

	"github.com/nodezuno/nodezuno.com/services/grpc-gateway/internal/upstream"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/structpb"
)

var requestIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)

var blockQuantityPattern = regexp.MustCompile(`^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$`)

var ethereumAddressPattern = regexp.MustCompile(`^0x[0-9a-fA-F]{40}$`)

var ethereumHashPattern = regexp.MustCompile(`^0x[0-9a-fA-F]{64}$`)

const (
	maximumLogBlockRange    = 2_000
	maximumCallDataBytes    = 64 * 1_024
	maximumFeeHistoryBlocks = 1_024
	maximumProofStorageKeys = 64
	maximumExplicitCallGas  = 30_000_000
)

var blockTags = map[string]struct{}{
	"earliest":  {},
	"finalized": {},
	"latest":    {},
	"pending":   {},
	"safe":      {},
}

var allowedRequestFields = map[string]struct{}{
	"method":     {},
	"params":     {},
	"request_id": {},
}

// Server implements nodezuno.ethereum.v1.EthereumProxy.
type Server struct {
	caller         upstream.Caller
	allowedMethods map[string]struct{}
	timeout        time.Duration
	admission      chan struct{}
	logger         *slog.Logger
}

// NewServer creates an immutable proxy service.
func NewServer(
	caller upstream.Caller,
	allowedMethods map[string]struct{},
	timeout time.Duration,
	maxConcurrentCalls int,
	logger *slog.Logger,
) *Server {
	methods := make(map[string]struct{}, len(allowedMethods))
	for method := range allowedMethods {
		methods[method] = struct{}{}
	}
	return &Server{
		caller:         caller,
		allowedMethods: methods,
		timeout:        timeout,
		admission:      make(chan struct{}, maxConcurrentCalls),
		logger:         logger,
	}
}

// Call validates and forwards one allowlisted Ethereum JSON-RPC call.
func (server *Server) Call(
	ctx context.Context,
	request *structpb.Struct,
) (*structpb.Struct, error) {
	method, params, requestID, err := parseRequest(request)
	if err != nil {
		return nil, err
	}
	if _, allowed := server.allowedMethods[method]; !allowed {
		return nil, status.Error(
			codes.PermissionDenied,
			"Ethereum JSON-RPC method is not enabled",
		)
	}
	if err := validateMethodParameters(method, params); err != nil {
		return nil, err
	}

	select {
	case server.admission <- struct{}{}:
		defer func() { <-server.admission }()
	default:
		return nil, status.Error(
			codes.ResourceExhausted,
			"native gRPC proxy is at its concurrency limit",
		)
	}

	callContext, cancel := context.WithTimeout(ctx, server.timeout)
	defer cancel()
	response, err := server.caller.Call(callContext, method, requestID, params)
	if err != nil {
		switch {
		case errors.Is(err, context.Canceled):
			return nil, status.Error(codes.Canceled, "request canceled")
		case errors.Is(err, context.DeadlineExceeded):
			return nil, status.Error(
				codes.DeadlineExceeded,
				"Ethereum upstream deadline exceeded",
			)
		case errors.Is(err, upstream.ErrResponseTooLarge):
			return nil, status.Error(
				codes.ResourceExhausted,
				"Ethereum upstream response exceeds the configured limit",
			)
		default:
			server.logger.Warn(
				"Ethereum upstream call failed",
				"method", method,
				"request_id", requestID,
				"error_type", upstreamErrorType(err),
			)
			return nil, status.Error(
				codes.Unavailable,
				"Ethereum upstream is unavailable",
			)
		}
	}

	fields := map[string]*structpb.Value{
		"jsonrpc":    structpb.NewStringValue("2.0"),
		"request_id": structpb.NewStringValue(requestID),
	}
	if response.Result != nil {
		fields["result"] = response.Result
	} else if response.Error != nil {
		errorFields := map[string]*structpb.Value{
			"code":    structpb.NewNumberValue(float64(response.Error.Code)),
			"message": structpb.NewStringValue(response.Error.Message),
		}
		if response.Error.Data != nil {
			errorFields["data"] = response.Error.Data
		}
		fields["error"] = structpb.NewStructValue(
			&structpb.Struct{Fields: errorFields},
		)
	} else {
		return nil, status.Error(
			codes.Internal,
			"Ethereum upstream returned an empty response",
		)
	}
	return &structpb.Struct{Fields: fields}, nil
}

func parseRequest(
	request *structpb.Struct,
) (string, *structpb.ListValue, string, error) {
	if request == nil {
		return "", nil, "", status.Error(
			codes.InvalidArgument,
			"request is required",
		)
	}
	for field := range request.Fields {
		if _, allowed := allowedRequestFields[field]; !allowed {
			return "", nil, "", status.Errorf(
				codes.InvalidArgument,
				"unknown request field %q",
				field,
			)
		}
	}

	methodField, ok := request.Fields["method"]
	if !ok {
		return "", nil, "", status.Error(
			codes.InvalidArgument,
			"method is required",
		)
	}
	methodKind, ok := methodField.Kind.(*structpb.Value_StringValue)
	if !ok || methodKind.StringValue == "" || len(methodKind.StringValue) > 128 {
		return "", nil, "", status.Error(
			codes.InvalidArgument,
			"method must be a non-empty string of at most 128 characters",
		)
	}

	params := &structpb.ListValue{}
	if paramsField, exists := request.Fields["params"]; exists {
		paramsKind, ok := paramsField.Kind.(*structpb.Value_ListValue)
		if !ok || paramsKind.ListValue == nil {
			return "", nil, "", status.Error(
				codes.InvalidArgument,
				"params must be a list",
			)
		}
		params = paramsKind.ListValue
	}

	requestID, err := requestIDFromRequest(request)
	if err != nil {
		return "", nil, "", err
	}
	return methodKind.StringValue, params, requestID, nil
}

func validateMethodParameters(
	method string,
	params *structpb.ListValue,
) error {
	switch method {
	case "eth_getLogs":
		if !validLogParameters(params) {
			return status.Errorf(
				codes.InvalidArgument,
				"eth_getLogs requires a block hash or a range of at most %d blocks",
				maximumLogBlockRange,
			)
		}
	case "eth_feeHistory":
		if !validFeeHistoryParameters(params) {
			return status.Errorf(
				codes.InvalidArgument,
				"eth_feeHistory accepts at most %d blocks and 20 reward percentiles",
				maximumFeeHistoryBlocks,
			)
		}
	case "eth_getProof":
		if !validProofParameters(params) {
			return status.Errorf(
				codes.InvalidArgument,
				"eth_getProof accepts at most %d storage keys",
				maximumProofStorageKeys,
			)
		}
	case "eth_call", "eth_estimateGas":
		if !validCallParameters(params) {
			return status.Errorf(
				codes.InvalidArgument,
				"call data must not exceed %d bytes and explicit gas must not exceed %d",
				maximumCallDataBytes,
				maximumExplicitCallGas,
			)
		}
	}
	return nil
}

func validLogParameters(params *structpb.ListValue) bool {
	if params == nil || len(params.Values) != 1 {
		return false
	}
	filter, ok := structValue(params.Values[0])
	if !ok {
		return false
	}
	for field := range filter.Fields {
		switch field {
		case "address", "blockHash", "fromBlock", "toBlock", "topics":
		default:
			return false
		}
	}
	if address, exists := filter.Fields["address"]; exists &&
		!validLogAddress(address) {
		return false
	}
	if topics, exists := filter.Fields["topics"]; exists &&
		!validLogTopics(topics) {
		return false
	}
	if blockHash, exists := filter.Fields["blockHash"]; exists {
		_, hasFrom := filter.Fields["fromBlock"]
		_, hasTo := filter.Fields["toBlock"]
		return !hasFrom && !hasTo && isHashValue(blockHash)
	}
	fromValue, hasFrom := filter.Fields["fromBlock"]
	toValue, hasTo := filter.Fields["toBlock"]
	if !hasFrom || !hasTo {
		return false
	}
	from, fromIsQuantity := blockQuantity(fromValue)
	to, toIsQuantity := blockQuantity(toValue)
	if fromIsQuantity && toIsQuantity {
		if to.Cmp(from) < 0 {
			return false
		}
		difference := new(big.Int).Sub(to, from)
		return difference.Cmp(big.NewInt(maximumLogBlockRange-1)) <= 0
	}
	fromTag, fromIsString := stringValue(fromValue)
	toTag, toIsString := stringValue(toValue)
	if !fromIsString || !toIsString || fromTag != toTag {
		return false
	}
	_, allowed := blockTags[fromTag]
	return allowed
}

func validFeeHistoryParameters(params *structpb.ListValue) bool {
	if params == nil || len(params.Values) < 2 || len(params.Values) > 3 {
		return false
	}
	count, ok := blockQuantity(params.Values[0])
	if !ok ||
		count.Sign() < 1 ||
		count.Cmp(big.NewInt(maximumFeeHistoryBlocks)) > 0 ||
		!isBlockReference(params.Values[1]) {
		return false
	}
	if len(params.Values) == 2 {
		return true
	}
	rewards, ok := listValue(params.Values[2])
	if !ok || len(rewards.Values) > 20 {
		return false
	}
	previous := -1.0
	for _, value := range rewards.Values {
		percentile, ok := numberValue(value)
		if !ok ||
			math.IsNaN(percentile) ||
			math.IsInf(percentile, 0) ||
			percentile < 0 ||
			percentile > 100 ||
			percentile < previous {
			return false
		}
		previous = percentile
	}
	return true
}

func validProofParameters(params *structpb.ListValue) bool {
	if params == nil || (len(params.Values) != 2 && len(params.Values) != 3) {
		return false
	}
	if !isAddressValue(params.Values[0]) {
		return false
	}
	keys, ok := listValue(params.Values[1])
	if !ok || len(keys.Values) > maximumProofStorageKeys {
		return false
	}
	for _, key := range keys.Values {
		if !isHashValue(key) {
			return false
		}
	}
	return len(params.Values) == 2 || isBlockReference(params.Values[2])
}

func validCallParameters(params *structpb.ListValue) bool {
	if params == nil || len(params.Values) < 1 || len(params.Values) > 3 {
		return false
	}
	transaction, ok := structValue(params.Values[0])
	if !ok {
		return false
	}
	for _, field := range []string{"data", "input"} {
		if value, exists := transaction.Fields[field]; exists &&
			!isBoundedHexData(value, maximumCallDataBytes) {
			return false
		}
	}
	if gas, exists := transaction.Fields["gas"]; exists {
		quantity, ok := blockQuantity(gas)
		if !ok || quantity.Cmp(big.NewInt(maximumExplicitCallGas)) > 0 {
			return false
		}
	}
	return true
}

func validLogAddress(value *structpb.Value) bool {
	if isAddressValue(value) {
		return true
	}
	addresses, ok := listValue(value)
	if !ok || len(addresses.Values) < 1 || len(addresses.Values) > 20 {
		return false
	}
	for _, address := range addresses.Values {
		if !isAddressValue(address) {
			return false
		}
	}
	return true
}

func validLogTopics(value *structpb.Value) bool {
	topics, ok := listValue(value)
	if !ok || len(topics.Values) > 4 {
		return false
	}
	for _, topic := range topics.Values {
		if isNullValue(topic) || isHashValue(topic) {
			continue
		}
		alternatives, ok := listValue(topic)
		if !ok ||
			len(alternatives.Values) < 1 ||
			len(alternatives.Values) > 20 {
			return false
		}
		for _, alternative := range alternatives.Values {
			if !isHashValue(alternative) {
				return false
			}
		}
	}
	return true
}

func isBlockReference(value *structpb.Value) bool {
	if _, ok := blockQuantity(value); ok {
		return true
	}
	tag, ok := stringValue(value)
	if !ok {
		return false
	}
	_, allowed := blockTags[tag]
	return allowed
}

func blockQuantity(value *structpb.Value) (*big.Int, bool) {
	raw, ok := stringValue(value)
	if !ok || !blockQuantityPattern.MatchString(raw) {
		return nil, false
	}
	quantity, parsed := new(big.Int).SetString(raw[2:], 16)
	return quantity, parsed
}

func isAddressValue(value *structpb.Value) bool {
	raw, ok := stringValue(value)
	return ok && ethereumAddressPattern.MatchString(raw)
}

func isHashValue(value *structpb.Value) bool {
	raw, ok := stringValue(value)
	return ok && ethereumHashPattern.MatchString(raw)
}

func isBoundedHexData(value *structpb.Value, maximumBytes int) bool {
	raw, ok := stringValue(value)
	if !ok || len(raw) < 2 || raw[:2] != "0x" || (len(raw)-2)%2 != 0 {
		return false
	}
	if (len(raw)-2)/2 > maximumBytes {
		return false
	}
	for _, character := range raw[2:] {
		if !((character >= '0' && character <= '9') ||
			(character >= 'a' && character <= 'f') ||
			(character >= 'A' && character <= 'F')) {
			return false
		}
	}
	return true
}

func structValue(value *structpb.Value) (*structpb.Struct, bool) {
	if value == nil {
		return nil, false
	}
	kind, ok := value.Kind.(*structpb.Value_StructValue)
	if !ok || kind.StructValue == nil {
		return nil, false
	}
	return kind.StructValue, true
}

func listValue(value *structpb.Value) (*structpb.ListValue, bool) {
	if value == nil {
		return nil, false
	}
	kind, ok := value.Kind.(*structpb.Value_ListValue)
	if !ok || kind.ListValue == nil {
		return nil, false
	}
	return kind.ListValue, true
}

func stringValue(value *structpb.Value) (string, bool) {
	if value == nil {
		return "", false
	}
	kind, ok := value.Kind.(*structpb.Value_StringValue)
	if !ok {
		return "", false
	}
	return kind.StringValue, true
}

func numberValue(value *structpb.Value) (float64, bool) {
	if value == nil {
		return 0, false
	}
	kind, ok := value.Kind.(*structpb.Value_NumberValue)
	if !ok {
		return 0, false
	}
	return kind.NumberValue, true
}

func isNullValue(value *structpb.Value) bool {
	if value == nil {
		return false
	}
	_, ok := value.Kind.(*structpb.Value_NullValue)
	return ok
}

func requestIDFromRequest(request *structpb.Struct) (string, error) {
	requestIDField, exists := request.Fields["request_id"]
	if exists {
		requestIDKind, ok := requestIDField.Kind.(*structpb.Value_StringValue)
		if !ok || !requestIDPattern.MatchString(requestIDKind.StringValue) {
			return "", status.Error(
				codes.InvalidArgument,
				"request_id must contain 1 to 128 safe ASCII characters",
			)
		}
		return requestIDKind.StringValue, nil
	}

	random := make([]byte, 16)
	if _, err := rand.Read(random); err != nil {
		return "", status.Error(
			codes.Internal,
			"could not create request identifier",
		)
	}
	return hex.EncodeToString(random), nil
}

func upstreamErrorType(err error) string {
	var statusError *upstream.HTTPStatusError
	switch {
	case errors.As(err, &statusError):
		return "http_status"
	case errors.Is(err, upstream.ErrInvalidResponse):
		return "invalid_response"
	default:
		return "transport"
	}
}
