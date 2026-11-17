package config

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"testing"
	"time"
)

func TestLoadUsesSafeDefaults(t *testing.T) {
	t.Parallel()
	token := strings.Repeat("a", 32)
	digest := sha256.Sum256([]byte(token))
	configuration, err := Load(environment(map[string]string{
		"ETHEREUM_RPC_URL":        "https://rpc.example.invalid/project",
		"NODEZUNO_GRPC_AUTH_MODE": "static-digest",
		"GRPC_API_KEY_SHA256":     hex.EncodeToString(digest[:]),
	}))
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if configuration.ListenAddress != ":50051" {
		t.Fatalf("ListenAddress = %q", configuration.ListenAddress)
	}
	if configuration.UpstreamTimeout != 12*time.Second {
		t.Fatalf("UpstreamTimeout = %s", configuration.UpstreamTimeout)
	}
	if len(configuration.Upstreams) != 1 {
		t.Fatalf("Upstreams length = %d, want 1", len(configuration.Upstreams))
	}
	if configuration.Upstreams[0].Name != "compatibility" ||
		configuration.Upstreams[0].Timeout != 12*time.Second {
		t.Fatalf("compatibility upstream = %#v", configuration.Upstreams[0])
	}
	if _, allowed := configuration.AllowedMethods["eth_chainId"]; !allowed {
		t.Fatal("eth_chainId is not enabled by default")
	}
	if _, allowed := configuration.AllowedMethods["eth_sendRawTransaction"]; allowed {
		t.Fatal("eth_sendRawTransaction must remain disabled")
	}
}

func TestLoadUsesCloudRunPort(t *testing.T) {
	t.Parallel()
	digest := sha256.Sum256([]byte(strings.Repeat("b", 32)))
	configuration, err := Load(environment(map[string]string{
		"PORT":                    "8080",
		"ETHEREUM_RPC_URL":        "https://rpc.example.invalid",
		"NODEZUNO_GRPC_AUTH_MODE": "static-digest",
		"GRPC_API_KEY_SHA256":     hex.EncodeToString(digest[:]),
	}))
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if configuration.ListenAddress != ":8080" {
		t.Fatalf("ListenAddress = %q", configuration.ListenAddress)
	}
}

func TestLoadRejectsMissingRequiredConfiguration(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name   string
		values map[string]string
		want   string
	}{
		{
			name: "missing upstream",
			values: map[string]string{
				"NODEZUNO_GRPC_AUTH_MODE": "static-digest",
				"GRPC_API_KEY_SHA256":     strings.Repeat("0", 64),
			},
			want: "ETHEREUM_RPC_URL is required",
		},
		{
			name: "missing key",
			values: map[string]string{
				"ETHEREUM_RPC_URL":        "https://rpc.example.invalid",
				"NODEZUNO_GRPC_AUTH_MODE": "static-digest",
			},
			want: "GRPC_API_KEY_SHA256 is required",
		},
		{
			name: "plain HTTP by default",
			values: map[string]string{
				"ETHEREUM_RPC_URL":        "http://rpc.example.invalid",
				"NODEZUNO_GRPC_AUTH_MODE": "static-digest",
				"GRPC_API_KEY_SHA256":     strings.Repeat("0", 64),
			},
			want: "must use HTTPS",
		},
		{
			name: "partial TLS identity",
			values: map[string]string{
				"ETHEREUM_RPC_URL":        "https://rpc.example.invalid",
				"NODEZUNO_GRPC_AUTH_MODE": "static-digest",
				"GRPC_API_KEY_SHA256":     strings.Repeat("0", 64),
				"GRPC_TLS_CERT_FILE":      "/secrets/server.crt",
			},
			want: "must be configured together",
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			_, err := Load(environment(test.values))
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("Load() error = %v, want containing %q", err, test.want)
			}
		})
	}
}

