package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

const (
	testServiceID = "11111111-1111-4111-8111-111111111111"
	testAPIKey    = "nzu_live_22222222-2222-4222-8222-222222222222_" +
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq"
	testControlPlaneSecret = "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6"
)

func TestControlPlaneValidatorSendsWeightedAdmissionPrivately(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(
		writer http.ResponseWriter,
		request *http.Request,
	) {
		if request.Method != http.MethodPost {
			t.Errorf("method = %s", request.Method)
		}
		if request.Header.Get("Authorization") !=
			"Bearer "+testControlPlaneSecret {
			t.Error("control-plane authorization header is missing")
		}
		var input controlPlaneRequest
		if err := json.NewDecoder(request.Body).Decode(&input); err != nil {
			t.Errorf("decode request: %v", err)
		}
		if input.ServiceID != testServiceID ||
			input.APIKey != testAPIKey ||
			input.QuotaUnits != 10 {
			t.Errorf("input = %#v", input)
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(
			`{"data":{"authorized":true},"requestId":"request-1"}`,
		))
	}))
	defer server.Close()

	endpoint, _ := url.Parse(server.URL)
	validator := NewControlPlaneValidatorWithHTTPClient(
		endpoint,
		testControlPlaneSecret,
		server.Client(),
	)
	authorized, err := validator.AuthorizeWithQuota(
		context.Background(),
		testServiceID,
		testAPIKey,
		10,
	)
	if err != nil || !authorized {
		t.Fatalf("AuthorizeWithQuota() = %v, %v", authorized, err)
	}
}

func TestControlPlaneAuthorizeCompatibilityUsesOneQuotaUnit(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(
		writer http.ResponseWriter,
		request *http.Request,
	) {
		var input controlPlaneRequest
		if err := json.NewDecoder(request.Body).Decode(&input); err != nil {
			t.Errorf("decode request: %v", err)
		}
		if input.QuotaUnits != 1 {
			t.Errorf("quota units = %d, want 1", input.QuotaUnits)
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(
			`{"data":{"authorized":true},"requestId":"compatibility-1"}`,
		))
	}))
	defer server.Close()

	endpoint, _ := url.Parse(server.URL)
	validator := NewControlPlaneValidatorWithHTTPClient(
		endpoint,
		testControlPlaneSecret,
		server.Client(),
	)
	authorized, err := validator.Authorize(
		context.Background(),
		testServiceID,
		testAPIKey,
	)
	if err != nil || !authorized {
		t.Fatalf("Authorize() = %v, %v", authorized, err)
	}
}

func TestControlPlaneValidatorFailsClosed(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name        string
		status      int
		contentType string
		body        string
	}{
		{
			name:        "control-plane error",
			status:      http.StatusServiceUnavailable,
			contentType: "application/json",
			body:        `{"data":{"authorized":true},"requestId":"x"}`,
		},
		{
			name:        "wrong media type",
			status:      http.StatusOK,
			contentType: "text/html",
			body:        `{"data":{"authorized":true},"requestId":"x"}`,
		},
		{
			name:        "malformed decision",
			status:      http.StatusOK,
			contentType: "application/json",
			body:        `{"data":{"authorized":true},"credential":"secret"}`,
		},
		{
			name:        "oversized response",
			status:      http.StatusOK,
			contentType: "application/json",
			body:        strings.Repeat("x", maximumAuthorizationResponseBytes+1),
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			server := httptest.NewServer(http.HandlerFunc(func(
				writer http.ResponseWriter,
				_ *http.Request,
			) {
				writer.Header().Set("Content-Type", test.contentType)
				writer.WriteHeader(test.status)
				_, _ = writer.Write([]byte(test.body))
			}))
			defer server.Close()
			endpoint, _ := url.Parse(server.URL)
			validator := NewControlPlaneValidatorWithHTTPClient(
				endpoint,
				testControlPlaneSecret,
				server.Client(),
			)
			authorized, err := validator.Authorize(
				context.Background(),
				testServiceID,
				testAPIKey,
			)
			if authorized || !errors.Is(err, ErrAuthorizationUnavailable) {
				t.Fatalf("Authorize() = %v, %v", authorized, err)
			}
			if strings.Contains(err.Error(), testAPIKey) {
				t.Fatal("authorization error reflected the raw API key")
			}
		})
	}
}

