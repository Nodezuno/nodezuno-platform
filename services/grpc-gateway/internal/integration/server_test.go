package integration

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/nodezuno/nodezuno.com/services/grpc-gateway/internal/auth"
	"github.com/nodezuno/nodezuno.com/services/grpc-gateway/internal/contract/ethereumv1"
	"github.com/nodezuno/nodezuno.com/services/grpc-gateway/internal/ethereum"
	"github.com/nodezuno/nodezuno.com/services/grpc-gateway/internal/upstream"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/health"
	healthv1 "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"
	"google.golang.org/protobuf/types/known/structpb"
)

type fixedCaller struct{}

func (*fixedCaller) Call(
	context.Context,
	string,
	string,
	*structpb.ListValue,
) (upstream.Response, error) {
	return upstream.Response{Result: structpb.NewStringValue("0x1")}, nil
}

func TestAuthenticatedProxyAndPublicHealth(t *testing.T) {
	token := "integration-native-grpc-key-value"
	digest := sha256.Sum256([]byte(token))
	authenticator := auth.New(auth.NewStaticDigestValidator(
		[][sha256.Size]byte{digest},
	))
	server := grpc.NewServer(
		grpc.UnaryInterceptor(authenticator.UnaryInterceptor),
		grpc.StreamInterceptor(authenticator.StreamInterceptor),
	)
	ethereumv1.RegisterEthereumProxyServer(
		server,
		ethereum.NewServer(
			&fixedCaller{},
			map[string]struct{}{"eth_chainId": {}},
			time.Second,
			2,
			slog.New(slog.NewTextHandler(io.Discard, nil)),
		),
	)
	healthServer := health.NewServer()
	healthv1.RegisterHealthServer(server, healthServer)
	healthServer.SetServingStatus("", healthv1.HealthCheckResponse_SERVING)

	listener := bufconn.Listen(1 << 20)
	go func() {
		_ = server.Serve(listener)
	}()
	t.Cleanup(server.Stop)

	connection, err := grpc.NewClient(
		"passthrough:///bufnet",
		grpc.WithContextDialer(func(
			context.Context,
			string,
		) (net.Conn, error) {
			return listener.Dial()
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		t.Fatalf("grpc.NewClient() error = %v", err)
	}
	t.Cleanup(func() { _ = connection.Close() })

	healthResponse, err := healthv1.NewHealthClient(connection).Check(
		context.Background(),
		&healthv1.HealthCheckRequest{},
	)
	if err != nil {
		t.Fatalf("Health.Check() error = %v", err)
	}
	if healthResponse.Status != healthv1.HealthCheckResponse_SERVING {
		t.Fatalf("health status = %s", healthResponse.Status)
	}

	proxy := ethereumv1.NewEthereumProxyClient(connection)
	request, _ := structpb.NewStruct(map[string]any{"method": "eth_chainId"})
	if _, err := proxy.Call(context.Background(), request); status.Code(err) != codes.Unauthenticated {
		t.Fatalf("unauthenticated status = %s", status.Code(err))
	}

	ctx := metadata.AppendToOutgoingContext(
		context.Background(),
		"authorization",
		"Bearer "+token,
		"x-nodezuno-service-id",
		"11111111-1111-4111-8111-111111111111",
	)
	response, err := proxy.Call(ctx, request)
	if err != nil {
		t.Fatalf("authenticated Call() error = %v", err)
	}
	if response.Fields["result"].GetStringValue() != "0x1" {
		t.Fatalf("response = %v", response)
	}
}

func TestProviderCredentialsStaySeparateFromCustomerBearer(t *testing.T) {
	customerToken := "integration-customer-grpc-key"
	providerAuthorization := "Bearer provider-header-secret-789"
	providerAPIKey := "provider-api-key-secret-999"
	attempts := 0
	upstreamServer := httptest.NewServer(http.HandlerFunc(func(
		writer http.ResponseWriter,
		request *http.Request,
	) {
		attempts++
		if got := request.Header.Get("Authorization"); got !=
			providerAuthorization {
			t.Errorf("upstream Authorization = %q", got)
		}
		if got := request.Header.Get("Authorization"); strings.Contains(
			got,
			customerToken,
		) {
			t.Error("customer bearer reached the Ethereum upstream")
		}
		if got := request.Header.Get("X-API-Key"); got != providerAPIKey {
			t.Errorf("upstream X-API-Key = %q", got)
		}

		var requestEnvelope struct {
			ID string `json:"id"`
		}
		if err := json.NewDecoder(request.Body).Decode(&requestEnvelope); err != nil {
			t.Errorf("decode upstream request: %v", err)
			writer.WriteHeader(http.StatusBadRequest)
			return
		}
		writer.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(writer).Encode(map[string]any{
			"jsonrpc": "2.0",
			"id":      requestEnvelope.ID,
			"error": map[string]any{
				"code": -32000,
				"message": "provider-header-secret-789 failed at " +
					"rpc-path-secret-123 using query-secret-456",
				"data": map[string]any{
					"provider": providerAPIKey,
				},
			},
		})
	}))
	defer upstreamServer.Close()

	endpoint, err := url.Parse(
		upstreamServer.URL +
			"/rpc/rpc-path-secret-123?apiKey=query-secret-456",
	)
	if err != nil {
		t.Fatalf("url.Parse() error = %v", err)
	}
	upstreamClient := upstream.NewClientWithHTTPClientAndHeaders(
		endpoint,
		upstreamServer.Client(),
		map[string]string{
			"Authorization": providerAuthorization,
			"X-API-Key":     providerAPIKey,
		},
		4096,
	)

	digest := sha256.Sum256([]byte(customerToken))
	authenticator := auth.New(auth.NewStaticDigestValidator(
		[][sha256.Size]byte{digest},
	))
	server := grpc.NewServer(
		grpc.UnaryInterceptor(authenticator.UnaryInterceptor),
		grpc.StreamInterceptor(authenticator.StreamInterceptor),
	)
	ethereumv1.RegisterEthereumProxyServer(
		server,
		ethereum.NewServer(
			upstreamClient,
			map[string]struct{}{"eth_chainId": {}},
			time.Second,
			2,
			slog.New(slog.NewTextHandler(io.Discard, nil)),
		),
	)

	listener := bufconn.Listen(1 << 20)
	go func() {
		_ = server.Serve(listener)
	}()
	t.Cleanup(server.Stop)

	connection, err := grpc.NewClient(
		"passthrough:///bufnet-provider-credentials",
		grpc.WithContextDialer(func(
			context.Context,
			string,
		) (net.Conn, error) {
			return listener.Dial()
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		t.Fatalf("grpc.NewClient() error = %v", err)
	}
	t.Cleanup(func() { _ = connection.Close() })

	request, err := structpb.NewStruct(map[string]any{
		"method":     "eth_chainId",
		"request_id": "provider-credential-check",
	})
	if err != nil {
		t.Fatalf("structpb.NewStruct() error = %v", err)
	}
	ctx := metadata.AppendToOutgoingContext(
		context.Background(),
		"authorization",
		"Bearer "+customerToken,
		"x-nodezuno-service-id",
		"11111111-1111-4111-8111-111111111111",
	)
	response, err := ethereumv1.NewEthereumProxyClient(connection).Call(
		ctx,
		request,
	)
	if err != nil {
		t.Fatalf("authenticated Call() error = %v", err)
	}
	returned, err := json.Marshal(response.AsMap())
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	for _, secret := range []string{
		"provider-header-secret-789",
		"provider-api-key-secret-999",
		"rpc-path-secret-123",
		"query-secret-456",
	} {
		if strings.Contains(string(returned), secret) {
			t.Fatalf("gRPC response disclosed configured secret %q", secret)
		}
	}
	if !strings.Contains(string(returned), "[redacted]") {
		t.Fatalf("gRPC response did not contain redaction: %s", returned)
	}
	if attempts != 1 {
		t.Fatalf("Ethereum upstream attempts = %d, want 1", attempts)
	}
}