func TestLoadAllowsExplicitHTTPAndMethodSet(t *testing.T) {
	t.Parallel()
	configuration, err := Load(environment(map[string]string{
		"ETHEREUM_RPC_URL":             "http://127.0.0.1:8545",
		"GRPC_ALLOW_INSECURE_UPSTREAM": "true",
		"NODEZUNO_GRPC_AUTH_MODE":      "static-digest",
		"GRPC_API_KEY_SHA256":          strings.Repeat("a", 64),
		"ETHEREUM_ALLOWED_METHODS":     "eth_chainId,eth_getLogs",
		"GRPC_UPSTREAM_TIMEOUT":        "3s",
	}))
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if !configuration.AllowInsecureUpstream {
		t.Fatal("AllowInsecureUpstream = false")
	}
	if _, allowed := configuration.AllowedMethods["eth_getLogs"]; !allowed {
		t.Fatal("explicit bounded read method is not enabled")
	}
	if len(configuration.AllowedMethods) != 2 {
		t.Fatalf("AllowedMethods length = %d", len(configuration.AllowedMethods))
	}
}

func TestParseAllowedMethodsRejectsDangerousOrUnknownMethods(t *testing.T) {
	t.Parallel()
	for _, method := range []string{
		"admin_nodeInfo",
		"anvil_mine",
		"debug_traceTransaction",
		"engine_newPayloadV3",
		"evm_mine",
		"hardhat_reset",
		"miner_start",
		"parity_signMessage",
		"personal_sign",
		"trace_call",
		"txpool_content",
		"wallet_addEthereumChain",
		"eth_accounts",
		"eth_coinbase",
		"eth_getFilterChanges",
		"eth_getFilterLogs",
		"eth_hashrate",
		"eth_mining",
		"eth_newBlockFilter",
		"eth_newFilter",
		"eth_newPendingTransactionFilter",
		"eth_sendRawTransaction",
		"eth_sendTransaction",
		"eth_sign",
		"eth_signTransaction",
		"eth_signTypedData_v4",
		"eth_submitHashrate",
		"eth_submitWork",
		"eth_subscribe",
		"eth_uninstallFilter",
		"eth_unsubscribe",
		"eth_unknownRead",
	} {
		method := method
		t.Run(method, func(t *testing.T) {
			t.Parallel()
			_, err := parseAllowedMethods(method)
			if err == nil || !strings.Contains(err.Error(), "read-only beta policy") {
				t.Fatalf(
					"parseAllowedMethods(%q) error = %v, want policy rejection",
					method,
					err,
				)
			}
		})
	}
}

func TestParseAllowedMethodsAcceptsPublishedBoundedReads(t *testing.T) {
	t.Parallel()
	methods, err := parseAllowedMethods(
		"eth_call,eth_estimateGas,eth_feeHistory,eth_getLogs,eth_getProof",
	)
	if err != nil {
		t.Fatalf("parseAllowedMethods() error = %v", err)
	}
	if len(methods) != 5 {
		t.Fatalf("method count = %d, want 5", len(methods))
	}
}

func TestLoadConfiguresOperatorUpstreamHeaders(t *testing.T) {
	t.Parallel()
	configuration, err := Load(environment(map[string]string{
		"ETHEREUM_RPC_URL":          "https://10.20.30.40/rpc/provider-project-token",
		"ETHEREUM_RPC_HEADERS_JSON": `{"Authorization":"Bearer provider-secret-token","X-API-Key":"provider-api-key-value"}`,
		"NODEZUNO_GRPC_AUTH_MODE":   "static-digest",
		"GRPC_API_KEY_SHA256":       strings.Repeat("a", 64),
	}))
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if len(configuration.Upstreams) != 1 {
		t.Fatalf("Upstreams length = %d, want 1", len(configuration.Upstreams))
	}
	configuredUpstream := configuration.Upstreams[0]
	if configuredUpstream.URL.Hostname() != "10.20.30.40" {
		t.Fatalf("Upstream URL hostname = %q", configuredUpstream.URL.Hostname())
	}
	if configuredUpstream.Headers["Authorization"] !=
		"Bearer provider-secret-token" {
		t.Fatal("Authorization provider credential was not retained")
	}
	if configuredUpstream.Headers["X-API-Key"] !=
		"provider-api-key-value" {
		t.Fatal("X-API-Key provider credential was not retained")
	}
}

