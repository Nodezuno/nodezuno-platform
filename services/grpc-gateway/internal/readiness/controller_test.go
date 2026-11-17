package readiness

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/nodezuno/nodezuno.com/services/grpc-gateway/internal/upstream"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/structpb"
)

type testValidator struct {
	err error
}

func TestGateFailsClosedUntilReadinessIsProven(t *testing.T) {
	t.Parallel()
	gate := NewGate()
	handlerCalled := false
	handler := func(context.Context, any) (any, error) {
		handlerCalled = true
		return "ok", nil
	}
	_, err := gate.UnaryInterceptor(
		context.Background(),
		nil,
		&grpc.UnaryServerInfo{
			FullMethod: "/nodezuno.ethereum.v1.EthereumProxy/Call",
		},
		handler,
	)
	if status.Code(err) != codes.Unavailable || handlerCalled {
		t.Fatalf("closed gate error = %v, called = %v", err, handlerCalled)
	}
	gate.ready.Store(true)
	response, err := gate.UnaryInterceptor(
		context.Background(),
		nil,
		&grpc.UnaryServerInfo{
			FullMethod: "/nodezuno.ethereum.v1.EthereumProxy/Call",
		},
		handler,
	)
	if err != nil || response != "ok" || !handlerCalled {
		t.Fatalf("open gate response = %v, error = %v", response, err)
	}
}

func (validator testValidator) Authorize(
	context.Context,
	string,
	string,
) (bool, error) {
	return true, validator.err
}

func (validator testValidator) Ready(context.Context) error {
	return validator.err
}

type testCaller struct {
	response upstream.Response
	err      error
}

func (caller testCaller) Call(
	context.Context,
	string,
	string,
	*structpb.ListValue,
) (upstream.Response, error) {
	return caller.response, caller.err
}

func TestProbeRequiresAuthorizationAndEthereumMainnet(t *testing.T) {
	t.Parallel()
	mainnet := testCaller{
		response: upstream.Response{
			Result: structpb.NewStringValue("0x1"),
		},
	}
	if !probe(
		context.Background(),
		mainnet,
		testValidator{},
		time.Second,
	) {
		t.Fatal("probe rejected a ready control plane and mainnet upstream")
	}
	for _, test := range []struct {
		name      string
		caller    testCaller
		validator testValidator
	}{
		{
			name:      "authorization unavailable",
			caller:    mainnet,
			validator: testValidator{err: errors.New("unavailable")},
		},
		{
			name: "wrong chain",
			caller: testCaller{
				response: upstream.Response{
					Result: structpb.NewStringValue("0x2105"),
				},
			},
		},
		{
			name:   "upstream unavailable",
			caller: testCaller{err: errors.New("unavailable")},
		},
	} {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			if probe(
				context.Background(),
				test.caller,
				test.validator,
				time.Second,
			) {
				t.Fatal("probe reported serving without every dependency")
			}
		})
	}
}
