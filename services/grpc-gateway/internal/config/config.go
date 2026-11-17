// Package config loads and validates the native gRPC service configuration.
package config

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	defaultListenAddress        = ":50051"
	defaultUpstreamTimeout      = 12 * time.Second
	defaultAuthorizationTimeout = 2 * time.Second
	defaultShutdownTimeout      = 20 * time.Second
	defaultMaxRequestBytes      = 1 << 20
	defaultMaxResponseBytes     = 4 << 20
	defaultMaxConcurrentCalls   = 128
	minimumConfiguredKeyLength  = 20
	maximumUpstreamHeaderBytes  = 16 << 10
	maximumUpstreamHeaders      = 16
	maximumUpstreamHeaderName   = 128
	minimumUpstreamHeaderValue  = 8
	maximumUpstreamHeaderValue  = 2048
	maximumUpstreamsJSONBytes   = 64 << 10
	maximumEthereumUpstreams    = 4
	minimumUpstreamTimeout      = 100 * time.Millisecond
	maximumUpstreamTimeout      = 30 * time.Second
)

// AuthMode selects exactly one gateway credential validation boundary.
type AuthMode string

const (
	// AuthModeControlPlane validates self-service keys against the website
	// control plane.
	AuthModeControlPlane AuthMode = "control-plane"
	// AuthModeStaticDigest validates operator-managed keys against local digests.
	AuthModeStaticDigest AuthMode = "static-digest"
)

var ethereumMethodPattern = regexp.MustCompile(
	`^[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+$`,
)

var HTTPHeaderNamePattern = regexp.MustCompile(
	"^[!#$%&'*+\\-.^_`|~0-9A-Za-z]+$",
)

var upstreamNamePattern = regexp.MustCompile(`^[a-z][a-z0-9-]{0,31}$`)

var blockedUpstreamHeaders = map[string]struct{}{
	"accept":                 {},
	"accept-encoding":        {},
	"baggage":                {},
	"cache-control":          {},
	"cdn-loop":               {},
	"cf-connecting-ip":       {},
	"client-ip":              {},
	"connection":             {},
	"content-encoding":       {},
	"content-length":         {},
	"content-type":           {},
	"cookie":                 {},
	"expect":                 {},
	"forwarded":              {},
	"host":                   {},
	"idempotency-key":        {},
	"keep-alive":             {},
	"origin":                 {},
	"pragma":                 {},
	"proxy-authenticate":     {},
	"proxy-authorization":    {},
	"proxy-connection":       {},
	"range":                  {},
	"referer":                {},
	"sec-websocket-key":      {},
	"set-cookie":             {},
	"te":                     {},
	"traceparent":            {},
	"tracestate":             {},
	"trailer":                {},
	"transfer-encoding":      {},
	"true-client-ip":         {},
	"upgrade":                {},
	"user-agent":             {},
	"via":                    {},
	"x-forwarded-for":        {},
	"x-forwarded-host":       {},
	"x-forwarded-proto":      {},
	"x-host":                 {},
	"x-http-method-override": {},
	"x-idempotency-key":      {},
	"x-method-override":      {},
	"x-original-url":         {},
	"x-real-ip":              {},
	"x-request-id":           {},
	"x-rewrite-url":          {},
}

var defaultAllowedMethods = []string{
	"eth_blockNumber",
	"eth_call",
	"eth_chainId",
	"eth_estimateGas",
	"eth_feeHistory",
	"eth_gasPrice",
	"eth_getBalance",
	"eth_getBlockByHash",
	"eth_getBlockByNumber",
	"eth_getCode",
	"eth_getStorageAt",
	"eth_getTransactionByHash",
	"eth_getTransactionCount",
	"eth_getTransactionReceipt",
	"eth_maxPriorityFeePerGas",
	"net_version",
	"web3_clientVersion",
}