func TestLoadConfiguresOrderedEthereumUpstreams(t *testing.T) {
	t.Parallel()
	configuration, err := Load(environment(map[string]string{
		"ETHEREUM_UPSTREAMS_JSON": `[
			{
				"name":"primary",
				"url":"https://primary.rpc.invalid/v1/project-token",
				"timeout":"1500ms",
				"headers":{"Authorization":"Bearer primary-provider-token"}
			},
			{
				"name":"secondary",
				"url":"https://secondary.rpc.invalid/mainnet",
				"timeout":"3s",
				"headers":{"X-API-Key":"secondary-provider-token"}
			}
		]`,
		"GRPC_UPSTREAM_TIMEOUT":   "9s",
		"NODEZUNO_GRPC_AUTH_MODE": "static-digest",
		"GRPC_API_KEY_SHA256":     strings.Repeat("a", 64),
	}))
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if len(configuration.Upstreams) != 2 {
		t.Fatalf("Upstreams length = %d, want 2", len(configuration.Upstreams))
	}
	primary := configuration.Upstreams[0]
	secondary := configuration.Upstreams[1]
	if primary.Name != "primary" ||
		primary.URL.Hostname() != "primary.rpc.invalid" ||
		primary.Timeout != 1500*time.Millisecond ||
		primary.Headers["Authorization"] != "Bearer primary-provider-token" {
		t.Fatalf("primary upstream was not preserved in order: %#v", primary)
	}
	if secondary.Name != "secondary" ||
		secondary.URL.Hostname() != "secondary.rpc.invalid" ||
		secondary.Timeout != 3*time.Second ||
		secondary.Headers["X-API-Key"] != "secondary-provider-token" {
		t.Fatalf("secondary upstream was not preserved in order: %#v", secondary)
	}
	if configuration.UpstreamTimeout != 9*time.Second {
		t.Fatalf("UpstreamTimeout = %s, want 9s", configuration.UpstreamTimeout)
	}
}

func TestLoadRejectsMixedEthereumUpstreamModes(t *testing.T) {
	t.Parallel()
	_, err := Load(environment(map[string]string{
		"ETHEREUM_UPSTREAMS_JSON": `[{
			"name":"primary",
			"url":"https://primary.rpc.invalid",
			"timeout":"2s",
			"headers":{}
		}]`,
		"ETHEREUM_RPC_URL":        "https://compatibility.rpc.invalid",
		"NODEZUNO_GRPC_AUTH_MODE": "static-digest",
		"GRPC_API_KEY_SHA256":     strings.Repeat("a", 64),
	}))
	if err == nil || !strings.Contains(err.Error(), "mutually exclusive") {
		t.Fatalf("Load() error = %v, want mutual exclusion", err)
	}
}

