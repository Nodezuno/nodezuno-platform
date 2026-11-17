package upstream

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"google.golang.org/protobuf/types/known/structpb"
)

type callerFunc func(
	context.Context,
	string,
	string,
	*structpb.ListValue,
) (Response, error)

func (function callerFunc) Call(
	ctx context.Context,
	method string,
	requestID string,
	params *structpb.ListValue,
) (Response, error) {
	return function(ctx, method, requestID, params)
}

func TestFailoverUsesPrimaryWithoutTouchingSecondary(t *testing.T) {
	t.Parallel()
	primaryCalls := 0
	secondaryCalls := 0
	failover := mustFailover(t, []Target{
		{
			Caller: callerFunc(func(
				context.Context,
				string,
				string,
				*structpb.ListValue,
			) (Response, error) {
				primaryCalls++
				return responseResult("0x10"), nil
			}),
			Timeout: time.Second,
		},
		{
			Caller: callerFunc(func(
				context.Context,
				string,
				string,
				*structpb.ListValue,
			) (Response, error) {
				secondaryCalls++
				return responseResult("0x11"), nil
			}),
			Timeout: time.Second,
		},
	})

	response, err := failover.Call(
		context.Background(),
		"eth_blockNumber",
		"primary-success",
		&structpb.ListValue{},
	)
	if err != nil {
		t.Fatalf("Call() error = %v", err)
	}
	if response.Result.GetStringValue() != "0x10" {
		t.Fatalf("result = %v", response.Result)
	}
	if primaryCalls != 1 || secondaryCalls != 0 {
		t.Fatalf(
			"primary calls = %d, secondary calls = %d",
			primaryCalls,
			secondaryCalls,
		)
	}
}

func TestFailoverKeepsProviderCredentialsIsolated(t *testing.T) {
	t.Parallel()
	primaryEndpoint, _ := url.Parse(
		"https://primary.invalid/rpc/primary-path-secret",
	)
	secondaryEndpoint, _ := url.Parse(
		"https://secondary.invalid/rpc/secondary-path-secret",
	)
	primary := NewClientWithHTTPClientAndHeaders(
		primaryEndpoint,
		&http.Client{Transport: roundTripFunc(func(
			request *http.Request,
		) (*http.Response, error) {
			if request.Header.Get("Authorization") !=
				"Bearer primary-provider-secret" {
				t.Errorf(
					"primary Authorization = %q",
					request.Header.Get("Authorization"),
				)
			}
			if request.Header.Get("X-API-Key") != "" {
				t.Error("secondary credential reached the primary")
			}
			return &http.Response{
				StatusCode: http.StatusServiceUnavailable,
				Header:     make(http.Header),
				Body:       io.NopCloser(strings.NewReader("unavailable")),
				Request:    request,
			}, nil
		})},
		map[string]string{
			"Authorization": "Bearer primary-provider-secret",
		},
		4096,
	)
	secondary := NewClientWithHTTPClientAndHeaders(
		secondaryEndpoint,
		&http.Client{Transport: roundTripFunc(func(
			request *http.Request,
		) (*http.Response, error) {
			if request.Header.Get("X-API-Key") !=
				"secondary-provider-secret" {
				t.Errorf(
					"secondary X-API-Key = %q",
					request.Header.Get("X-API-Key"),
				)
			}
			if request.Header.Get("Authorization") != "" {
				t.Error("primary credential reached the secondary")
			}
			return &http.Response{
				StatusCode: http.StatusOK,
				Header: http.Header{
					"Content-Type": []string{"application/json"},
				},
				Body: io.NopCloser(strings.NewReader(
					`{"jsonrpc":"2.0","id":"credential-failover","result":"0x22"}`,
				)),
				Request: request,
			}, nil
		})},
		map[string]string{
			"X-API-Key": "secondary-provider-secret",
		},
		4096,
	)
	failover := mustFailover(t, []Target{
		{Caller: primary, Timeout: time.Second},
		{Caller: secondary, Timeout: time.Second},
	})

	response, err := failover.Call(
		context.Background(),
		"eth_blockNumber",
		"credential-failover",
		&structpb.ListValue{},
	)
	if err != nil {
		t.Fatalf("Call() error = %v", err)
	}
	if response.Result.GetStringValue() != "0x22" {
		t.Fatalf("result = %v", response.Result)
	}
}