var betaAllowedMethods = map[string]struct{}{
	"eth_blobBaseFee":                         {},
	"eth_blockNumber":                         {},
	"eth_call":                                {},
	"eth_chainId":                             {},
	"eth_estimateGas":                         {},
	"eth_feeHistory":                          {},
	"eth_gasPrice":                            {},
	"eth_getBalance":                          {},
	"eth_getBlockByHash":                      {},
	"eth_getBlockByNumber":                    {},
	"eth_getBlockReceipts":                    {},
	"eth_getBlockTransactionCountByHash":      {},
	"eth_getBlockTransactionCountByNumber":    {},
	"eth_getCode":                             {},
	"eth_getLogs":                             {},
	"eth_getProof":                            {},
	"eth_getStorageAt":                        {},
	"eth_getTransactionByBlockHashAndIndex":   {},
	"eth_getTransactionByBlockNumberAndIndex": {},
	"eth_getTransactionByHash":                {},
	"eth_getTransactionCount":                 {},
	"eth_getTransactionReceipt":               {},
	"eth_getUncleByBlockHashAndIndex":         {},
	"eth_getUncleByBlockNumberAndIndex":       {},
	"eth_getUncleCountByBlockHash":            {},
	"eth_getUncleCountByBlockNumber":          {},
	"eth_maxPriorityFeePerGas":                {},
	"eth_protocolVersion":                     {},
	"eth_syncing":                             {},
	"net_listening":                           {},
	"net_peerCount":                           {},
	"net_version":                             {},
	"web3_clientVersion":                      {},
	"web3_sha3":                               {},
}

// Getter returns the value for an environment variable.
type Getter func(string) string

// Config is the complete immutable service configuration.
type Config struct {
	ListenAddress         string
	Upstreams             []EthereumUpstream
	AuthMode              AuthMode
	ControlPlane          *ControlPlaneAuthorization
	APIKeyDigests         [][sha256.Size]byte
	AllowedMethods        map[string]struct{}
	UpstreamTimeout       time.Duration
	ShutdownTimeout       time.Duration
	MaxRequestBytes       int
	MaxResponseBytes      int
	MaxConcurrentCalls    int
	TLSCertificateFile    string
	TLSPrivateKeyFile     string
	AllowInsecureUpstream bool
}

// EthereumUpstream is one immutable operator-configured provider boundary.
type EthereumUpstream struct {
	Name    string
	URL     *url.URL
	Headers map[string]string
	Timeout time.Duration
}

// ControlPlaneAuthorization is the private website authorization boundary.
type ControlPlaneAuthorization struct {
	URL     *url.URL
	Secret  string
	Timeout time.Duration
}

// Load reads and validates all service configuration.
func Load(getenv Getter) (Config, error) {
	if getenv == nil {
		return Config{}, errors.New("configuration getter is required")
	}

	listenAddress, err := listenAddressFromEnvironment(getenv)
	if err != nil {
		return Config{}, err
	}

	allowInsecure, err := parseBool(
		getenv("GRPC_ALLOW_INSECURE_UPSTREAM"),
		"GRPC_ALLOW_INSECURE_UPSTREAM",
		false,
	)
	if err != nil {
		return Config{}, err
	}

	authMode, controlPlane, digests, err := parseAuthentication(getenv)
	if err != nil {
		return Config{}, err
	}

	methods, err := parseAllowedMethods(getenv("ETHEREUM_ALLOWED_METHODS"))
	if err != nil {
		return Config{}, err
	}

	upstreamTimeout, err := parseDuration(
		getenv("GRPC_UPSTREAM_TIMEOUT"),
		"GRPC_UPSTREAM_TIMEOUT",
		defaultUpstreamTimeout,
		100*time.Millisecond,
		60*time.Second,
	)
	if err != nil {
		return Config{}, err
	}
	upstreams, err := parseEthereumUpstreams(
		getenv("ETHEREUM_UPSTREAMS_JSON"),
		getenv("ETHEREUM_RPC_URL"),
		getenv("ETHEREUM_RPC_HEADERS_JSON"),
		allowInsecure,
		upstreamTimeout,
	)
	if err != nil {
		return Config{}, err
	}
	shutdownTimeout, err := parseDuration(
		getenv("GRPC_SHUTDOWN_TIMEOUT"),
		"GRPC_SHUTDOWN_TIMEOUT",
		defaultShutdownTimeout,
		time.Second,
		2*time.Minute,
	)
	if err != nil {
		return Config{}, err
	}
	maxRequestBytes, err := parseInteger(
		getenv("GRPC_MAX_REQUEST_BYTES"),
		"GRPC_MAX_REQUEST_BYTES",
		defaultMaxRequestBytes,
		1024,
		4<<20,
	)
	if err != nil {
		return Config{}, err
	}
	maxResponseBytes, err := parseInteger(
		getenv("GRPC_MAX_RESPONSE_BYTES"),
		"GRPC_MAX_RESPONSE_BYTES",
		defaultMaxResponseBytes,
		1024,
		16<<20,
	)
	if err != nil {
		return Config{}, err
	}
	maxConcurrentCalls, err := parseInteger(
		getenv("GRPC_MAX_CONCURRENT_CALLS"),
		"GRPC_MAX_CONCURRENT_CALLS",
		defaultMaxConcurrentCalls,
		1,
		10_000,
	)
	if err != nil {
		return Config{}, err
	}

	certificateFile := strings.TrimSpace(getenv("GRPC_TLS_CERT_FILE"))
	privateKeyFile := strings.TrimSpace(getenv("GRPC_TLS_KEY_FILE"))
	if (certificateFile == "") != (privateKeyFile == "") {
		return Config{}, errors.New(
			"GRPC_TLS_CERT_FILE and GRPC_TLS_KEY_FILE must be configured together",
		)
	}

	return Config{
		ListenAddress:         listenAddress,
		Upstreams:             upstreams,
		AuthMode:              authMode,
		ControlPlane:          controlPlane,
		APIKeyDigests:         digests,
		AllowedMethods:        methods,
		UpstreamTimeout:       upstreamTimeout,
		ShutdownTimeout:       shutdownTimeout,
		MaxRequestBytes:       maxRequestBytes,
		MaxResponseBytes:      maxResponseBytes,
		MaxConcurrentCalls:    maxConcurrentCalls,
		TLSCertificateFile:    certificateFile,
		TLSPrivateKeyFile:     privateKeyFile,
		AllowInsecureUpstream: allowInsecure,
	}, nil
}

