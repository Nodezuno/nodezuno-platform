package upstream

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"google.golang.org/protobuf/types/known/structpb"
)

const (
	maximumFailoverTargets = 4
	maximumCallAttempts    = 2
	minimumTargetTimeout   = 100 * time.Millisecond
	maximumTargetTimeout   = 60 * time.Second
	defaultCircuitCooldown = 30 * time.Second
	maximumChainIDTimeout  = 2 * time.Second
)

var safeFailoverMethods = map[string]struct{}{
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

// Target is one isolated provider client and its per-attempt deadline.
type Target struct {
	Caller  Caller
	Timeout time.Duration
}

// Failover calls immutable providers in deterministic operator order.
type Failover struct {
	mutex     sync.Mutex
	targets   []Target
	openUntil []time.Time
	now       func() time.Time
	cooldown  time.Duration
}

// NewFailover creates a bounded failover caller for one to four providers.
func NewFailover(targets []Target) (*Failover, error) {
	return newFailover(targets, time.Now, defaultCircuitCooldown)
}

func newFailover(
	targets []Target,
	now func() time.Time,
	cooldown time.Duration,
) (*Failover, error) {
	if len(targets) < 1 || len(targets) > maximumFailoverTargets {
		return nil, fmt.Errorf(
			"Ethereum failover requires 1 to %d targets",
			maximumFailoverTargets,
		)
	}
	if now == nil || cooldown <= 0 || cooldown > time.Minute {
		return nil, errors.New("Ethereum failover timing is invalid")
	}
	copiedTargets := make([]Target, len(targets))
	for index, target := range targets {
		if target.Caller == nil ||
			target.Timeout < minimumTargetTimeout ||
			target.Timeout > maximumTargetTimeout {
			return nil, errors.New(
				"Ethereum failover target configuration is invalid",
			)
		}
		copiedTargets[index] = target
	}
	return &Failover{
		targets:   copiedTargets,
		openUntil: make([]time.Time, len(targets)),
		now:       now,
		cooldown:  cooldown,
	}, nil
}

// Call makes at most two attempts for the enforced safe read-only catalog.
func (failover *Failover) Call(
	ctx context.Context,
	method string,
	requestID string,
	params *structpb.ListValue,
) (Response, error) {
	if ctx == nil {
		return Response{}, ErrUnavailable
	}
	if _, safe := safeFailoverMethods[method]; !safe {
		return failover.callWithoutFailover(
			ctx,
			failover.targets[0],
			method,
			requestID,
			params,
		)
	}

	indices := failover.availableTargets(failover.now())
	if len(indices) == 0 {
		return Response{}, ErrUnavailable
	}
	if len(indices) > maximumCallAttempts {
		indices = indices[:maximumCallAttempts]
	}

	var lastError error
	for position, index := range indices {
		if err := ctx.Err(); err != nil {
			return Response{}, err
		}
		target := failover.targets[index]
		timeout := boundedAttemptTimeout(
			ctx,
			target.Timeout,
			len(indices)-position,
			method,
		)
		attemptContext, cancel := context.WithTimeout(ctx, timeout)
		response, err := target.Caller.Call(
			attemptContext,
			method,
			requestID,
			params,
		)
		cancel()

		if parentError := ctx.Err(); parentError != nil {
			return Response{}, parentError
		}
		if err == nil && usableResponse(method, response) {
			failover.markSuccess(index)
			return response, nil
		}
		if err == nil {
			err = ErrInvalidResponse
		}
		lastError = publicUpstreamError(err)
		failover.markFailure(index)
	}
	if lastError == nil {
		return Response{}, ErrUnavailable
	}
	return Response{}, lastError
}

func (failover *Failover) callWithoutFailover(
	ctx context.Context,
	target Target,
	method string,
	requestID string,
	params *structpb.ListValue,
) (Response, error) {
	attemptContext, cancel := context.WithTimeout(ctx, target.Timeout)
	defer cancel()
	response, err := target.Caller.Call(
		attemptContext,
		method,
		requestID,
		params,
	)
	if parentError := ctx.Err(); parentError != nil {
		return Response{}, parentError
	}
	if err != nil {
		return Response{}, publicUpstreamError(err)
	}
	if !usableResponse(method, response) {
		return Response{}, ErrInvalidResponse
	}
	return response, nil
}

func (failover *Failover) availableTargets(now time.Time) []int {
	failover.mutex.Lock()
	defer failover.mutex.Unlock()
	available := make([]int, 0, len(failover.targets))
	for index := range failover.targets {
		if !now.Before(failover.openUntil[index]) {
			available = append(available, index)
		}
	}
	return available
}

func (failover *Failover) markSuccess(index int) {
	failover.mutex.Lock()
	defer failover.mutex.Unlock()
	failover.openUntil[index] = time.Time{}
}

func (failover *Failover) markFailure(index int) {
	openUntil := failover.now().Add(failover.cooldown)
	failover.mutex.Lock()
	defer failover.mutex.Unlock()
	failover.openUntil[index] = openUntil
}

func boundedAttemptTimeout(
	ctx context.Context,
	configured time.Duration,
	attemptsRemaining int,
	method string,
) time.Duration {
	if method == "eth_chainId" && configured > maximumChainIDTimeout {
		configured = maximumChainIDTimeout
	}
	if deadline, exists := ctx.Deadline(); exists {
		remaining := time.Until(deadline)
		if attemptsRemaining > 1 {
			remaining /= time.Duration(attemptsRemaining)
		}
		if remaining < configured {
			configured = remaining
		}
	}
	if configured <= 0 {
		return time.Nanosecond
	}
	return configured
}

func usableResponse(method string, response Response) bool {
	if (response.Result == nil) == (response.Error == nil) {
		return false
	}
	if method != "eth_chainId" {
		return true
	}
	return response.Error == nil &&
		response.Result.GetStringValue() == "0x1"
}

func publicUpstreamError(err error) error {
	var statusError *HTTPStatusError
	switch {
	case errors.Is(err, context.Canceled):
		return ErrUnavailable
	case errors.Is(err, context.DeadlineExceeded):
		return context.DeadlineExceeded
	case errors.Is(err, ErrInvalidResponse):
		return ErrInvalidResponse
	case errors.Is(err, ErrResponseTooLarge):
		return ErrResponseTooLarge
	case errors.As(err, &statusError):
		if statusError.StatusCode < 100 || statusError.StatusCode > 599 {
			return ErrUnavailable
		}
		return &HTTPStatusError{StatusCode: statusError.StatusCode}
	default:
		return ErrUnavailable
	}
}
