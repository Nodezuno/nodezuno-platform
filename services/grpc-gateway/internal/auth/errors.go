package auth

import "errors"

var (
	// ErrAuthorizationUnavailable is deliberately credential-free.
	ErrAuthorizationUnavailable = errors.New("authorization unavailable")
	// ErrQuotaExhausted distinguishes a durable admission denial from outages.
	ErrQuotaExhausted = errors.New("authorization quota exhausted")
)
