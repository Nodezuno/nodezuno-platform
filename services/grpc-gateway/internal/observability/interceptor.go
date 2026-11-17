// Package observability provides bounded structured request logging.
package observability

import (
	"context"
	"log/slog"
	"runtime/debug"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// UnaryInterceptor logs method, status, and duration without logging request
// bodies, response bodies, bearer metadata, client addresses, or upstream URLs.
func UnaryInterceptor(logger *slog.Logger) grpc.UnaryServerInterceptor {
	return func(
		ctx context.Context,
		request any,
		info *grpc.UnaryServerInfo,
		handler grpc.UnaryHandler,
	) (response any, err error) {
		startedAt := time.Now()
		defer func() {
			if recovered := recover(); recovered != nil {
				logger.Error(
					"gRPC handler panic",
					"method", info.FullMethod,
					"panic_type", "recovered",
					"stack", string(debug.Stack()),
				)
				response = nil
				err = status.Error(codes.Internal, "internal service error")
			}
			logger.Info(
				"gRPC request complete",
				"method", info.FullMethod,
				"code", status.Code(err).String(),
				"duration_ms", time.Since(startedAt).Milliseconds(),
			)
		}()
		return handler(ctx, request)
	}
}
