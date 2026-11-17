package auth

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	maximumAuthorizationResponseBytes = 4 << 10
	maximumAuthorizationQuotaUnits    = 10
)

var developerKeyPattern = regexp.MustCompile(
	`^nzu_live_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_[A-Za-z0-9_-]{43}$`,
)

type controlPlaneRequest struct {
	ServiceID  string `json:"serviceId"`
	APIKey     string `json:"apiKey"`
	QuotaUnits int    `json:"quotaUnits"`
}

type controlPlaneResponse struct {
	Data      *controlPlaneDecision `json:"data"`
	RequestID string                `json:"requestId"`
}

type controlPlaneDecision struct {
	Authorized *bool `json:"authorized"`
}

// ControlPlaneValidator validates raw self-service keys against the control
// plane.
type ControlPlaneValidator struct {
	endpoint   *url.URL
	secret     string
	httpClient *http.Client
}

// NewControlPlaneValidator creates a hardened production authorization client.
func NewControlPlaneValidator(
	endpoint *url.URL,
	secret string,
	timeout time.Duration,
) *ControlPlaneValidator {
	transport := &http.Transport{
		Proxy: nil,
		DialContext: (&net.Dialer{
			Timeout:   minDuration(timeout, 5*time.Second),
			KeepAlive: 30 * time.Second,
		}).DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          100,
		MaxIdleConnsPerHost:   64,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   minDuration(timeout, 5*time.Second),
		ExpectContinueTimeout: time.Second,
		TLSClientConfig: &tls.Config{
			MinVersion: tls.VersionTLS12,
		},
	}
	return NewControlPlaneValidatorWithHTTPClient(
		endpoint,
		secret,
		&http.Client{
			Transport: transport,
			Timeout:   timeout,
			CheckRedirect: func(
				_ *http.Request,
				_ []*http.Request,
			) error {
				return http.ErrUseLastResponse
			},
		},
	)
}

// NewControlPlaneValidatorWithHTTPClient supports deterministic native tests.
func NewControlPlaneValidatorWithHTTPClient(
	endpoint *url.URL,
	secret string,
	client *http.Client,
) *ControlPlaneValidator {
	copiedEndpoint := *endpoint
	return &ControlPlaneValidator{
		endpoint:   &copiedEndpoint,
		secret:     secret,
		httpClient: client,
	}
}

// Authorize asks the private website boundary for one non-enumerating decision.
func (validator *ControlPlaneValidator) Authorize(
	ctx context.Context,
	serviceID string,
	token string,
) (bool, error) {
	return validator.AuthorizeWithQuota(ctx, serviceID, token, 1)
}

// AuthorizeWithQuota asks the private boundary to atomically admit one call.
func (validator *ControlPlaneValidator) AuthorizeWithQuota(
	ctx context.Context,
	serviceID string,
	token string,
	quotaUnits int,
) (bool, error) {
	if validator == nil ||
		validator.endpoint == nil ||
		validator.httpClient == nil ||
		!serviceIDPattern.MatchString(serviceID) ||
		!developerKeyPattern.MatchString(token) ||
		quotaUnits < 1 ||
		quotaUnits > maximumAuthorizationQuotaUnits {
		return false, ErrAuthorizationUnavailable
	}
	return validator.requestDecision(ctx, serviceID, token, quotaUnits)
}

func (validator *ControlPlaneValidator) requestDecision(
	ctx context.Context,
	serviceID string,
	token string,
	quotaUnits int,
) (bool, error) {
	if validator == nil ||
		validator.endpoint == nil ||
		validator.httpClient == nil {
		return false, ErrAuthorizationUnavailable
	}
	body, err := json.Marshal(controlPlaneRequest{
		ServiceID:  serviceID,
		APIKey:     token,
		QuotaUnits: quotaUnits,
	})
	if err != nil {
		return false, ErrAuthorizationUnavailable
	}
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		validator.endpoint.String(),
		bytes.NewReader(body),
	)
	if err != nil {
		return false, ErrAuthorizationUnavailable
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Authorization", "Bearer "+validator.secret)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("User-Agent", "Nodezuno-Native-gRPC/1.0")

	response, err := validator.httpClient.Do(request)
	if err != nil {
		return false, ErrAuthorizationUnavailable
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusTooManyRequests {
		return false, ErrQuotaExhausted
	}
	if response.StatusCode != http.StatusOK {
		return false, ErrAuthorizationUnavailable
	}
	if !isJSONContentType(response.Header.Get("Content-Type")) {
		return false, ErrAuthorizationUnavailable
	}
	if contentLength := response.Header.Get("Content-Length"); contentLength != "" {
		declared, err := strconv.ParseInt(contentLength, 10, 64)
		if err != nil ||
			declared < 0 ||
			declared > maximumAuthorizationResponseBytes {
			return false, ErrAuthorizationUnavailable
		}
	}

	limited := io.LimitReader(
		response.Body,
		maximumAuthorizationResponseBytes+1,
	)
	responseBody, err := io.ReadAll(limited)
	if err != nil ||
		len(responseBody) > maximumAuthorizationResponseBytes {
		return false, ErrAuthorizationUnavailable
	}
	decoder := json.NewDecoder(bytes.NewReader(responseBody))
	decoder.DisallowUnknownFields()
	var decision controlPlaneResponse
	if err := decoder.Decode(&decision); err != nil ||
		decision.RequestID == "" ||
		decision.Data == nil ||
		decision.Data.Authorized == nil {
		return false, ErrAuthorizationUnavailable
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return false, ErrAuthorizationUnavailable
	}
	return *decision.Data.Authorized, nil
}

// Ready proves the configured secret reaches the live database-backed decision
// boundary.
func (validator *ControlPlaneValidator) Ready(ctx context.Context) error {
	authorized, err := validator.requestDecision(
		ctx,
		"00000000-0000-4000-8000-000000000000",
		"nzu_live_00000000-0000-4000-8000-000000000000_"+
			strings.Repeat("A", 43),
		1,
	)
	if err != nil || authorized {
		return ErrAuthorizationUnavailable
	}
	return nil
}

func isJSONContentType(value string) bool {
	mediaType := strings.ToLower(strings.TrimSpace(
		strings.SplitN(value, ";", 2)[0],
	))
	return mediaType == "application/json"
}

func minDuration(left time.Duration, right time.Duration) time.Duration {
	if left < right {
		return left
	}
	return right
}
