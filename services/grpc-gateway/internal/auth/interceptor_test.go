package auth

import (
	"context"
	"crypto/sha256"
	"testing"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/structpb"
)

func TestUnaryInterceptorAuthenticatesBearerToken(t *testing.T) {
	t.Parallel()
	token := "native-grpc-test-key-with-enough-entropy"
	digest := sha256.Sum256([]byte(token))
	authenticator := New(NewStaticDigestValidator(
		[][sha256.Size]byte{digest},
	))
	handlerCalled := false
	handler := func(context.Context, any) (any, error) {
		handlerCalled = true
		return "ok", nil
	}

	ctx := metadata.NewIncomingContext(
		context.Background(),
		metadata.Pairs(
			"authorization", "Bearer "+token,
			"x-nodezuno-service-id",
			"11111111-1111-4111-8111-111111111111",
		),
	)
	response, err := authenticator.UnaryInterceptor(
		ctx,
		nil,
		&grpc.UnaryServerInfo{FullMethod: "/nodezuno.ethereum.v1.EthereumProxy/Call"},
		handler,
	)
	if err != nil {
		t.Fatalf("UnaryInterceptor() error = %v", err)
	}
	if response != "ok" || !handlerCalled {
		t.Fatalf("response = %v, handlerCalled = %v", response, handlerCalled)
	}
}

func TestUnaryInterceptorRejectsInvalidCredential(t *testing.T) {
	t.Parallel()
	digest := sha256.Sum256([]byte("native-grpc-correct-key-value"))
	authenticator := New(NewStaticDigestValidator(
		[][sha256.Size]byte{digest},
	))
	ctx := metadata.NewIncomingContext(
		context.Background(),
		metadata.Pairs(
			"authorization",
			"Bearer native-grpc-incorrect-key-value",
			"x-nodezuno-service-id",
			"11111111-1111-4111-8111-111111111111",
		),
	)
	_, err := authenticator.UnaryInterceptor(
		ctx,
		nil,
		&grpc.UnaryServerInfo{FullMethod: "/nodezuno.ethereum.v1.EthereumProxy/Call"},
		func(context.Context, any) (any, error) {
			t.Fatal("handler called with invalid credential")
			return nil, nil
		},
	)
	if status.Code(err) != codes.Unauthenticated {
		t.Fatalf("status code = %s, want Unauthenticated", status.Code(err))
	}
}

func TestUnaryInterceptorAllowsStandardHealthMethod(t *testing.T) {
	t.Parallel()
	authenticator := New(nil)
	called := false
	_, err := authenticator.UnaryInterceptor(
		context.Background(),
		nil,
		&grpc.UnaryServerInfo{FullMethod: "/grpc.health.v1.Health/Check"},
		func(context.Context, any) (any, error) {
			called = true
			return nil, nil
		},
	)
	if err != nil || !called {
		t.Fatalf("error = %v, called = %v", err, called)
	}
}

type capturingQuotaValidator struct {
	authorized bool
	err        error
	quotaUnits int
}

func (validator *capturingQuotaValidator) Authorize(
	context.Context,
	string,
	string,
) (bool, error) {
	return validator.authorized, validator.err
}

func (validator *capturingQuotaValidator) AuthorizeWithQuota(
	_ context.Context,
	_ string,
	_ string,
	quotaUnits int,
) (bool, error) {
	validator.quotaUnits = quotaUnits
	return validator.authorized, validator.err
}

func (validator *capturingQuotaValidator) Ready(context.Context) error {
	return validator.err
}

func TestUnaryInterceptorDerivesBoundedEthereumQuotaWeights(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name    string
		request any
		want    int
	}{
		{
			name:    "logs",
			request: grpcStructMethod("eth_getLogs"),
			want:    10,
		},
		{
			name:    "proof",
			request: grpcStructMethod("eth_getProof"),
			want:    5,
		},
		{
			name:    "call",
			request: grpcStructMethod("eth_call"),
			want:    3,
		},
		{
			name:    "fee history",
			request: grpcStructMethod("eth_feeHistory"),
			want:    3,
		},
		{
			name:    "ordinary method",
			request: grpcStructMethod("eth_blockNumber"),
			want:    1,
		},
		{
			name:    "missing method",
			request: &structpb.Struct{},
			want:    1,
		},
		{
			name: "non-string method",
			request: &structpb.Struct{Fields: map[string]*structpb.Value{
				"method": structpb.NewNumberValue(10),
			}},
			want: 1,
		},
		{
			name:    "wrong request type",
			request: "malformed",
			want:    1,
		},
		{
			name:    "nil request",
			request: nil,
			want:    1,
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			validator := &capturingQuotaValidator{authorized: true}
			authenticator := New(validator)
			handlerCalled := false
			_, err := authenticator.UnaryInterceptor(
				authenticatedContext(),
				test.request,
				&grpc.UnaryServerInfo{
					FullMethod: "/nodezuno.ethereum.v1.EthereumProxy/Call",
				},
				func(context.Context, any) (any, error) {
					handlerCalled = true
					return nil, nil
				},
			)
			if err != nil || !handlerCalled {
				t.Fatalf("error = %v, handler called = %v", err, handlerCalled)
			}
			if validator.quotaUnits != test.want {
				t.Fatalf(
					"quota units = %d, want %d",
					validator.quotaUnits,
					test.want,
				)
			}
		})
	}
}