func parseEthereumUpstreams(
	raw string,
	compatibilityURL string,
	compatibilityHeaders string,
	allowInsecure bool,
	compatibilityTimeout time.Duration,
) ([]EthereumUpstream, error) {
	if strings.TrimSpace(raw) == "" {
		endpoint, err := parseUpstreamURL(
			compatibilityURL,
			allowInsecure,
		)
		if err != nil {
			return nil, err
		}
		headers, err := parseUpstreamHeaders(compatibilityHeaders)
		if err != nil {
			return nil, err
		}
		return []EthereumUpstream{{
			Name:    "compatibility",
			URL:     endpoint,
			Headers: headers,
			Timeout: compatibilityTimeout,
		}}, nil
	}
	if strings.TrimSpace(compatibilityURL) != "" ||
		strings.TrimSpace(compatibilityHeaders) != "" {
		return nil, errors.New(
			"ETHEREUM_UPSTREAMS_JSON is mutually exclusive with ETHEREUM_RPC_URL and ETHEREUM_RPC_HEADERS_JSON",
		)
	}
	if allowInsecure {
		return nil, errors.New(
			"GRPC_ALLOW_INSECURE_UPSTREAM cannot be true with ETHEREUM_UPSTREAMS_JSON",
		)
	}
	return parseEthereumUpstreamsJSON(raw)
}

