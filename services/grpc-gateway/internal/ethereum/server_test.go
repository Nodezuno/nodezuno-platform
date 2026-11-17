package ethereum

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/nodezuno/nodezuno.com/services/grpc-gateway/internal/upstream"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/structpb"
)

type fakeCaller struct {
	call func(
		context.Context,
		string,
		string,
		*structpb.ListValue,
	) (upstream.Response, error)
}

func (caller *fakeCaller) Call(
	ctx context.Context,
	method string,
	requestID string,
	params *structpb.ListValue,
) (upstream.Response, error) {
	return caller.call(ctx, method, requestID, params)
}

func TestServerReturnsEthereumResult(t *testing.T) {
	t.Parallel()
	caller := &fakeCaller{call: func(
		_ context.Context,
		method string,
		requestID string,
		params *structpb.ListValue,
	) (upstream.Response, error) {
		if method != "eth_getBalance" || requestID != "balance-1" {
			t.Fatalf("method = %q, requestID = %q", method, requestID)
		}
		if len(params.Values) != 2 {
			t.Fatalf("params length = %d", len(params.Values))
		}
		return upstream.Response{
			Result: structpb.NewStringValue("0xde0b6b3a7640000"),
		}, nil
	}}
	server := newTestServer(caller, 2)
	request, err := structpb.NewStruct(map[string]any{
		"method":     "eth_getBalance",
		"params":     []any{"0x0000000000000000000000000000000000000000", "latest"},
		"request_id": "balance-1",
	})
	if err != nil {
		t.Fatalf("NewStruct() error = %v", err)
	}
	response, err := server.Call(context.Background(), request)
	if err != nil {
		t.Fatalf("Call() error = %v", err)
	}
	if response.Fields["result"].GetStringValue() != "0xde0b6b3a7640000" {
		t.Fatalf("response = %v", response)
	}
}

func TestServerRejectsDisallowedMethod(t *testing.T) {
	t.Parallel()
	server := newTestServer(&fakeCaller{call: func(
		context.Context,
		string,
		string,
		*structpb.ListValue,
	) (upstream.Response, error) {
		t.Fatal("upstream called for disallowed method")
		return upstream.Response{}, nil
	}}, 1)
	request, _ := structpb.NewStruct(map[string]any{
		"method": "eth_sendRawTransaction",
		"params": []any{"0xdeadbeef"},
	})
	_, err := server.Call(context.Background(), request)
	if status.Code(err) != codes.PermissionDenied {
		t.Fatalf("status code = %s, want PermissionDenied", status.Code(err))
	}
}

func TestServerRejectsUnknownRequestField(t *testing.T) {
	t.Parallel()
	server := newTestServer(nil, 1)
	request, _ := structpb.NewStruct(map[string]any{
		"method": "eth_chainId",
		"secret": "must-not-pass",
	})
	_, err := server.Call(context.Background(), request)
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("status code = %s, want InvalidArgument", status.Code(err))
	}
}

func TestExpensiveMethodParameterBoundaries(t *testing.T) {
	t.Parallel()
	address := "0x" + strings.Repeat("1", 40)
	hash := "0x" + strings.Repeat("2", 64)
	proofKeys := repeatValues(hash, maximumProofStorageKeys)
	maximumData := "0x" + strings.Repeat("00", maximumCallDataBytes)

	tests := []struct {
		name   string
		method string
		params []any
	}{
		{
			name:   "logs numeric range",
			method: "eth_getLogs",
			params: []any{map[string]any{
				"address":   address,
				"fromBlock": "0x1",
				"toBlock":   "0x7d0",
				"topics":    []any{hash, nil},
			}},
		},
		{
			name:   "logs block hash",
			method: "eth_getLogs",
			params: []any{map[string]any{"blockHash": hash}},
		},
		{
			name:   "fee history",
			method: "eth_feeHistory",
			params: []any{
				"0x400",
				"latest",
				[]any{0.0, 25.5, 100.0},
			},
		},
		{
			name:   "proof",
			method: "eth_getProof",
			params: []any{address, proofKeys, "safe"},
		},
		{
			name:   "call",
			method: "eth_call",
			params: []any{
				map[string]any{
					"data": maximumData,
					"gas":  "0x1c9c380",
				},
				"latest",
			},
		},
		{
			name:   "estimate gas",
			method: "eth_estimateGas",
			params: []any{map[string]any{"input": "0x"}},
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			if err := validateMethodParameters(
				test.method,
				mustList(t, test.params),
			); err != nil {
				t.Fatalf("validateMethodParameters() error = %v", err)
			}
		})
	}
}