func TestControlPlaneReadyRequiresReachableFalseDecision(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(
		writer http.ResponseWriter,
		request *http.Request,
	) {
		var input controlPlaneRequest
		if err := json.NewDecoder(request.Body).Decode(&input); err != nil {
			t.Errorf("decode request: %v", err)
		}
		if input.QuotaUnits != 1 {
			t.Errorf("readiness quota units = %d, want 1", input.QuotaUnits)
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(
			`{"data":{"authorized":false},"requestId":"readiness-1"}`,
		))
	}))
	defer server.Close()
	endpoint, _ := url.Parse(server.URL)
	validator := NewControlPlaneValidatorWithHTTPClient(
		endpoint,
		testControlPlaneSecret,
		server.Client(),
	)
	if err := validator.Ready(context.Background()); err != nil {
		t.Fatalf("Ready() error = %v", err)
	}
}

func TestControlPlaneValidatorMapsQuotaExhaustion(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(
		writer http.ResponseWriter,
		_ *http.Request,
	) {
		writer.Header().Set("Content-Type", "application/problem+json")
		writer.WriteHeader(http.StatusTooManyRequests)
		_, _ = writer.Write([]byte(
			`{"code":"rpc_quota_exceeded","detail":"redacted"}`,
		))
	}))
	defer server.Close()
	endpoint, _ := url.Parse(server.URL)
	validator := NewControlPlaneValidatorWithHTTPClient(
		endpoint,
		testControlPlaneSecret,
		server.Client(),
	)
	authorized, err := validator.AuthorizeWithQuota(
		context.Background(),
		testServiceID,
		testAPIKey,
		5,
	)
	if authorized || !errors.Is(err, ErrQuotaExhausted) {
		t.Fatalf("AuthorizeWithQuota() = %v, %v", authorized, err)
	}
	if strings.Contains(err.Error(), testAPIKey) {
		t.Fatal("quota error reflected the raw API key")
	}
}

func TestControlPlaneValidatorRejectsUnboundedQuotaLocally(t *testing.T) {
	t.Parallel()
	var calls atomic.Int64
	server := httptest.NewServer(http.HandlerFunc(func(
		writer http.ResponseWriter,
		_ *http.Request,
	) {
		calls.Add(1)
		writer.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()
	endpoint, _ := url.Parse(server.URL)
	validator := NewControlPlaneValidatorWithHTTPClient(
		endpoint,
		testControlPlaneSecret,
		server.Client(),
	)
	for _, quotaUnits := range []int{-1, 0, 11, 1_000_000} {
		authorized, err := validator.AuthorizeWithQuota(
			context.Background(),
			testServiceID,
			testAPIKey,
			quotaUnits,
		)
		if authorized || !errors.Is(err, ErrAuthorizationUnavailable) {
			t.Fatalf(
				"AuthorizeWithQuota(%d) = %v, %v",
				quotaUnits,
				authorized,
				err,
			)
		}
	}
	if calls.Load() != 0 {
		t.Fatalf("control-plane calls = %d, want 0", calls.Load())
	}
}

func TestProductionControlPlaneClientNeverFollowsRedirects(t *testing.T) {
	t.Parallel()
	var targetCalls atomic.Int64
	target := httptest.NewServer(http.HandlerFunc(func(
		writer http.ResponseWriter,
		_ *http.Request,
	) {
		targetCalls.Add(1)
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(
			`{"data":{"authorized":true},"requestId":"redirected"}`,
		))
	}))
	defer target.Close()
	redirect := httptest.NewServer(http.HandlerFunc(func(
		writer http.ResponseWriter,
		request *http.Request,
	) {
		http.Redirect(writer, request, target.URL, http.StatusFound)
	}))
	defer redirect.Close()
	endpoint, _ := url.Parse(redirect.URL)
	validator := NewControlPlaneValidator(
		endpoint,
		testControlPlaneSecret,
		time.Second,
	)
	authorized, err := validator.Authorize(
		context.Background(),
		testServiceID,
		testAPIKey,
	)
	if authorized || !errors.Is(err, ErrAuthorizationUnavailable) {
		t.Fatalf("Authorize() = %v, %v", authorized, err)
	}
	if targetCalls.Load() != 0 {
		t.Fatalf(
			"redirect target calls = %d, want 0",
			targetCalls.Load(),
		)
	}
}