func TestUnaryInterceptorMapsQuotaExhaustion(t *testing.T) {
	t.Parallel()
	authenticator := New(&capturingQuotaValidator{
		err: ErrQuotaExhausted,
	})
	_, err := authenticator.UnaryInterceptor(
		authenticatedContext(),
		grpcStructMethod("eth_getLogs"),
		&grpc.UnaryServerInfo{
			FullMethod: "/nodezuno.ethereum.v1.EthereumProxy/Call",
		},
		func(context.Context, any) (any, error) {
			t.Fatal("handler called after quota exhaustion")
			return nil, nil
		},
	)
	if status.Code(err) != codes.ResourceExhausted {
		t.Fatalf(
			"status code = %s, want ResourceExhausted",
			status.Code(err),
		)
	}
}

func TestUnaryInterceptorRequiresExactlyOneCanonicalServiceID(t *testing.T) {
	t.Parallel()
	token := "native-grpc-test-key-with-enough-entropy"
	digest := sha256.Sum256([]byte(token))
	authenticator := New(NewStaticDigestValidator(
		[][sha256.Size]byte{digest},
	))
	for _, values := range [][]string{
		nil,
		{"not-a-service-id"},
		{
			"11111111-1111-4111-8111-111111111111",
			"22222222-2222-4222-8222-222222222222",
		},
	} {
		metadataValues := metadata.Pairs(
			"authorization",
			"Bearer "+token,
		)
		for _, value := range values {
			metadataValues.Append("x-nodezuno-service-id", value)
		}
		ctx := metadata.NewIncomingContext(
			context.Background(),
			metadataValues,
		)
		_, err := authenticator.UnaryInterceptor(
			ctx,
			nil,
			&grpc.UnaryServerInfo{
				FullMethod: "/nodezuno.ethereum.v1.EthereumProxy/Call",
			},
			func(context.Context, any) (any, error) {
				t.Fatal("handler called without one canonical service id")
				return nil, nil
			},
		)
		if status.Code(err) != codes.Unauthenticated {
			t.Fatalf("status code = %s, want Unauthenticated", status.Code(err))
		}
	}
}

type unavailableValidator struct{}

func (unavailableValidator) Authorize(
	context.Context,
	string,
	string,
) (bool, error) {
	return false, ErrAuthorizationUnavailable
}

func (unavailableValidator) Ready(context.Context) error {
	return ErrAuthorizationUnavailable
}

func TestUnaryInterceptorFailsClosedWhenControlPlaneFails(t *testing.T) {
	t.Parallel()
	authenticator := New(unavailableValidator{})
	ctx := metadata.NewIncomingContext(
		context.Background(),
		metadata.Pairs(
			"authorization",
			"Bearer nzu_live_11111111-1111-4111-8111-111111111111_"+
				"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
			"x-nodezuno-service-id",
			"11111111-1111-4111-8111-111111111111",
		),
	)
	_, err := authenticator.UnaryInterceptor(
		ctx,
		nil,
		&grpc.UnaryServerInfo{
			FullMethod: "/nodezuno.ethereum.v1.EthereumProxy/Call",
		},
		func(context.Context, any) (any, error) {
			t.Fatal("handler called while authorization was unavailable")
			return nil, nil
		},
	)
	if status.Code(err) != codes.Unavailable {
		t.Fatalf("status code = %s, want Unavailable", status.Code(err))
	}
}

func authenticatedContext() context.Context {
	return metadata.NewIncomingContext(
		context.Background(),
		metadata.Pairs(
			"authorization",
			"Bearer "+testAPIKey,
			"x-nodezuno-service-id",
			testServiceID,
		),
	)
}

func grpcStructMethod(method string) *structpb.Struct {
	return &structpb.Struct{Fields: map[string]*structpb.Value{
		"method": structpb.NewStringValue(method),
	}}
}