func TestExpensiveMethodParameterRejections(t *testing.T) {
	t.Parallel()
	address := "0x" + strings.Repeat("1", 40)
	hash := "0x" + strings.Repeat("2", 64)
	tooManyAddresses := repeatValues(address, 21)
	tooManyTopics := repeatValues(hash, 5)
	tooManyProofKeys := repeatValues(hash, maximumProofStorageKeys+1)
	tooManyPercentiles := make([]any, 21)
	for index := range tooManyPercentiles {
		tooManyPercentiles[index] = float64(index)
	}

	tests := []struct {
		name   string
		method string
		params []any
	}{
		{
			name:   "logs missing range",
			method: "eth_getLogs",
			params: []any{map[string]any{}},
		},
		{
			name:   "logs range too large",
			method: "eth_getLogs",
			params: []any{map[string]any{
				"fromBlock": "0x1",
				"toBlock":   "0x7d1",
			}},
		},
		{
			name:   "logs unknown filter field",
			method: "eth_getLogs",
			params: []any{map[string]any{
				"fromBlock": "latest",
				"toBlock":   "latest",
				"limit":     1,
			}},
		},
		{
			name:   "logs too many addresses",
			method: "eth_getLogs",
			params: []any{map[string]any{
				"address":   tooManyAddresses,
				"fromBlock": "latest",
				"toBlock":   "latest",
			}},
		},
		{
			name:   "logs too many topics",
			method: "eth_getLogs",
			params: []any{map[string]any{
				"fromBlock": "latest",
				"toBlock":   "latest",
				"topics":    tooManyTopics,
			}},
		},
		{
			name:   "fee history block count",
			method: "eth_feeHistory",
			params: []any{"0x401", "latest"},
		},
		{
			name:   "fee history percentile count",
			method: "eth_feeHistory",
			params: []any{"0x1", "latest", tooManyPercentiles},
		},
		{
			name:   "fee history percentile order",
			method: "eth_feeHistory",
			params: []any{"0x1", "latest", []any{50.0, 49.0}},
		},
		{
			name:   "proof storage key count",
			method: "eth_getProof",
			params: []any{address, tooManyProofKeys},
		},
		{
			name:   "call data size",
			method: "eth_call",
			params: []any{map[string]any{
				"data": "0x" + strings.Repeat("00", maximumCallDataBytes+1),
			}},
		},
		{
			name:   "call gas",
			method: "eth_call",
			params: []any{map[string]any{"gas": "0x1c9c381"}},
		},
		{
			name:   "estimate gas odd input",
			method: "eth_estimateGas",
			params: []any{map[string]any{"input": "0x0"}},
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			err := validateMethodParameters(
				test.method,
				mustList(t, test.params),
			)
			if status.Code(err) != codes.InvalidArgument {
				t.Fatalf(
					"status code = %s, want InvalidArgument",
					status.Code(err),
				)
			}
		})
	}
}

func TestServerRejectsExpensiveParametersBeforeUpstream(t *testing.T) {
	t.Parallel()
	called := false
	server := newTestServer(&fakeCaller{call: func(
		context.Context,
		string,
		string,
		*structpb.ListValue,
	) (upstream.Response, error) {
		called = true
		return upstream.Response{}, nil
	}}, 1)
	request, err := structpb.NewStruct(map[string]any{
		"method": "eth_getLogs",
		"params": []any{map[string]any{
			"fromBlock": "0x1",
			"toBlock":   "0x7d1",
		}},
	})
	if err != nil {
		t.Fatalf("NewStruct() error = %v", err)
	}
	_, err = server.Call(context.Background(), request)
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("status code = %s, want InvalidArgument", status.Code(err))
	}
	if called {
		t.Fatal("upstream called for out-of-policy parameters")
	}
}

func TestServerMapsUpstreamFailure(t *testing.T) {
	t.Parallel()
	server := newTestServer(&fakeCaller{call: func(
		context.Context,
		string,
		string,
		*structpb.ListValue,
	) (upstream.Response, error) {
		return upstream.Response{}, upstream.ErrInvalidResponse
	}}, 1)
	request, _ := structpb.NewStruct(map[string]any{
		"method": "eth_chainId",
	})
	_, err := server.Call(context.Background(), request)
	if status.Code(err) != codes.Unavailable {
		t.Fatalf("status code = %s, want Unavailable", status.Code(err))
	}
}

func TestServerEnforcesConcurrencyLimit(t *testing.T) {
	t.Parallel()
	entered := make(chan struct{})
	release := make(chan struct{})
	caller := &fakeCaller{call: func(
		context.Context,
		string,
		string,
		*structpb.ListValue,
	) (upstream.Response, error) {
		close(entered)
		<-release
		return upstream.Response{Result: structpb.NewStringValue("0x1")}, nil
	}}
	server := newTestServer(caller, 1)
	request, _ := structpb.NewStruct(map[string]any{"method": "eth_chainId"})
	firstDone := make(chan error, 1)
	go func() {
		_, err := server.Call(context.Background(), request)
		firstDone <- err
	}()
	<-entered

	_, err := server.Call(context.Background(), request)
	if status.Code(err) != codes.ResourceExhausted {
		t.Fatalf("status code = %s, want ResourceExhausted", status.Code(err))
	}
	close(release)
	if err := <-firstDone; err != nil {
		t.Fatalf("first Call() error = %v", err)
	}
}

func newTestServer(caller upstream.Caller, maxConcurrent int) *Server {
	if caller == nil {
		caller = &fakeCaller{call: func(
			context.Context,
			string,
			string,
			*structpb.ListValue,
		) (upstream.Response, error) {
			return upstream.Response{}, errors.New("unexpected call")
		}}
	}
	return NewServer(
		caller,
		map[string]struct{}{
			"eth_call":        {},
			"eth_chainId":     {},
			"eth_estimateGas": {},
			"eth_feeHistory":  {},
			"eth_getBalance":  {},
			"eth_getLogs":     {},
			"eth_getProof":    {},
		},
		time.Second,
		maxConcurrent,
		slog.New(slog.NewTextHandler(io.Discard, nil)),
	)
}

func mustList(t *testing.T, values []any) *structpb.ListValue {
	t.Helper()
	list, err := structpb.NewList(values)
	if err != nil {
		t.Fatalf("NewList() error = %v", err)
	}
	return list
}

func repeatValues(value string, count int) []any {
	values := make([]any, count)
	for index := range values {
		values[index] = value
	}
	return values
}