func TestParseEthereumUpstreamsRejectsDuplicateOrUnsafeInputs(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		raw  string
		want string
	}{
		{
			name: "empty array",
			raw:  `[]`,
			want: "at least one",
		},
		{
			name: "too many entries",
			raw: `[
				{"name":"one","url":"https://one.invalid","timeout":"1s","headers":{}},
				{"name":"two","url":"https://two.invalid","timeout":"1s","headers":{}},
				{"name":"three","url":"https://three.invalid","timeout":"1s","headers":{}},
				{"name":"four","url":"https://four.invalid","timeout":"1s","headers":{}},
				{"name":"five","url":"https://five.invalid","timeout":"1s","headers":{}}
			]`,
			want: "at most 4",
		},
		{
			name: "duplicate entry field",
			raw: `[{
				"name":"primary",
				"name":"secondary",
				"url":"https://primary.invalid",
				"timeout":"1s",
				"headers":{}
			}]`,
			want: "duplicate entry field",
		},
		{
			name: "unknown entry field",
			raw: `[{
				"name":"primary",
				"url":"https://primary.invalid",
				"timeout":"1s",
				"headers":{},
				"weight":100
			}]`,
			want: "unknown entry field",
		},
		{
			name: "duplicate name",
			raw: `[
				{"name":"primary","url":"https://one.invalid","timeout":"1s","headers":{}},
				{"name":"primary","url":"https://two.invalid","timeout":"1s","headers":{}}
			]`,
			want: "duplicate name",
		},
		{
			name: "duplicate URL",
			raw: `[
				{"name":"primary","url":"https://SAME.invalid/rpc","timeout":"1s","headers":{}},
				{"name":"secondary","url":"https://same.invalid/rpc","timeout":"1s","headers":{}}
			]`,
			want: "duplicate URL",
		},
		{
			name: "plain HTTP",
			raw: `[{
				"name":"primary",
				"url":"http://primary.invalid",
				"timeout":"1s",
				"headers":{}
			}]`,
			want: "exact HTTPS URL",
		},
		{
			name: "URL user information",
			raw: `[{
				"name":"primary",
				"url":"https://user:provider-secret@primary.invalid",
				"timeout":"1s",
				"headers":{}
			}]`,
			want: "without user information",
		},
		{
			name: "timeout below bound",
			raw: `[{
				"name":"primary",
				"url":"https://primary.invalid",
				"timeout":"99ms",
				"headers":{}
			}]`,
			want: "between 100ms and 30s",
		},
		{
			name: "unsafe header",
			raw: `[{
				"name":"primary",
				"url":"https://primary.invalid/provider-secret",
				"timeout":"1s",
				"headers":{"X-Forwarded-For":"provider-secret-value"}
			}]`,
			want: "invalid headers",
		},
		{
			name: "missing headers",
			raw: `[{
				"name":"primary",
				"url":"https://primary.invalid",
				"timeout":"1s"
			}]`,
			want: "missing required field headers",
		},
		{
			name: "trailing document",
			raw:  `[{"name":"primary","url":"https://primary.invalid","timeout":"1s","headers":{}}] []`,
			want: "exactly one JSON array",
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			_, err := parseEthereumUpstreamsJSON(test.raw)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf(
					"parseEthereumUpstreamsJSON() error = %v, want containing %q",
					err,
					test.want,
				)
			}
			for _, secret := range []string{
				"provider-secret",
				"provider-secret-value",
				"primary.invalid/provider-secret",
			} {
				if strings.Contains(err.Error(), secret) {
					t.Fatalf("configuration error disclosed %q: %v", secret, err)
				}
			}
		})
	}
}

func TestParseEthereumUpstreamsBoundsRawConfiguration(t *testing.T) {
	t.Parallel()
	_, err := parseEthereumUpstreamsJSON(
		strings.Repeat(" ", maximumUpstreamsJSONBytes+1),
	)
	if err == nil || !strings.Contains(err.Error(), "at most") {
		t.Fatalf("parseEthereumUpstreamsJSON() error = %v, want bounded rejection", err)
	}
}

func TestParseUpstreamHeadersRejectsUnsafeConfiguration(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		raw  string
		want string
	}{
		{
			name: "array",
			raw:  `["Authorization","Bearer provider-secret"]`,
			want: "one JSON object",
		},
		{
			name: "nested value",
			raw:  `{"Authorization":{"value":"provider-secret"}}`,
			want: "string value",
		},
		{
			name: "case-insensitive duplicate",
			raw:  `{"Authorization":"Bearer provider-secret","authorization":"Bearer other-secret"}`,
			want: "duplicate header",
		},
		{
			name: "fixed content type",
			raw:  `{"Content-Type":"application/something"}`,
			want: "cannot configure",
		},
		{
			name: "forwarding identity",
			raw:  `{"X-Forwarded-For":"203.0.113.9"}`,
			want: "cannot configure",
		},
		{
			name: "Nodezuno identity",
			raw:  `{"X-Nodezuno-Service-ID":"not-a-customer-service"}`,
			want: "cannot configure",
		},
		{
			name: "hop by hop",
			raw:  `{"Connection":"keep-alive"}`,
			want: "cannot configure",
		},
		{
			name: "automatic replay",
			raw:  `{"Idempotency-Key":"provider-replay-key"}`,
			want: "cannot configure",
		},
		{
			name: "line break",
			raw:  `{"Authorization":"Bearer provider\r\nsecret"}`,
			want: "visible ASCII",
		},
		{
			name: "surrounding whitespace",
			raw:  `{"Authorization":" Bearer provider-secret"}`,
			want: "visible ASCII",
		},
		{
			name: "short credential",
			raw:  `{"X-API-Key":"short"}`,
			want: "8 to 2048",
		},
		{
			name: "trailing document",
			raw:  `{"Authorization":"Bearer provider-secret"} {}`,
			want: "exactly one",
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			_, err := parseUpstreamHeaders(test.raw)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf(
					"parseUpstreamHeaders() error = %v, want containing %q",
					err,
					test.want,
				)
			}
			if strings.Contains(err.Error(), "provider-secret") {
				t.Fatalf("configuration error disclosed a credential: %v", err)
			}
		})
	}
}