func TestFailoverRetriesInvalidResponse(t *testing.T) {
	t.Parallel()
	attempts := 0
	failover := mustFailover(t, []Target{
		{
			Caller: callerFunc(func(
				context.Context,
				string,
				string,
				*structpb.ListValue,
			) (Response, error) {
				attempts++
				return Response{}, nil
			}),
			Timeout: time.Second,
		},
		{
			Caller: callerFunc(func(
				context.Context,
				string,
				string,
				*structpb.ListValue,
			) (Response, error) {
				attempts++
				return responseResult("0x33"), nil
			}),
			Timeout: time.Second,
		},
	})
	response, err := failover.Call(
		context.Background(),
		"eth_blockNumber",
		"invalid-response",
		&structpb.ListValue{},
	)
	if err != nil {
		t.Fatalf("Call() error = %v", err)
	}
	if attempts != 2 || response.Result.GetStringValue() != "0x33" {
		t.Fatalf("attempts = %d, response = %#v", attempts, response)
	}
}

func TestFailoverProvesEthereumMainnetAcrossProviders(t *testing.T) {
	t.Parallel()
	failover := mustFailover(t, []Target{
		{
			Caller: callerFunc(func(
				context.Context,
				string,
				string,
				*structpb.ListValue,
			) (Response, error) {
				return responseResult("0x2105"), nil
			}),
			Timeout: time.Second,
		},
		{
			Caller: callerFunc(func(
				context.Context,
				string,
				string,
				*structpb.ListValue,
			) (Response, error) {
				return responseResult("0x1"), nil
			}),
			Timeout: time.Second,
		},
	})
	response, err := failover.Call(
		context.Background(),
		"eth_chainId",
		"mainnet-proof",
		&structpb.ListValue{},
	)
	if err != nil {
		t.Fatalf("Call() error = %v", err)
	}
	if response.Result.GetStringValue() != "0x1" {
		t.Fatalf("chain ID = %q", response.Result.GetStringValue())
	}
}

func TestFailoverReturnsValidRPCErrorWithoutRetry(t *testing.T) {
	t.Parallel()
	secondaryCalled := false
	failover := mustFailover(t, []Target{
		{
			Caller: callerFunc(func(
				context.Context,
				string,
				string,
				*structpb.ListValue,
			) (Response, error) {
				return Response{Error: &RPCError{
					Code:    -32602,
					Message: "invalid params",
				}}, nil
			}),
			Timeout: time.Second,
		},
		{
			Caller: callerFunc(func(
				context.Context,
				string,
				string,
				*structpb.ListValue,
			) (Response, error) {
				secondaryCalled = true
				return responseResult("0x44"), nil
			}),
			Timeout: time.Second,
		},
	})
	response, err := failover.Call(
		context.Background(),
		"eth_call",
		"rpc-error",
		&structpb.ListValue{},
	)
	if err != nil {
		t.Fatalf("Call() error = %v", err)
	}
	if response.Error == nil || response.Error.Code != -32602 {
		t.Fatalf("response = %#v", response)
	}
	if secondaryCalled {
		t.Fatal("valid JSON-RPC error was retried")
	}
}

func TestFailoverSanitizesAllFailuresAndStopsAfterTwoAttempts(t *testing.T) {
	t.Parallel()
	calls := make([]int, 4)
	targets := make([]Target, 4)
	for index := range targets {
		index := index
		targets[index] = Target{
			Caller: callerFunc(func(
				context.Context,
				string,
				string,
				*structpb.ListValue,
			) (Response, error) {
				calls[index]++
				return Response{}, fmt.Errorf(
					"dial https://provider-%d.invalid/rpc-secret-%d with Bearer header-secret-%d",
					index,
					index,
					index,
				)
			}),
			Timeout: time.Second,
		}
	}
	failover := mustFailover(t, targets)
	_, err := failover.Call(
		context.Background(),
		"eth_getBalance",
		"all-fail",
		&structpb.ListValue{},
	)
	if !errors.Is(err, ErrUnavailable) {
		t.Fatalf("Call() error = %v, want ErrUnavailable", err)
	}
	if calls[0] != 1 || calls[1] != 1 || calls[2] != 0 || calls[3] != 0 {
		t.Fatalf("target calls = %v, want [1 1 0 0]", calls)
	}
	for _, secret := range []string{
		"provider-0.invalid",
		"rpc-secret-0",
		"header-secret-0",
		"provider-1.invalid",
	} {
		if strings.Contains(err.Error(), secret) {
			t.Fatalf("failover error disclosed %q: %v", secret, err)
		}
	}
}

