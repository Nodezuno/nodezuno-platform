// Package upstream calls isolated operator-configured Ethereum JSON-RPC URLs.
package upstream

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/types/known/structpb"
)

var (
	// ErrInvalidResponse indicates a response that is not a valid matching
	// JSON-RPC 2.0 envelope.
	ErrInvalidResponse = errors.New("invalid Ethereum upstream response")
	// ErrResponseTooLarge indicates an upstream response over the configured
	// byte limit.
	ErrResponseTooLarge = errors.New("Ethereum upstream response exceeds limit")
	// ErrUnavailable is a credential-free transport failure.
	ErrUnavailable = errors.New("Ethereum upstream is unavailable")
)

// HTTPStatusError reports only the upstream status code. It never carries the
// response body or configured upstream URL.
type HTTPStatusError struct {
	StatusCode int
}

func (err *HTTPStatusError) Error() string {
	return fmt.Sprintf("Ethereum upstream returned HTTP status %d", err.StatusCode)
}

// RPCError is a valid JSON-RPC error returned by the configured upstream.
type RPCError struct {
	Code    int64
	Message string
	Data    *structpb.Value
}

// Response contains exactly one of Result or Error.
type Response struct {
	Result *structpb.Value
	Error  *RPCError
}

// Caller is the upstream contract consumed by the gRPC server.
type Caller interface {
	Call(
		ctx context.Context,
		method string,
		requestID string,
		params *structpb.ListValue,
	) (Response, error)
}

// Client calls one immutable upstream endpoint.
type Client struct {
	endpoint         *url.URL
	httpClient       *http.Client
	headers          http.Header
	maxResponseBytes int64
	redactionTokens  []string
}

// NewClient creates a production-oriented upstream client.
func NewClient(endpoint *url.URL, maxResponseBytes int64) *Client {
	return NewClientWithHeaders(endpoint, nil, maxResponseBytes)
}

// NewClientWithHeaders creates a production-oriented client with immutable
// operator-configured provider credentials.
func NewClientWithHeaders(
	endpoint *url.URL,
	headers map[string]string,
	maxResponseBytes int64,
) *Client {
	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   5 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          100,
		MaxIdleConnsPerHost:   32,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   5 * time.Second,
		ExpectContinueTimeout: time.Second,
	}
	return NewClientWithHTTPClientAndHeaders(
		endpoint,
		&http.Client{
			Transport: transport,
			CheckRedirect: func(
				_ *http.Request,
				_ []*http.Request,
			) error {
				return http.ErrUseLastResponse
			},
		},
		headers,
		maxResponseBytes,
	)
}

// NewClientWithHTTPClient supports deterministic tests and custom transports.
// Production code should normally use NewClient.
func NewClientWithHTTPClient(
	endpoint *url.URL,
	httpClient *http.Client,
	maxResponseBytes int64,
) *Client {
	return NewClientWithHTTPClientAndHeaders(
		endpoint,
		httpClient,
		nil,
		maxResponseBytes,
	)
}

// NewClientWithHTTPClientAndHeaders supports deterministic credential tests
// while preserving redirect rejection and one-attempt request semantics.
func NewClientWithHTTPClientAndHeaders(
	endpoint *url.URL,
	httpClient *http.Client,
	headers map[string]string,
	maxResponseBytes int64,
) *Client {
	copiedEndpoint := *endpoint
	copiedHTTPClient := *httpClient
	copiedHTTPClient.CheckRedirect = func(
		_ *http.Request,
		_ []*http.Request,
	) error {
		return http.ErrUseLastResponse
	}
	copiedHeaders := make(http.Header, len(headers))
	for name, value := range headers {
		copiedHeaders.Set(name, value)
	}
	return &Client{
		endpoint:         &copiedEndpoint,
		httpClient:       &copiedHTTPClient,
		headers:          copiedHeaders,
		maxResponseBytes: maxResponseBytes,
		redactionTokens:  buildRedactionTokens(&copiedEndpoint, headers),
	}
}

type requestEnvelope struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      string          `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

type responseEnvelope struct {
	JSONRPC string            `json:"jsonrpc"`
	ID      json.RawMessage   `json:"id"`
	Result  json.RawMessage   `json:"result"`
	Error   *responseRPCError `json:"error"`
}

type responseRPCError struct {
	Code    json.Number     `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

