package upstream

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"google.golang.org/protobuf/types/known/structpb"
)

func TestClientForwardsJSONRPCWithoutInboundCredentials(t *testing.T) {
	t.Parallel()
	var received requestEnvelope
	server := httptest.NewServer(http.HandlerFunc(func(
		writer http.ResponseWriter,
		request *http.Request,
	) {
		if request.Header.Get("Authorization") != "" {
			t.Error("authorization header was forwarded upstream")
		}
		if request.Header.Get("Content-Type") != "application/json" {
			t.Errorf("Content-Type = %q", request.Header.Get("Content-Type"))
		}
		body, err := io.ReadAll(request.Body)
		if err != nil {
			t.Errorf("read request: %v", err)
			writer.WriteHeader(http.StatusInternalServerError)
			return
		}
		if err := json.Unmarshal(body, &received); err != nil {
			t.Errorf("decode request: %v", err)
			writer.WriteHeader(http.StatusBadRequest)
			return
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(
			`{"jsonrpc":"2.0","id":"request-1","result":"0x1"}`,
		))
	}))
	defer server.Close()

	client := newTestClient(t, server, 4096)
	params := &structpb.ListValue{Values: []*structpb.Value{
		structpb.NewStringValue("latest"),
	}}
	response, err := client.Call(
		context.Background(),
		"eth_blockNumber",
		"request-1",
		params,
	)
	if err != nil {
		t.Fatalf("Call() error = %v", err)
	}
	if received.JSONRPC != "2.0" ||
		received.Method != "eth_blockNumber" ||
		received.ID != "request-1" {
		t.Fatalf("received envelope = %#v", received)
	}
	if response.Result.GetStringValue() != "0x1" || response.Error != nil {
		t.Fatalf("response = %#v", response)
	}
}

func TestClientReturnsJSONRPCErrorAsData(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(
		writer http.ResponseWriter,
		_ *http.Request,
	) {
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(
			`{"jsonrpc":"2.0","id":"request-2","error":{"code":-32601,"message":"method not found","data":{"provider":"test"}}}`,
		))
	}))
	defer server.Close()

	client := newTestClient(t, server, 4096)
	response, err := client.Call(
		context.Background(),
		"eth_chainId",
		"request-2",
		&structpb.ListValue{},
	)
	if err != nil {
		t.Fatalf("Call() error = %v", err)
	}
	if response.Error == nil ||
		response.Error.Code != -32601 ||
		response.Error.Message != "method not found" {
		t.Fatalf("response error = %#v", response.Error)
	}
	if response.Error.Data.GetStructValue().Fields["provider"].GetStringValue() != "test" {
		t.Fatalf("response error data = %#v", response.Error.Data)
	}
}

func TestClientRejectsMismatchedResponseID(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(
		writer http.ResponseWriter,
		_ *http.Request,
	) {
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(
			`{"jsonrpc":"2.0","id":"another-request","result":"0x1"}`,
		))
	}))
	defer server.Close()

	client := newTestClient(t, server, 4096)
	_, err := client.Call(
		context.Background(),
		"eth_chainId",
		"request-3",
		&structpb.ListValue{},
	)
	if !errors.Is(err, ErrInvalidResponse) {
		t.Fatalf("Call() error = %v, want ErrInvalidResponse", err)
	}
}

func TestClientBoundsResponseBody(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(
		writer http.ResponseWriter,
		_ *http.Request,
	) {
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(strings.Repeat("x", 65)))
	}))
	defer server.Close()

	client := newTestClient(t, server, 64)
	_, err := client.Call(
		context.Background(),
		"eth_chainId",
		"request-4",
		&structpb.ListValue{},
	)
	if !errors.Is(err, ErrResponseTooLarge) {
		t.Fatalf("Call() error = %v, want ErrResponseTooLarge", err)
	}
}