func TestParseUpstreamHeadersBoundsRawConfiguration(t *testing.T) {
	t.Parallel()
	_, err := parseUpstreamHeaders(strings.Repeat(" ", maximumUpstreamHeaderBytes+1))
	if err == nil || !strings.Contains(err.Error(), "at most") {
		t.Fatalf("parseUpstreamHeaders() error = %v, want bounded rejection", err)
	}
}

func TestLoadConfiguresSharedControlPlaneMode(t *testing.T) {
	t.Parallel()
	configuration, err := Load(environment(map[string]string{
		"ETHEREUM_RPC_URL":          "https://rpc.vendor.invalid/project",
		"NODEZUNO_GRPC_AUTH_MODE":   "control-plane",
		"NODEZUNO_GRPC_AUTH_URL":    "https://nodezuno.com/api/v1/internal/grpc/authorize",
		"NODEZUNO_GRPC_AUTH_SECRET": "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6",
	}))
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if configuration.AuthMode != AuthModeControlPlane {
		t.Fatalf("AuthMode = %q", configuration.AuthMode)
	}
	if configuration.ControlPlane == nil {
		t.Fatal("ControlPlane = nil")
	}
	if configuration.ControlPlane.Timeout != 2*time.Second {
		t.Fatalf(
			"ControlPlane.Timeout = %s",
			configuration.ControlPlane.Timeout,
		)
	}
	if len(configuration.APIKeyDigests) != 0 {
		t.Fatal("control-plane mode retained static digests")
	}
}

func TestLoadRejectsAmbiguousOrUnsafeControlPlaneMode(t *testing.T) {
	t.Parallel()
	base := map[string]string{
		"ETHEREUM_RPC_URL":          "https://rpc.vendor.invalid",
		"NODEZUNO_GRPC_AUTH_MODE":   "control-plane",
		"NODEZUNO_GRPC_AUTH_URL":    "https://nodezuno.com/api/v1/internal/grpc/authorize",
		"NODEZUNO_GRPC_AUTH_SECRET": "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6",
	}
	tests := []struct {
		name   string
		update map[string]string
		want   string
	}{
		{
			name: "mixed digest mode",
			update: map[string]string{
				"GRPC_API_KEY_SHA256": strings.Repeat("a", 64),
			},
			want: "must be empty",
		},
		{
			name: "fixed service deployment",
			update: map[string]string{
				"NODEZUNO_GRPC_SERVICE_ID": "11111111-1111-4111-8111-111111111111",
			},
			want: "not supported",
		},
		{
			name: "HTTP control plane",
			update: map[string]string{
				"NODEZUNO_GRPC_AUTH_URL": "http://nodezuno.com/api/v1/internal/grpc/authorize",
			},
			want: "exact HTTPS",
		},
		{
			name: "IP control plane",
			update: map[string]string{
				"NODEZUNO_GRPC_AUTH_URL": "https://127.0.0.1/api/v1/internal/grpc/authorize",
			},
			want: "public DNS",
		},
		{
			name: "low diversity secret",
			update: map[string]string{
				"NODEZUNO_GRPC_AUTH_SECRET": strings.Repeat("a", 32),
			},
			want: "distinct",
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			values := make(map[string]string, len(base)+len(test.update))
			for key, value := range base {
				values[key] = value
			}
			for key, value := range test.update {
				values[key] = value
			}
			_, err := Load(environment(values))
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("Load() error = %v, want containing %q", err, test.want)
			}
		})
	}
}

func environment(values map[string]string) Getter {
	return func(name string) string {
		return values[name]
	}
}