func TestFailoverCircuitSkipsFailedPrimaryUntilCooldown(t *testing.T) {
	t.Parallel()
	now := time.Unix(1_800_000_000, 0)
	primaryCalls := 0
	secondaryCalls := 0
	failover, err := newFailover(
		[]Target{
			{
				Caller: callerFunc(func(
					context.Context,
					string,
					string,
					*structpb.ListValue,
				) (Response, error) {
					primaryCalls++
					if primaryCalls == 1 {
						return Response{}, ErrUnavailable
					}
					return responseResult("0x55"), nil
				}),
				Timeout: time.Second,
			},
			{
				Caller: callerFunc(func(
					context.Context,
					string,
					string,
					*structpb.ListValue,
				) (Response, error) {
					secondaryCalls++
					return responseResult("0x66"), nil
				}),
				Timeout: time.Second,
			},
		},
		func() time.Time { return now },
		30*time.Second,
	)
	if err != nil {
		t.Fatalf("newFailover() error = %v", err)
	}
	for range 2 {
		if _, err := failover.Call(
			context.Background(),
			"eth_blockNumber",
			"circuit",
			&structpb.ListValue{},
		); err != nil {
			t.Fatalf("Call() error = %v", err)
		}
	}
	if primaryCalls != 1 || secondaryCalls != 2 {
		t.Fatalf(
			"before cooldown primary calls = %d, secondary calls = %d",
			primaryCalls,
			secondaryCalls,
		)
	}
	now = now.Add(31 * time.Second)
	response, err := failover.Call(
		context.Background(),
		"eth_blockNumber",
		"circuit-recovered",
		&structpb.ListValue{},
	)
	if err != nil {
		t.Fatalf("Call() error = %v", err)
	}
	if response.Result.GetStringValue() != "0x55" ||
		primaryCalls != 2 ||
		secondaryCalls != 2 {
		t.Fatalf(
			"after cooldown result = %v, primary = %d, secondary = %d",
			response.Result,
			primaryCalls,
			secondaryCalls,
		)
	}
}

func TestFailoverAppliesPerAttemptDeadline(t *testing.T) {
	t.Parallel()
	failover := mustFailover(t, []Target{
		{
			Caller: callerFunc(func(
				ctx context.Context,
				_ string,
				_ string,
				_ *structpb.ListValue,
			) (Response, error) {
				<-ctx.Done()
				return Response{}, ctx.Err()
			}),
			Timeout: 100 * time.Millisecond,
		},
		{
			Caller: callerFunc(func(
				context.Context,
				string,
				string,
				*structpb.ListValue,
			) (Response, error) {
				return responseResult("0x77"), nil
			}),
			Timeout: time.Second,
		},
	})
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	started := time.Now()
	response, err := failover.Call(
		ctx,
		"eth_blockNumber",
		"attempt-deadline",
		&structpb.ListValue{},
	)
	if err != nil {
		t.Fatalf("Call() error = %v", err)
	}
	if response.Result.GetStringValue() != "0x77" {
		t.Fatalf("result = %v", response.Result)
	}
	if elapsed := time.Since(started); elapsed > 750*time.Millisecond {
		t.Fatalf("failover took %s, expected bounded attempt", elapsed)
	}
}

func TestFailoverNeverRetriesMethodOutsideSafeCatalog(t *testing.T) {
	t.Parallel()
	secondaryCalled := false
	failover := mustFailover(t, []Target{
		{
			Caller: callerFunc(func(
				context.Context,
				string,
				string,
				*structpb.ListValue,
			) (Response, error) {
				return Response{}, ErrUnavailable
			}),
			Timeout: time.Second,
		},
		{
			Caller: callerFunc(func(
				context.Context,
				string,
				string,
				*structpb.ListValue,
			) (Response, error) {
				secondaryCalled = true
				return responseResult("0x88"), nil
			}),
			Timeout: time.Second,
		},
	})
	_, err := failover.Call(
		context.Background(),
		"eth_sendRawTransaction",
		"unsafe-method",
		&structpb.ListValue{},
	)
	if !errors.Is(err, ErrUnavailable) {
		t.Fatalf("Call() error = %v, want ErrUnavailable", err)
	}
	if secondaryCalled {
		t.Fatal("unsafe method was failed over")
	}
}

func mustFailover(t *testing.T, targets []Target) *Failover {
	t.Helper()
	failover, err := NewFailover(targets)
	if err != nil {
		t.Fatalf("NewFailover() error = %v", err)
	}
	return failover
}

func responseResult(value string) Response {
	return Response{Result: structpb.NewStringValue(value)}
}