func TestClientUsesOnlyImmutableConfiguredProviderCredentials(t *testing.T) {
	t.Parallel()
	configuredHeaders := map[string]string{
		"Authorization": "Bearer provider-auth-secret",
		"X-API-Key":     "provider-api-key-secret",
	}
	server := httptest.NewServer(http.HandlerFunc(func(
		writer http.ResponseWriter,
		request *http.Request,
	) {
		if got := request.Header.Get("Authorization"); got !=
			"Bearer provider-auth-secret" {
			t.Errorf("Authorization = %q", got)
		}
		if got := request.Header.Get("X-API-Key"); got !=
			"provider-api-key-secret" {
			t.Errorf("X-API-Key = %q", got)
		}
		if got := request.Header.Get("Content-Type"); got != "application/json" {
			t.Errorf("Content-Type = %q", got)
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(
			`{"jsonrpc":"2.0","id":"credential-check","result":"0x1"}`,
		))
	}))
	defer server.Close()

	client := newTestClientWithHeaders(t, server, configuredHeaders, 4096)
	configuredHeaders["Authorization"] = "Bearer mutated-secret"
	configuredHeaders["X-API-Key"] = "mutated-api-key"
	_, err := client.Call(
		context.Background(),
		"eth_chainId",
		"credential-check",
		&structpb.ListValue{},
	)
	if err != nil {
		t.Fatalf("Call() error = %v", err)
	}
}

func TestClientRequiresJSONResponseContentType(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name        string
		contentType string
		accepted    bool
	}{
		{
			name:        "standard JSON with charset",
			contentType: "application/json; charset=utf-8",
			accepted:    true,
		},
		{
			name:        "JSON RPC",
			contentType: "application/json-rpc",
			accepted:    true,
		},
		{
			name:        "vendor JSON",
			contentType: "application/vnd.ethereum+json",
			accepted:    true,
		},
		{name: "missing"},
		{name: "HTML", contentType: "text/html"},
		{name: "malformed", contentType: "application/json; charset"},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			server := httptest.NewServer(http.HandlerFunc(func(
				writer http.ResponseWriter,
				_ *http.Request,
			) {
				if test.contentType != "" {
					writer.Header().Set("Content-Type", test.contentType)
				}
				_, _ = writer.Write([]byte(
					`{"jsonrpc":"2.0","id":"content-type-check","result":"0x1"}`,
				))
			}))
			defer server.Close()

			client := newTestClient(t, server, 4096)
			_, err := client.Call(
				context.Background(),
				"eth_chainId",
				"content-type-check",
				&structpb.ListValue{},
			)
			if test.accepted && err != nil {
				t.Fatalf("Call() error = %v", err)
			}
			if !test.accepted && !errors.Is(err, ErrInvalidResponse) {
				t.Fatalf(
					"Call() error = %v, want ErrInvalidResponse",
					err,
				)
			}
		})
	}
}

func TestClientRedactsConfiguredSecretsFromUpstreamErrors(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(
		writer http.ResponseWriter,
		_ *http.Request,
	) {
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(
			`{"jsonrpc":"2.0","id":"redaction-check","error":{"code":-32000,"message":"failed at rpc-path-secret-123 with query-secret-456 and Bearer header-secret-789","data":{"url":"/rpc/rpc-path-secret-123?apiKey=query-secret-456","nested":{"header-secret-789":["api-key-secret-999"],"authorization":"Bearer header-secret-789"}}}}`,
		))
	}))
	defer server.Close()

	endpoint, err := url.Parse(
		server.URL +
			"/rpc/rpc-path-secret-123?apiKey=query-secret-456",
	)
	if err != nil {
		t.Fatalf("url.Parse() error = %v", err)
	}
	client := NewClientWithHTTPClientAndHeaders(
		endpoint,
		server.Client(),
		map[string]string{
			"Authorization": "Bearer header-secret-789",
			"X-API-Key":     "api-key-secret-999",
		},
		4096,
	)
	response, err := client.Call(
		context.Background(),
		"eth_chainId",
		"redaction-check",
		&structpb.ListValue{},
	)
	if err != nil {
		t.Fatalf("Call() error = %v", err)
	}
	if response.Error == nil {
		t.Fatal("Call() did not return the JSON-RPC error")
	}
	data, err := json.Marshal(response.Error.Data.AsInterface())
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	returned := response.Error.Message + string(data)
	for _, secret := range []string{
		"rpc-path-secret-123",
		"query-secret-456",
		"header-secret-789",
		"api-key-secret-999",
		"Bearer header-secret-789",
	} {
		if strings.Contains(returned, secret) {
			t.Fatalf("upstream error disclosed configured secret %q", secret)
		}
	}
	if !strings.Contains(returned, "[redacted]") {
		t.Fatalf("upstream error was not visibly redacted: %s", returned)
	}
}