func parseEthereumUpstreamsJSON(raw string) ([]EthereumUpstream, error) {
	if len(raw) > maximumUpstreamsJSONBytes {
		return nil, fmt.Errorf(
			"ETHEREUM_UPSTREAMS_JSON must be at most %d bytes",
			maximumUpstreamsJSONBytes,
		)
	}
	decoder := json.NewDecoder(strings.NewReader(raw))
	opening, err := decoder.Token()
	if err != nil {
		return nil, errors.New(
			"ETHEREUM_UPSTREAMS_JSON must be one valid JSON array",
		)
	}
	delimiter, ok := opening.(json.Delim)
	if !ok || delimiter != '[' {
		return nil, errors.New(
			"ETHEREUM_UPSTREAMS_JSON must be one JSON array",
		)
	}

	upstreams := make([]EthereumUpstream, 0, maximumEthereumUpstreams)
	names := make(map[string]struct{})
	endpoints := make(map[string]struct{})
	for decoder.More() {
		if len(upstreams) == maximumEthereumUpstreams {
			return nil, fmt.Errorf(
				"ETHEREUM_UPSTREAMS_JSON accepts at most %d entries",
				maximumEthereumUpstreams,
			)
		}
		var rawEntry json.RawMessage
		if err := decoder.Decode(&rawEntry); err != nil {
			return nil, errors.New(
				"ETHEREUM_UPSTREAMS_JSON contains an invalid entry",
			)
		}
		upstream, err := parseEthereumUpstreamEntry(rawEntry)
		if err != nil {
			return nil, err
		}
		if _, duplicate := names[upstream.Name]; duplicate {
			return nil, errors.New(
				"ETHEREUM_UPSTREAMS_JSON contains a duplicate name",
			)
		}
		canonicalEndpoint := canonicalUpstreamURL(upstream.URL)
		if _, duplicate := endpoints[canonicalEndpoint]; duplicate {
			return nil, errors.New(
				"ETHEREUM_UPSTREAMS_JSON contains a duplicate URL",
			)
		}
		names[upstream.Name] = struct{}{}
		endpoints[canonicalEndpoint] = struct{}{}
		upstreams = append(upstreams, upstream)
	}

	closing, err := decoder.Token()
	if err != nil {
		return nil, errors.New(
			"ETHEREUM_UPSTREAMS_JSON must be one valid JSON array",
		)
	}
	delimiter, ok = closing.(json.Delim)
	if !ok || delimiter != ']' {
		return nil, errors.New(
			"ETHEREUM_UPSTREAMS_JSON must be one valid JSON array",
		)
	}
	var trailing json.RawMessage
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return nil, errors.New(
			"ETHEREUM_UPSTREAMS_JSON must contain exactly one JSON array",
		)
	}
	if len(upstreams) == 0 {
		return nil, errors.New(
			"ETHEREUM_UPSTREAMS_JSON must contain at least one entry",
		)
	}
	return upstreams, nil
}

func parseEthereumUpstreamEntry(
	raw json.RawMessage,
) (EthereumUpstream, error) {
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	opening, err := decoder.Token()
	if err != nil {
		return EthereumUpstream{}, errors.New(
			"ETHEREUM_UPSTREAMS_JSON contains an invalid entry",
		)
	}
	delimiter, ok := opening.(json.Delim)
	if !ok || delimiter != '{' {
		return EthereumUpstream{}, errors.New(
			"ETHEREUM_UPSTREAMS_JSON entries must be JSON objects",
		)
	}

	fields := make(map[string]json.RawMessage, 4)
	for decoder.More() {
		nameToken, err := decoder.Token()
		if err != nil {
			return EthereumUpstream{}, errors.New(
				"ETHEREUM_UPSTREAMS_JSON contains an invalid entry field",
			)
		}
		name, ok := nameToken.(string)
		if !ok {
			return EthereumUpstream{}, errors.New(
				"ETHEREUM_UPSTREAMS_JSON contains an invalid entry field",
			)
		}
		switch name {
		case "name", "url", "timeout", "headers":
		default:
			return EthereumUpstream{}, errors.New(
				"ETHEREUM_UPSTREAMS_JSON contains an unknown entry field",
			)
		}
		if _, duplicate := fields[name]; duplicate {
			return EthereumUpstream{}, errors.New(
				"ETHEREUM_UPSTREAMS_JSON contains a duplicate entry field",
			)
		}
		var value json.RawMessage
		if err := decoder.Decode(&value); err != nil {
			return EthereumUpstream{}, errors.New(
				"ETHEREUM_UPSTREAMS_JSON contains an invalid entry value",
			)
		}
		fields[name] = value
	}
	if _, err := decoder.Token(); err != nil {
		return EthereumUpstream{}, errors.New(
			"ETHEREUM_UPSTREAMS_JSON contains an invalid entry",
		)
	}
	var trailing json.RawMessage
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return EthereumUpstream{}, errors.New(
			"ETHEREUM_UPSTREAMS_JSON contains an invalid entry",
		)
	}
	for _, required := range []string{"name", "url", "timeout", "headers"} {
		if _, exists := fields[required]; !exists {
			return EthereumUpstream{}, fmt.Errorf(
				"ETHEREUM_UPSTREAMS_JSON entry is missing required field %s",
				required,
			)
		}
	}

	var name string
	if err := json.Unmarshal(fields["name"], &name); err != nil ||
		!upstreamNamePattern.MatchString(name) {
		return EthereumUpstream{}, errors.New(
			"ETHEREUM_UPSTREAMS_JSON entry name must match ^[a-z][a-z0-9-]{0,31}$",
		)
	}
	var rawURL string
	if err := json.Unmarshal(fields["url"], &rawURL); err != nil {
		return EthereumUpstream{}, errors.New(
			"ETHEREUM_UPSTREAMS_JSON entry URL must be a string",
		)
	}
	endpoint, err := parseStrictHTTPSUpstreamURL(rawURL)
	if err != nil {
		return EthereumUpstream{}, err
	}
	var rawTimeout string
	if err := json.Unmarshal(fields["timeout"], &rawTimeout); err != nil {
		return EthereumUpstream{}, errors.New(
			"ETHEREUM_UPSTREAMS_JSON entry timeout must be a duration string",
		)
	}
	timeout, err := time.ParseDuration(rawTimeout)
	if err != nil ||
		timeout < minimumUpstreamTimeout ||
		timeout > maximumUpstreamTimeout {
		return EthereumUpstream{}, fmt.Errorf(
			"ETHEREUM_UPSTREAMS_JSON entry timeout must be between %s and %s",
			minimumUpstreamTimeout,
			maximumUpstreamTimeout,
		)
	}
	headers, err := parseUpstreamHeaders(string(fields["headers"]))
	if err != nil {
		return EthereumUpstream{}, errors.New(
			"ETHEREUM_UPSTREAMS_JSON entry contains invalid headers",
		)
	}
	return EthereumUpstream{
		Name:    name,
		URL:     endpoint,
		Headers: headers,
		Timeout: timeout,
	}, nil
}

