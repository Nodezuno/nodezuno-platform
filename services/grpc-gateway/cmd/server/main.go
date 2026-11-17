package main

import (
	"context"
	"crypto/tls"
	"errors"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/nodezuno/nodezuno.com/services/grpc-gateway/internal/auth"
	"github.com/nodezuno/nodezuno.com/services/grpc-gateway/internal/config"
	"github.com/nodezuno/nodezuno.com/services/grpc-gateway/internal/contract/ethereumv1"
	"github.com/nodezuno/nodezuno.com/services/grpc-gateway/internal/ethereum"
	"github.com/nodezuno/nodezuno.com/services/grpc-gateway/internal/observability"
	"github.com/nodezuno/nodezuno.com/services/grpc-gateway/internal/readiness"
	"github.com/nodezuno/nodezuno.com/services/grpc-gateway/internal/upstream"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/health"
	healthv1 "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/keepalive"
)

const livenessServiceName = "nodezuno-native-grpc-liveness"

func main() {
	logger := newLogger(os.Getenv("LOG_LEVEL"))
	configuration, err := config.Load(os.Getenv)
	if err != nil {
		logger.Error("invalid native gRPC configuration", "error", err)
		os.Exit(1)
	}

	listener, err := net.Listen("tcp", configuration.ListenAddress)
	if err != nil {
		logger.Error("could not bind native gRPC listener", "error", err)
		os.Exit(1)
	}

	var validator auth.Validator
	switch configuration.AuthMode {
	case config.AuthModeControlPlane:
		if configuration.ControlPlane == nil {
			logger.Error("control-plane authentication configuration is missing")
			os.Exit(1)
		}
		validator = auth.NewControlPlaneValidator(
			configuration.ControlPlane.URL,
			configuration.ControlPlane.Secret,
			configuration.ControlPlane.Timeout,
		)
	case config.AuthModeStaticDigest:
		validator = auth.NewStaticDigestValidator(
			configuration.APIKeyDigests,
		)
	default:
		logger.Error("unsupported native gRPC authentication mode")
		os.Exit(1)
	}
	authenticator := auth.New(validator)
	readinessGate := readiness.NewGate()
	options := []grpc.ServerOption{
		grpc.ChainUnaryInterceptor(
			observability.UnaryInterceptor(logger),
			readinessGate.UnaryInterceptor,
			authenticator.UnaryInterceptor,
		),
		grpc.ChainStreamInterceptor(
			readinessGate.StreamInterceptor,
			authenticator.StreamInterceptor,
		),
		grpc.MaxRecvMsgSize(configuration.MaxRequestBytes),
		grpc.MaxSendMsgSize(configuration.MaxResponseBytes),
		grpc.MaxHeaderListSize(16 << 10),
		grpc.MaxConcurrentStreams(uint32(configuration.MaxConcurrentCalls)),
		grpc.ConnectionTimeout(5 * time.Second),
		grpc.KeepaliveEnforcementPolicy(keepalive.EnforcementPolicy{
			MinTime:             30 * time.Second,
			PermitWithoutStream: false,
		}),
		grpc.KeepaliveParams(keepalive.ServerParameters{
			MaxConnectionIdle:     10 * time.Minute,
			MaxConnectionAge:      30 * time.Minute,
			MaxConnectionAgeGrace: 5 * time.Minute,
			Time:                  2 * time.Minute,
			Timeout:               20 * time.Second,
		}),
	}
	if configuration.TLSCertificateFile != "" {
		certificate, err := tls.LoadX509KeyPair(
			configuration.TLSCertificateFile,
			configuration.TLSPrivateKeyFile,
		)
		if err != nil {
			logger.Error("could not load native gRPC TLS identity", "error", err)
			os.Exit(1)
		}
		options = append(options, grpc.Creds(credentials.NewTLS(&tls.Config{
			MinVersion:   tls.VersionTLS12,
			Certificates: []tls.Certificate{certificate},
		})))
	}

	grpcServer := grpc.NewServer(options...)
	upstreamTargets := make([]upstream.Target, len(configuration.Upstreams))
	for index, configured := range configuration.Upstreams {
		upstreamTargets[index] = upstream.Target{
			Caller: upstream.NewClientWithHeaders(
				configured.URL,
				configured.Headers,
				int64(configuration.MaxResponseBytes),
			),
			Timeout: configured.Timeout,
		}
	}
	upstreamCaller, err := upstream.NewFailover(upstreamTargets)
	if err != nil {
		logger.Error("invalid native gRPC upstream set")
		os.Exit(1)
	}
	proxyServer := ethereum.NewServer(
		upstreamCaller,
		configuration.AllowedMethods,
		configuration.UpstreamTimeout,
		configuration.MaxConcurrentCalls,
		logger,
	)
	ethereumv1.RegisterEthereumProxyServer(grpcServer, proxyServer)

	healthServer := health.NewServer()
	healthv1.RegisterHealthServer(grpcServer, healthServer)
	healthServer.SetServingStatus(
		livenessServiceName,
		healthv1.HealthCheckResponse_SERVING,
	)
	healthServer.SetServingStatus(
		"",
		healthv1.HealthCheckResponse_NOT_SERVING,
	)
	healthServer.SetServingStatus(
		ethereumv1.ServiceName,
		healthv1.HealthCheckResponse_NOT_SERVING,
	)

	readinessContext, stopReadiness := context.WithCancel(
		context.Background(),
	)
	defer stopReadiness()
	go readiness.Run(
		readinessContext,
		healthServer,
		upstreamCaller,
		validator,
		readinessGate,
		configuration.UpstreamTimeout,
		logger,
	)

	serveErrors := make(chan error, 1)
	go func() {
		serveErrors <- grpcServer.Serve(listener)
	}()
	logger.Info(
		"native gRPC service started",
		"listen_address", configuration.ListenAddress,
		"tls_at_process", configuration.TLSCertificateFile != "",
		"auth_mode", string(configuration.AuthMode),
		"allowed_method_count", len(configuration.AllowedMethods),
		"upstream_count", len(configuration.Upstreams),
	)

	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)
	select {
	case received := <-signals:
		logger.Info("native gRPC shutdown requested", "signal", received.String())
	case err := <-serveErrors:
		if err != nil && !errors.Is(err, grpc.ErrServerStopped) {
			logger.Error("native gRPC server stopped unexpectedly", "error", err)
		}
	}

	stopReadiness()
	healthServer.Shutdown()
	stopped := make(chan struct{})
	go func() {
		grpcServer.GracefulStop()
		close(stopped)
	}()
	select {
	case <-stopped:
		logger.Info("native gRPC service stopped")
	case <-time.After(configuration.ShutdownTimeout):
		logger.Warn("native gRPC graceful shutdown timed out")
		grpcServer.Stop()
		<-stopped
	}
}

func newLogger(rawLevel string) *slog.Logger {
	level := slog.LevelInfo
	switch strings.ToLower(strings.TrimSpace(rawLevel)) {
	case "debug":
		level = slog.LevelDebug
	case "warn", "warning":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	}
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: level,
	}))
}
