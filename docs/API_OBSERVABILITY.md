# Customer API observability

Implementation date: 2026-10-06.

The seven customer review handlers now use `observeReviewApiRequest` from
`lib/server/api-observability.ts`. This is application telemetry for operating
the order journey. It does not replace immutable payment evidence, the
notification outbox, administrator audit records, or external monitoring.

## What the observer records

Each completion record includes a source-defined operation and route template,
source-defined HTTP method, server-generated request ID, response status, and
the elapsed milliseconds used to prepare the response. A thrown failure also
includes an allowlisted category and, for `HttpProblem`, a source-allowlisted
machine error code. Unknown problem codes become `other_http_problem` in
telemetry only. Correlation IDs are generated UUIDs, never incoming header text.

The same request ID appears in the `X-Request-Id` response header and the
existing JSON response contract. Operators can use an ID supplied by a
customer to find the corresponding completion event. The `Server-Timing`
header exposes only total application response preparation time.

Operations:

| Operation | Method | Route template |
| --- | --- | --- |
| `review.order.create` | POST | `/api/v1/review-orders` |
| `review.order.read` | GET | `/api/v1/review-orders/:id` |
| `review.access.exchange` | POST | `/api/v1/review-orders/:id/access` |
| `review.payment.create` | POST | `/api/v1/review-orders/:id/payment-intents` |
| `review.payment.claim` | POST | `/api/v1/review-orders/:id/payment-intents/:intentId/claims` |
| `review.confirmation.download` | GET | `/api/v1/review-orders/:id/payment-confirmations/:confirmationId` |
| `review.deliverable.download` | GET | `/api/v1/review-orders/:id/deliverables/:deliverableId/download` |

Example event:

```json
{
  "level": "info",
  "event": "review_api_request_completed",
  "operation": "review.order.create",
  "requestId": "example-server-generated-request-id",
  "status": 201,
  "durationMs": 42,
  "method": "POST",
  "route": "/api/v1/review-orders"
}
```

SQLite driver codes distinguish `database_busy` and `database_locked` from
other failures. No SQL, parameters, database file path, error message, stack,
or arbitrary error name is read into the record. Known application failures
use `client_rejected` or `dependency_unavailable`; other exceptions use
`unexpected_error`. The existing problem response remains authoritative.

## Privacy and cost controls

The observer never reads request or response bodies for telemetry. It never
logs an actual URL, query string, order ID, email, Telegram username, IP
address, wallet, transaction hash, access capability, cookie, idempotency key,
download filename, or signed object-storage URL. Route placeholders are
literal strings defined in source. Response wrapping preserves status, body,
existing cookies and headers, including private download redirects.

Each operation has separate per-process, sixty-second log budgets: forty
successful/redirect completions, fifteen client-error completions, and
fifteen server-error completions. Success or client-error bursts cannot spend
the server-error budget. Further events increment bounded counters by status
class. On the next request after the window ends, a
`review_api_telemetry_suppressed` record reports those counters. The fixed
seven-operation map prevents request data from expanding metric dimensions.

Counters are intentionally in memory. Restarting a process discards its
current window, and a window with no later request does not emit a summary.
These logs must not be used as an exact billing count or a durable security
audit. Docker log rotation and CloudWatch retention remain deployment
responsibilities. The observer adds no paid service or database writes.

All observed responses carry `Referrer-Policy: no-referrer` and
`X-Content-Type-Options: nosniff`. Existing cache restrictions remain in place.
A request already aborted before its handler starts receives the existing
408 problem contract. An operation already in progress is allowed to finish;
an artificial timeout must not abandon a payment or idempotent write whose
outcome has become uncertain.

## Operating the logs

For a customer-reported failure, search `review_api_request_completed` by
`requestId`, then inspect its operation, status, duration and safe failure
category. Repeated `database_busy` or `database_locked` events call for
checking worker overlap, storage health and SQLite lock contention. Repeated
`dependency_unavailable` events call for checking the existing payment,
email, storage and readiness diagnostics for that operation.

CloudWatch queries may group these events by `operation` and `status` and
calculate percentiles of `durationMs`. Any alert based on individual log
counts must account for suppression; external health checks and existing
worker alarms remain necessary. This change does not provision AWS alerts.

Download timing measures the preparation of a confirmation response or
signed redirect, not the later browser transfer from object storage. Requests
rejected before a route handler runs, unsupported methods, framework errors,
process crashes, and non-review API routes are outside this observer.

## Verification scope

The implementation preserves handler authorization, same-origin checks,
strict body validation, rate limits, idempotency, immutable terms, claim
verification and settlement transitions. No schema or payment state change
was introduced. Automated tests and real payment/email actions were not run,
as requested by the owner. Compilation and lint results should be recorded
with the release handoff; this document does not predeclare them successful.