func parseStrictHTTPSUpstreamURL(raw string) (*url.URL, error) {
	if raw == "" || raw != strings.TrimSpace(raw) {
		return nil, errors.New(
			"ETHEREUM_UPSTREAMS_JSON entry URL must be an exact HTTPS URL",
		)
	}
	parsed, err := url.Parse(raw)
	if err != nil ||
		parsed.Scheme != "https" ||
		parsed.Host == "" ||
		parsed.Hostname() == "" ||
		parsed.User != nil ||
		parsed.Fragment != "" ||
		parsed.Opaque != "" {
		return nil, errors.New(
			"ETHEREUM_UPSTREAMS_JSON entry URL must be an exact HTTPS URL without user information or a fragment",
		)
	}
	return parsed, nil
}

func canonicalUpstreamURL(endpoint *url.URL) string {
	canonical := *endpoint
	canonical.Scheme = strings.ToLower(canonical.Scheme)
	canonical.Host = strings.ToLower(canonical.Host)
	return canonical.String()
}

func parseUpstreamHeaders(raw string) (map[string]string, error) {
	if len(raw) > maximumUpstreamHeaderBytes {
		return nil, fmt.Errorf(
			"ETHEREUM_RPC_HEADERS_JSON must be at most %d bytes",
			maximumUpstreamHeaderBytes,
		)
	}
	if strings.TrimSpace(raw) == "" {
		return map[string]string{}, nil
	}

	decoder := json.NewDecoder(strings.NewReader(raw))
	opening, err := decoder.Token()
	if err != nil {
		return nil, errors.New(
			"ETHEREUM_RPC_HEADERS_JSON must be one valid JSON object",
		)
	}
	delimiter, ok := opening.(json.Delim)
	if !ok || delimiter != '{' {
		return nil, errors.New(
			"ETHEREUM_RPC_HEADERS_JSON must be one JSON object",
		)
	}

	headers := make(map[string]string)
	seen := make(map[string]struct{})
	for decoder.More() {
		nameToken, err := decoder.Token()
		if err != nil {
			return nil, errors.New(
				"ETHEREUM_RPC_HEADERS_JSON contains an invalid header name",
			)
		}
		name, ok := nameToken.(string)
		if !ok || len(name) == 0 ||
			len(name) > maximumUpstreamHeaderName ||
			!HTTPHeaderNamePattern.MatchString(name) {
			return nil, errors.New(
				"ETHEREUM_RPC_HEADERS_JSON contains an invalid header name",
			)
		}

		lowerName := strings.ToLower(name)
		if _, duplicate := seen[lowerName]; duplicate {
			return nil, fmt.Errorf(
				"ETHEREUM_RPC_HEADERS_JSON contains duplicate header %q",
				name,
			)
		}
		if upstreamHeaderIsBlocked(lowerName) {
			return nil, fmt.Errorf(
				"ETHEREUM_RPC_HEADERS_JSON cannot configure header %q",
				name,
			)
		}

		var value string
		if err := decoder.Decode(&value); err != nil {
			return nil, fmt.Errorf(
				"ETHEREUM_RPC_HEADERS_JSON header %q must have a string value",
				name,
			)
		}
		if !validUpstreamHeaderValue(value) {
			return nil, fmt.Errorf(
				"ETHEREUM_RPC_HEADERS_JSON header %q must contain %d to %d visible ASCII characters without surrounding whitespace",
				name,
				minimumUpstreamHeaderValue,
				maximumUpstreamHeaderValue,
			)
		}

		seen[lowerName] = struct{}{}
		headers[name] = value
		if len(headers) > maximumUpstreamHeaders {
			return nil, fmt.Errorf(
				"ETHEREUM_RPC_HEADERS_JSON accepts at most %d headers",
				maximumUpstreamHeaders,
			)
		}
	}

	closing, err := decoder.Token()
	if err != nil {
		return nil, errors.New(
			"ETHEREUM_RPC_HEADERS_JSON must be one valid JSON object",
		)
	}
	delimiter, ok = closing.(json.Delim)
	if !ok || delimiter != '}' {
		return nil, errors.New(
			"ETHEREUM_RPC_HEADERS_JSON must be one valid JSON object",
		)
	}
	var trailing json.RawMessage
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return nil, errors.New(
			"ETHEREUM_RPC_HEADERS_JSON must contain exactly one JSON object",
		)
	}
	return headers, nil
}