func TestClientReturnsCredentialFreeTransportErrors(t *testing.T) {
	t.Parallel()
	endpoint, err := url.Parse(
		"https://rpc.example.invalid/rpc-path-secret-123?key=query-secret-456",
	)
	if err != nil {
		t.Fatalf("url.Parse() error = %v", err)
	}
	attempts := 0
	client := NewClientWithHTTPClientAndHeaders(
		endpoint,
		&http.Client{Transport: roundTripFunc(func(
			request *http.Request,
		) (*http.Response, error) {
			attempts++
			if request.GetBody != nil {
				t.Error("request body can be replayed")
			}
			return nil, fmt.Errorf(
				"dial %s using %s",
				request.URL.String(),
				request.Header.Get("Authorization"),
			)
		})},
		map[string]string{
			"Authorization": "Bearer header-secret-789",
		},
		4096,
	)
	_, err = client.Call(
		context.Background(),
		"eth_chainId",
		"transport-error-check",
		&structpb.ListValue{},
	)
	if !errors.Is(err, ErrUnavailable) {
		t.Fatalf("Call() error = %v, want ErrUnavailable", err)
	}
	if attempts != 1 {
		t.Fatalf("transport attempts = %d, want 1", attempts)
	}
	for _, secret := range []string{
		"rpc-path-secret-123",
		"query-secret-456",
		"header-secret-789",
	} {
		if strings.Contains(err.Error(), secret) {
			t.Fatalf("transport error disclosed configured secret %q", secret)
		}
	}
}

func TestClientDoesNotFollowUpstreamRedirects(t *testing.T) {
	t.Parallel()
	attempts := 0
	server := httptest.NewServer(http.HandlerFunc(func(
		writer http.ResponseWriter,
		request *http.Request,
	) {
		attempts++
		if request.URL.Path == "/redirected" {
			t.Error("client followed an upstream redirect")
		}
		http.Redirect(
			writer,
			request,
			"/redirected",
			http.StatusTemporaryRedirect,
		)
	}))
	defer server.Close()

	client := newTestClient(t, server, 4096)
	_, err := client.Call(
		context.Background(),
		"eth_chainId",
		"redirect-check",
		&structpb.ListValue{},
	)
	var statusError *HTTPStatusError
	if !errors.As(err, &statusError) ||
		statusError.StatusCode != http.StatusTemporaryRedirect {
		t.Fatalf("Call() error = %v, want HTTP 307", err)
	}
	if attempts != 1 {
		t.Fatalf("upstream attempts = %d, want 1", attempts)
	}
}

func newTestClient(t *testing.T, server *httptest.Server, maxResponse int64) *Client {
	t.Helper()
	endpoint, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("url.Parse() error = %v", err)
	}
	return NewClientWithHTTPClient(endpoint, server.Client(), maxResponse)
}

func newTestClientWithHeaders(
	t *testing.T,
	server *httptest.Server,
	headers map[string]string,
	maxResponse int64,
) *Client {
	t.Helper()
	endpoint, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("url.Parse() error = %v", err)
	}
	return NewClientWithHTTPClientAndHeaders(
		endpoint,
		server.Client(),
		headers,
		maxResponse,
	)
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (function roundTripFunc) RoundTrip(
	request *http.Request,
) (*http.Response, error) {
	return function(request)
}
