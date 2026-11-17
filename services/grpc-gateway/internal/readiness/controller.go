// Package readiness reconciles gRPC health with real dependencies.
package readiness

import (
	"context"
	"log/slog"
	"strings"
	"sync/atomic"
	"time"

	"github.com/nodezuno/nodezuno.com/services/grpc-gateway/internal/auth"
	"github.com/nodezuno/nodezuno.com/services/grpc-gateway/internal/contract/ethereumv1"
	"github.com/nodezuno/nodezuno.com/services/grpc-gateway/internal/upstream"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/health"
	healthv1 "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/structpb"
)

const defaultProbeInterval = 15 * time.Second

// Gate fails closed while real service dependencies are not ready.
type Gate struct {
	ready atomic.Bool
}

// NewGate creates a gate in the non-serving state.
func NewGate() *Gate {
	return &Gate{}
}

// UnaryInterceptor blocks non-health calls while readiness is false.
func (gate *Gate) UnaryInterceptor(
	ctx context.Context,
	request any,
	info *grpc.UnaryServerInfo,
	handler grpc.UnaryHandler,
) (any, error) {
	if isHealthMethod(info.FullMethod) || gate.ready.Load() {
		return handler(ctx, request)
	}
	return nil, status.Error(
		codes.Unavailable,
		"native gRPC service is not ready",
	)
}

// StreamInterceptor blocks non-health streams while readiness is false.
func (gate *Gate) StreamInterceptor(
	server any,
	stream grpc.ServerStream,
	info *grpc.StreamServerInfo,
	handler grpc.StreamHandler,
) error {
	if isHealthMethod(info.FullMethod) || gate.ready.Load() {
		return handler(server, stream)
	}
	return status.Error(
		codes.Unavailable,
		"native gRPC service is not ready",
	)
}

// Run continuously reconciles the standard health service with the configured
// authorization boundary and an actual Ethereum mainnet upstream response.
func Run(
	ctx context.Context,
	healthServer *health.Server,
	caller upstream.Caller,
	validator auth.Validator,
	gate *Gate,
	timeout time.Duration,
	logger *slog.Logger,
) {
	if timeout > 5*time.Second {
		timeout = 5 * time.Second
	}
	serving := false
	reconcile := func() {
		ready := probe(ctx, caller, validator, timeout)
		gate.ready.Store(ready)
		if ready {
			healthServer.SetServingStatus(
				"",
				healthv1.HealthCheckResponse_SERVING,
			)
			healthServer.SetServingStatus(
				ethereumv1.ServiceName,
				healthv1.HealthCheckResponse_SERVING,
			)
		} else {
			healthServer.SetServingStatus(
				"",
				healthv1.HealthCheckResponse_NOT_SERVING,
			)
			healthServer.SetServingStatus(
				ethereumv1.ServiceName,
				healthv1.HealthCheckResponse_NOT_SERVING,
			)
		}
		if ready != serving {
			logger.Info(
				"native gRPC readiness changed",
				"serving", ready,
			)
			serving = ready
		}
	}

	reconcile()
	ticker := time.NewTicker(defaultProbeInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			reconcile()
		}
	}
}

func isHealthMethod(fullMethod string) bool {
	return strings.HasPrefix(fullMethod, "/grpc.health.v1.Health/")
}

func probe(
	parent context.Context,
	caller upstream.Caller,
	validator auth.Validator,
	timeout time.Duration,
) bool {
	if caller == nil || validator == nil {
		return false
	}
	ctx, cancel := context.WithTimeout(parent, timeout)
	defer cancel()
	if err := validator.Ready(ctx); err != nil {
		return false
	}
	response, err := caller.Call(
		ctx,
		"eth_chainId",
		"nodezuno-readiness",
		&structpb.ListValue{},
	)
	if err != nil || response.Error != nil || response.Result == nil {
		return false
	}
	return response.Result.GetStringValue() == "0x1"
}