func upstreamHeaderIsBlocked(lowerName string) bool {
	if _, blocked := blockedUpstreamHeaders[lowerName]; blocked {
		return true
	}
	for _, prefix := range []string{
		"cf-",
		"proxy-",
		"sec-",
		"x-forwarded-",
		"x-nodezuno-",
	} {
		if strings.HasPrefix(lowerName, prefix) {
			return true
		}
	}
	return false
}

func validUpstreamHeaderValue(value string) bool {
	if len(value) < minimumUpstreamHeaderValue ||
		len(value) > maximumUpstreamHeaderValue ||
		strings.TrimSpace(value) != value {
		return false
	}
	for _, character := range []byte(value) {
		if character < 0x20 || character > 0x7e {
			return false
		}
	}
	return true
}

func parseAuthentication(
	getenv Getter,
) (AuthMode, *ControlPlaneAuthorization, [][sha256.Size]byte, error) {
	mode := AuthMode(strings.TrimSpace(getenv("NODEZUNO_GRPC_AUTH_MODE")))
	if mode == "" {
		return "", nil, nil, errors.New(
			"NODEZUNO_GRPC_AUTH_MODE must be control-plane or static-digest",
		)
	}
	switch mode {
	case AuthModeControlPlane:
		if strings.TrimSpace(getenv("GRPC_API_KEY_SHA256")) != "" {
			return "", nil, nil, errors.New(
				"GRPC_API_KEY_SHA256 must be empty in control-plane mode",
			)
		}
		if strings.TrimSpace(getenv("NODEZUNO_GRPC_SERVICE_ID")) != "" {
			return "", nil, nil, errors.New(
				"NODEZUNO_GRPC_SERVICE_ID is not supported in shared control-plane mode",
			)
		}
		endpoint, err := parseControlPlaneURL(
			getenv("NODEZUNO_GRPC_AUTH_URL"),
		)
		if err != nil {
			return "", nil, nil, err
		}
		secret, err := parseControlPlaneSecret(
			getenv("NODEZUNO_GRPC_AUTH_SECRET"),
		)
		if err != nil {
			return "", nil, nil, err
		}
		timeout, err := parseDuration(
			getenv("NODEZUNO_GRPC_AUTH_TIMEOUT"),
			"NODEZUNO_GRPC_AUTH_TIMEOUT",
			defaultAuthorizationTimeout,
			100*time.Millisecond,
			10*time.Second,
		)
		if err != nil {
			return "", nil, nil, err
		}
		return mode, &ControlPlaneAuthorization{
			URL: endpoint, Secret: secret, Timeout: timeout,
		}, nil, nil
	case AuthModeStaticDigest:
		for _, name := range []string{
			"NODEZUNO_GRPC_AUTH_URL",
			"NODEZUNO_GRPC_AUTH_SECRET",
			"NODEZUNO_GRPC_AUTH_TIMEOUT",
			"NODEZUNO_GRPC_SERVICE_ID",
		} {
			if strings.TrimSpace(getenv(name)) != "" {
				return "", nil, nil, fmt.Errorf(
					"%s must be empty in static-digest mode",
					name,
				)
			}
		}
		digests, err := parseAPIKeyDigests(
			getenv("GRPC_API_KEY_SHA256"),
		)
		if err != nil {
			return "", nil, nil, err
		}
		return mode, nil, digests, nil
	default:
		return "", nil, nil, errors.New(
			"NODEZUNO_GRPC_AUTH_MODE must be control-plane or static-digest",
		)
	}
}