// Call forwards one JSON-RPC request without forwarding inbound metadata.
func (client *Client) Call(
	ctx context.Context,
	method string,
	requestID string,
	params *structpb.ListValue,
) (Response, error) {
	paramsJSON, err := protojson.Marshal(&structpb.Value{
		Kind: &structpb.Value_ListValue{ListValue: params},
	})
	if err != nil {
		return Response{}, fmt.Errorf("marshal JSON-RPC params: %w", err)
	}
	body, err := json.Marshal(requestEnvelope{
		JSONRPC: "2.0",
		ID:      requestID,
		Method:  method,
		Params:  paramsJSON,
	})
	if err != nil {
		return Response{}, fmt.Errorf("marshal JSON-RPC request: %w", err)
	}

	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		client.endpoint.String(),
		bytes.NewReader(body),
	)
	if err != nil {
		return Response{}, ErrUnavailable
	}
	request.GetBody = nil
	for name, values := range client.headers {
		for _, value := range values {
			request.Header.Add(name, value)
		}
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("User-Agent", "Nodezuno-Native-gRPC/0.1")

	response, err := client.httpClient.Do(request)
	if err != nil {
		if response != nil && response.Body != nil {
			_ = response.Body.Close()
		}
		if contextError := ctx.Err(); contextError != nil {
			return Response{}, contextError
		}
		return Response{}, ErrUnavailable
	}
	defer response.Body.Close()

	if response.StatusCode < http.StatusOK ||
		response.StatusCode >= http.StatusMultipleChoices {
		return Response{}, &HTTPStatusError{StatusCode: response.StatusCode}
	}
	if !isJSONContentType(response.Header.Get("Content-Type")) {
		return Response{}, ErrInvalidResponse
	}
	if response.ContentLength > client.maxResponseBytes {
		return Response{}, ErrResponseTooLarge
	}

	limited := io.LimitReader(response.Body, client.maxResponseBytes+1)
	responseBody, err := io.ReadAll(limited)
	if err != nil {
		if contextError := ctx.Err(); contextError != nil {
			return Response{}, contextError
		}
		return Response{}, ErrUnavailable
	}
	if int64(len(responseBody)) > client.maxResponseBytes {
		return Response{}, ErrResponseTooLarge
	}

	decoder := json.NewDecoder(bytes.NewReader(responseBody))
	decoder.UseNumber()
	var envelope responseEnvelope
	if err := decoder.Decode(&envelope); err != nil {
		return Response{}, ErrInvalidResponse
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return Response{}, ErrInvalidResponse
	}
	if envelope.JSONRPC != "2.0" {
		return Response{}, ErrInvalidResponse
	}
	var responseID string
	if err := json.Unmarshal(envelope.ID, &responseID); err != nil ||
		responseID != requestID {
		return Response{}, ErrInvalidResponse
	}

	hasResult := len(envelope.Result) > 0
	hasError := envelope.Error != nil
	if hasResult == hasError {
		return Response{}, ErrInvalidResponse
	}
	if hasResult {
		result, err := valueFromJSON(envelope.Result)
		if err != nil {
			return Response{}, ErrInvalidResponse
		}
		return Response{Result: result}, nil
	}

	code, err := envelope.Error.Code.Int64()
	if err != nil || envelope.Error.Message == "" {
		return Response{}, ErrInvalidResponse
	}
	rpcError := &RPCError{
		Code:    code,
		Message: client.redact(envelope.Error.Message),
	}
	if len(envelope.Error.Data) > 0 {
		data, err := valueFromJSON(envelope.Error.Data)
		if err != nil {
			return Response{}, ErrInvalidResponse
		}
		client.redactValue(data, 0)
		rpcError.Data = data
	}
	return Response{Error: rpcError}, nil
}

func isJSONContentType(raw string) bool {
	mediaType, _, err := mime.ParseMediaType(raw)
	if err != nil {
		return false
	}
	mediaType = strings.ToLower(mediaType)
	return mediaType == "application/json" ||
		mediaType == "application/json-rpc" ||
		(strings.HasPrefix(mediaType, "application/") &&
			strings.HasSuffix(mediaType, "+json"))
}

func buildRedactionTokens(
	endpoint *url.URL,
	headers map[string]string,
) []string {
	values := make(map[string]struct{})
	add := func(value string) {
		if value == "" || value == "[redacted]" {
			return
		}
		values[value] = struct{}{}
	}
	addURLToken := func(value string) {
		if len(value) < 4 {
			return
		}
		add(value)
		if decoded, err := url.PathUnescape(value); err == nil {
			add(decoded)
		}
		if decoded, err := url.QueryUnescape(value); err == nil {
			add(decoded)
		}
		add(url.PathEscape(value))
		add(url.QueryEscape(value))
	}

	if endpoint != nil {
		if endpoint.Path != "" && endpoint.Path != "/" {
			add(endpoint.Path)
			add(endpoint.EscapedPath())
		}
		for _, segment := range strings.Split(endpoint.EscapedPath(), "/") {
			addURLToken(segment)
		}
		if endpoint.RawQuery != "" {
			add(endpoint.RawQuery)
			for _, field := range strings.Split(endpoint.RawQuery, "&") {
				_, value, found := strings.Cut(field, "=")
				if found {
					addURLToken(value)
				}
			}
			if query, err := url.ParseQuery(endpoint.RawQuery); err == nil {
				for _, queryValues := range query {
					for _, value := range queryValues {
						addURLToken(value)
					}
				}
			}
		}
	}

	for _, value := range headers {
		add(value)
		fields := strings.Fields(value)
		for index, field := range fields {
			if index == 0 &&
				(strings.EqualFold(field, "bearer") ||
					strings.EqualFold(field, "basic")) {
				continue
			}
			add(field)
		}
	}

	tokens := make([]string, 0, len(values))
	for value := range values {
		tokens = append(tokens, value)
	}
	sort.Slice(tokens, func(left int, right int) bool {
		if len(tokens[left]) == len(tokens[right]) {
			return tokens[left] < tokens[right]
		}
		return len(tokens[left]) > len(tokens[right])
	})
	return tokens
}

func (client *Client) redact(value string) string {
	for _, token := range client.redactionTokens {
		value = strings.ReplaceAll(value, token, "[redacted]")
	}
	return value
}

func (client *Client) redactValue(value *structpb.Value, depth int) {
	if value == nil || depth > 32 {
		return
	}
	switch kind := value.Kind.(type) {
	case *structpb.Value_StringValue:
		kind.StringValue = client.redact(kind.StringValue)
	case *structpb.Value_StructValue:
		fields := make(map[string]*structpb.Value, len(kind.StructValue.Fields))
		for key, field := range kind.StructValue.Fields {
			client.redactValue(field, depth+1)
			fields[client.redact(key)] = field
		}
		kind.StructValue.Fields = fields
	case *structpb.Value_ListValue:
		for _, item := range kind.ListValue.Values {
			client.redactValue(item, depth+1)
		}
	}
}

func valueFromJSON(raw json.RawMessage) (*structpb.Value, error) {
	value := new(structpb.Value)
	if err := protojson.Unmarshal(raw, value); err != nil {
		return nil, err
	}
	return value, nil
}
