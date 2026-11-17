// Package auth authenticates native gRPC calls without retaining raw keys.
package auth

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"errors"
	"regexp"
	"strings"

	"github.com/nodezuno/nodezuno.com/services/grpc-gateway/internal/config"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/structpb"
)

const (
	maximumBearerTokenLength = 512
	serviceIDMetadataName    = "x-nodezuno-service-id"
)

var serviceIDPattern = regexp.MustCompile(
	`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`,
)

// Validator decides whether one key may invoke one service.
type Validator interface {
	Authorize(ctx context.Context, serviceID string, token string) (bool, error)
	Ready(ctx context.Context) error
}

// QuotaValidator atomically admits weighted calls at the control plane.
type QuotaValidator interface {
	AuthorizeWithQuota(
		ctx context.Context,
		serviceID string,
		token string,
		quotaUnits int,
	) (bool, error)
}

// Authenticator validates canonical bearer and service metadata.
type Authenticator struct {
	validator Validator
}

// New creates an immutable authenticator.
func New(validator Validator) *Authenticator {
	return &Authenticator{validator: validator}
}

// StaticDigestValidator validates an explicitly operator-managed key set.
type StaticDigestValidator struct {
	digests [][sha256.Size]byte
}

// NewStaticDigestValidator copies configured digests into an immutable validator.
func NewStaticDigestValidator(
	digests [][sha256.Size]byte,
) *StaticDigestValidator {
	copied := make([][sha256.Size]byte, len(digests))
	copy(copied, digests)
	return &StaticDigestValidator{digests: copied}
}

// Authorize compares a token to every configured digest in constant time.
func (validator *StaticDigestValidator) Authorize(
	_ context.Context,
	_ string,
	token string,
) (bool, error) {
	presented := sha256.Sum256([]byte(token))
	matched := 0
	for _, expected := range validator.digests {
		matched |= subtle.ConstantTimeCompare(presented[:], expected[:])
	}
	return matched == 1, nil
}

// Ready confirms that static mode has at least one configured digest.
func (validator *StaticDigestValidator) Ready(context.Context) error {
	if len(validator.digests) == 0 {
		return ErrAuthorizationUnavailable
	}
	return nil
}

// UnaryInterceptor requires authentication for every non-health unary call.
func (authenticator *Authenticator) UnaryInterceptor(
	ctx context.Context,
	request any,
	info *grpc.UnaryServerInfo,
	handler grpc.UnaryHandler,
) (any, error) {
	if isHealthMethod(info.FullMethod) {
		return handler(ctx, request)
	}
	authorized, err := authenticator.authorized(
		ctx,
		unaryRequestQuotaUnits(request),
	)
	if err != nil {
		if errors.Is(err, ErrQuotaExhausted) {
			return nil, status.Error(
				codes.ResourceExhausted,
				"hourly RPC quota exhausted",
			)
		}
		return nil, status.Error(
			codes.Unavailable,
			"authorization service unavailable",
		)
	}
	if !authorized {
		return nil, status.Error(
			codes.Unauthenticated,
			"valid bearer credential and service identifier required",
		)
	}
	return handler(ctx, request)
}

// StreamInterceptor protects future streaming methods while leaving the
// standard health stream available to infrastructure probes.
func (authenticator *Authenticator) StreamInterceptor(
	server any,
	stream grpc.ServerStream,
	info *grpc.StreamServerInfo,
	handler grpc.StreamHandler,
) error {
	if isHealthMethod(info.FullMethod) {
		return handler(server, stream)
	}
	authorized, err := authenticator.authorized(
		stream.Context(),
		1,
	)
	if err != nil {
		if errors.Is(err, ErrQuotaExhausted) {
			return status.Error(
				codes.ResourceExhausted,
				"hourly RPC quota exhausted",
			)
		}
		return status.Error(
			codes.Unavailable,
			"authorization service unavailable",
		)
	}
	if !authorized {
		return status.Error(
			codes.Unauthenticated,
			"valid bearer credential and service identifier required",
		)
	}
	return handler(server, stream)
}

func (authenticator *Authenticator) authorized(
	ctx context.Context,
	quotaUnits int,
) (bool, error) {
	if authenticator.validator == nil {
		return false, ErrAuthorizationUnavailable
	}
	incoming, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return false, nil
	}
	authorizationValues := incoming.Get("authorization")
	serviceIDValues := incoming.Get(serviceIDMetadataName)
	if len(authorizationValues) != 1 || len(serviceIDValues) != 1 {
		return false, nil
	}
	parts := strings.Fields(authorizationValues[0])
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return false, nil
	}
	token := parts[1]
	serviceID := serviceIDValues[0]
	if len(token) < config.MinimumConfiguredKeyLength() ||
		len(token) > maximumBearerTokenLength ||
		!serviceIDPattern.MatchString(serviceID) {
		return false, nil
	}
	if validator, ok := authenticator.validator.(QuotaValidator); ok {
		return validator.AuthorizeWithQuota(
			ctx,
			serviceID,
			token,
			quotaUnits,
		)
	}
	return authenticator.validator.Authorize(ctx, serviceID, token)
}

func unaryRequestQuotaUnits(request any) int {
	structured, ok := request.(*structpb.Struct)
	if !ok || structured == nil {
		return 1
	}
	methodValue, ok := structured.Fields["method"]
	if !ok || methodValue == nil {
		return 1
	}
	method, ok := methodValue.Kind.(*structpb.Value_StringValue)
	if !ok {
		return 1
	}
	switch method.StringValue {
	case "eth_getLogs":
		return 10
	case "eth_getProof":
		return 5
	case "eth_call", "eth_feeHistory":
		return 3
	default:
		return 1
	}
}

func isHealthMethod(fullMethod string) bool {
	return strings.HasPrefix(fullMethod, "/grpc.health.v1.Health/")
}