func parseControlPlaneURL(raw string) (*url.URL, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil, errors.New("NODEZUNO_GRPC_AUTH_URL is required")
	}
	if trimmed != raw {
		return nil, errors.New(
			"NODEZUNO_GRPC_AUTH_URL must not contain surrounding whitespace",
		)
	}
	parsed, err := url.Parse(raw)
	if err != nil ||
		parsed.Scheme != "https" ||
		parsed.Host == "" ||
		parsed.User != nil ||
		parsed.Path != "/api/v1/internal/grpc/authorize" ||
		parsed.RawPath != "" ||
		parsed.RawQuery != "" ||
		parsed.Fragment != "" {
		return nil, errors.New(
			"NODEZUNO_GRPC_AUTH_URL must be the exact HTTPS internal authorization endpoint",
		)
	}
	hostname := strings.ToLower(parsed.Hostname())
	if net.ParseIP(hostname) != nil ||
		!strings.Contains(hostname, ".") ||
		strings.HasPrefix(hostname, ".") ||
		strings.HasSuffix(hostname, ".") ||
		strings.Contains(hostname, "..") ||
		(parsed.Port() != "" && parsed.Port() != "443") {
		return nil, errors.New(
			"NODEZUNO_GRPC_AUTH_URL must use a public DNS hostname on HTTPS port 443",
		)
	}
	for _, suffix := range []string{
		".local", ".internal", ".localhost", ".invalid",
		".test", ".example", ".onion",
	} {
		if strings.HasSuffix(hostname, suffix) {
			return nil, errors.New(
				"NODEZUNO_GRPC_AUTH_URL must use a public DNS hostname",
			)
		}
	}
	return parsed, nil
}

func parseControlPlaneSecret(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed != raw ||
		len(raw) < 32 ||
		len(raw) > 256 ||
		!regexp.MustCompile(`^[A-Za-z0-9._~-]+$`).MatchString(raw) {
		return "", errors.New(
			"NODEZUNO_GRPC_AUTH_SECRET must contain 32 to 256 safe ASCII characters",
		)
	}
	distinct := make(map[rune]struct{})
	for _, character := range raw {
		distinct[character] = struct{}{}
	}
	if len(distinct) < 8 {
		return "", errors.New(
			"NODEZUNO_GRPC_AUTH_SECRET must contain at least 8 distinct characters",
		)
	}
	return raw, nil
}

func listenAddressFromEnvironment(getenv Getter) (string, error) {
	address := strings.TrimSpace(getenv("GRPC_LISTEN_ADDR"))
	if address == "" {
		port := strings.TrimSpace(getenv("PORT"))
		if port == "" {
			address = defaultListenAddress
		} else {
			address = ":" + port
		}
	}

	_, port, err := net.SplitHostPort(address)
	if err != nil {
		return "", fmt.Errorf("GRPC_LISTEN_ADDR must be host:port: %w", err)
	}
	number, err := strconv.Atoi(port)
	if err != nil || number < 1 || number > 65_535 {
		return "", errors.New("GRPC_LISTEN_ADDR port must be between 1 and 65535")
	}
	return address, nil
}

func parseUpstreamURL(raw string, allowInsecure bool) (*url.URL, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, errors.New("ETHEREUM_RPC_URL is required")
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return nil, errors.New("ETHEREUM_RPC_URL is invalid")
	}
	if parsed.Host == "" {
		return nil, errors.New("ETHEREUM_RPC_URL must include a host")
	}
	if parsed.User != nil {
		return nil, errors.New("ETHEREUM_RPC_URL must not contain URL user information")
	}
	if parsed.Fragment != "" {
		return nil, errors.New("ETHEREUM_RPC_URL must not contain a fragment")
	}
	switch parsed.Scheme {
	case "https":
	case "http":
		if !allowInsecure {
			return nil, errors.New(
				"ETHEREUM_RPC_URL must use HTTPS unless GRPC_ALLOW_INSECURE_UPSTREAM is true",
			)
		}
	default:
		return nil, errors.New("ETHEREUM_RPC_URL must use HTTP or HTTPS")
	}
	return parsed, nil
}

func parseAPIKeyDigests(raw string) ([][sha256.Size]byte, error) {
	parts := strings.Split(raw, ",")
	digests := make([][sha256.Size]byte, 0, len(parts))
	seen := make(map[[sha256.Size]byte]struct{}, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		decoded, err := hex.DecodeString(part)
		if err != nil || len(decoded) != sha256.Size {
			return nil, errors.New(
				"GRPC_API_KEY_SHA256 must contain comma-separated 64-character hexadecimal SHA-256 digests",
			)
		}
		var digest [sha256.Size]byte
		copy(digest[:], decoded)
		if _, exists := seen[digest]; exists {
			continue
		}
		seen[digest] = struct{}{}
		digests = append(digests, digest)
	}
	if len(digests) == 0 {
		return nil, errors.New("GRPC_API_KEY_SHA256 is required")
	}
	if len(digests) > 32 {
		return nil, errors.New("GRPC_API_KEY_SHA256 accepts at most 32 digests")
	}
	return digests, nil
}

func parseAllowedMethods(raw string) (map[string]struct{}, error) {
	values := defaultAllowedMethods
	if strings.TrimSpace(raw) != "" {
		values = strings.Split(raw, ",")
	}
	methods := make(map[string]struct{}, len(values))
	for _, value := range values {
		method := strings.TrimSpace(value)
		if method == "" {
			continue
		}
		if len(method) > 128 || !ethereumMethodPattern.MatchString(method) {
			return nil, fmt.Errorf(
				"ETHEREUM_ALLOWED_METHODS contains invalid method %q",
				method,
			)
		}
		if _, allowed := betaAllowedMethods[method]; !allowed {
			return nil, fmt.Errorf(
				"ETHEREUM_ALLOWED_METHODS contains method %q outside the read-only beta policy",
				method,
			)
		}
		methods[method] = struct{}{}
	}
	if len(methods) == 0 {
		return nil, errors.New("ETHEREUM_ALLOWED_METHODS must not be empty")
	}
	return methods, nil
}

func parseDuration(
	raw string,
	name string,
	fallback time.Duration,
	minimum time.Duration,
	maximum time.Duration,
) (time.Duration, error) {
	if strings.TrimSpace(raw) == "" {
		return fallback, nil
	}
	value, err := time.ParseDuration(strings.TrimSpace(raw))
	if err != nil || value < minimum || value > maximum {
		return 0, fmt.Errorf(
			"%s must be a duration between %s and %s",
			name,
			minimum,
			maximum,
		)
	}
	return value, nil
}

func parseInteger(
	raw string,
	name string,
	fallback int,
	minimum int,
	maximum int,
) (int, error) {
	if strings.TrimSpace(raw) == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || value < minimum || value > maximum {
		return 0, fmt.Errorf(
			"%s must be an integer between %d and %d",
			name,
			minimum,
			maximum,
		)
	}
	return value, nil
}

func parseBool(raw string, name string, fallback bool) (bool, error) {
	if strings.TrimSpace(raw) == "" {
		return fallback, nil
	}
	value, err := strconv.ParseBool(strings.TrimSpace(raw))
	if err != nil {
		return false, fmt.Errorf("%s must be true or false", name)
	}
	return value, nil
}

// MinimumConfiguredKeyLength is the minimum accepted bearer-token length.
func MinimumConfiguredKeyLength() int {
	return minimumConfiguredKeyLength
}
