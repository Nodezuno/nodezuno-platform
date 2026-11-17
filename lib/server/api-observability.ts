import { HttpProblem, requestIdFor, responseFromError } from "./http.ts";

// Route templates, methods, and error categories are defined in source. Never
// add a URL, query, order ID, hash, address, cookie, or payload to this record.
const REVIEW_API_OPERATIONS = {
  "review.order.create": { method: "POST", route: "/api/v1/review-orders" },
  "review.order.read": { method: "GET", route: "/api/v1/review-orders/:id" },
  "review.access.exchange": { method: "POST", route: "/api/v1/review-orders/:id/access" },
  "review.payment.create": { method: "POST", route: "/api/v1/review-orders/:id/payment-intents" },
  "review.payment.claim": { method: "POST", route: "/api/v1/review-orders/:id/payment-intents/:intentId/claims" },
  "review.confirmation.download": { method: "GET", route: "/api/v1/review-orders/:id/payment-confirmations/:confirmationId" },
  "review.deliverable.download": { method: "GET", route: "/api/v1/review-orders/:id/deliverables/:deliverableId/download" },
} as const;

type ReviewApiOperation = keyof typeof REVIEW_API_OPERATIONS;
type FailureKind = "client_rejected" | "dependency_unavailable" | "database_busy" | "database_locked" | "unexpected_error";
type StatusClass = "2xx" | "3xx" | "4xx" | "5xx";
type LogLevel = "info" | "warn" | "error";
type LogWindow = {
  startedAt: number;
  emitted: Record<LogLevel, number>;
  suppressed: Record<StatusClass, number>;
};

const WINDOW_MS = 60_000;
// Reserve an error budget so successful polling or rejected requests cannot
// consume every diagnostic slot before a dependency failure occurs.
const COMPLETION_LOG_LIMITS: Record<LogLevel, number> = { info: 40, warn: 15, error: 15 };
const logWindows = new Map<ReviewApiOperation, LogWindow>();
// A syntactically valid code could still be a customer identifier if a future
// dependency constructs HttpProblem incorrectly. Log only source-owned codes;
// preserve all other codes solely in the existing customer response contract.
const OBSERVED_PROBLEM_CODES = new Set([
  "service_unavailable",
  "request_aborted",
  "request_body_timeout",
  "request_too_large",
  "invalid_body_encoding",
  "invalid_json",
  "invalid_content_length",
  "unsupported_media_type",
  "origin_required",
  "cross_origin_request",
  "invalid_idempotency_key",
  "idempotency_conflict",
  "validation_failed",
  "rate_limit_exceeded",
  "challenge_required",
  "invalid_challenge",
  "review_order_id_invalid",
  "review_order_not_found",
  "review_order_unavailable",
  "review_access_required",
  "review_access_invalid",
  "review_access_already_issued",
  "database_unavailable",
  "payment_intent_unavailable",
  "payment_verifier_unhealthy",
  "stablecoin_payments_unavailable",
  "deliverable_storage_unavailable",
  "deliverable_storage_identity_missing",
  "deliverable_unavailable",
]);

/**
 * Observe response preparation without reading request/response bodies or
 * changing authorization, idempotency, or payment settlement behavior.
 */
export async function observeReviewApiRequest(
  request: Request,
  operation: ReviewApiOperation,
  handler: (requestId: string) => Promise<Response>,
): Promise<Response> {
  // This correlation value must be created by the server. Even a syntactically
  // valid incoming cf-ray or X-Request-Id can contain customer-supplied text.
  const requestId = requestIdFor(request, { allowEdgeId: false });
  const startedAt = performance.now();
  const knownOperation = typeof operation === "string" && Object.hasOwn(REVIEW_API_OPERATIONS, operation);
  let response: Response;
  let failureKind: FailureKind | undefined;
  let errorCode: string | undefined;

  try {
    // Keep the runtime boundary as strict as its TypeScript type so a future
    // caller cannot turn request data into route labels or unbounded map keys.
    if (!knownOperation) {
      throw new HttpProblem(503, "api_configuration_invalid", "The service is temporarily unavailable.");
    }
    if (request.signal.aborted) {
      throw new HttpProblem(408, "request_aborted", "The request was interrupted. Retry when your connection is stable.");
    }
    response = await handler(requestId);
  } catch (error) {
    failureKind = classifyFailure(error);
    errorCode = error instanceof HttpProblem
      ? OBSERVED_PROBLEM_CODES.has(error.code) ? error.code : "other_http_problem"
      : "service_unavailable";
    // Emit one bounded completion event, rather than a second failure log that
    // bypasses the operation's budget during an outage or abusive request burst.
    response = responseFromError(error, requestId, { logFailure: false });
  }

  const durationMs = Math.min(3_600_000, Math.max(0, Math.round(performance.now() - startedAt)));
  if (knownOperation) {
    recordCompletion({ operation, requestId, status: response.status, durationMs, failureKind, errorCode });
  }

  const headers = new Headers(response.headers);
  headers.set("X-Request-Id", requestId);
  headers.set("Server-Timing", `app;dur=${durationMs}`);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  // Only response preparation is timed. Redirect target URLs and downloaded
  // content are neither inspected nor copied into telemetry.
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function classifyFailure(error: unknown): FailureKind {
  // SQLite driver codes are a fixed, safe signal. Do not inspect its message,
  // SQL text, parameters, stack, or arbitrary error name.
  try {
    if (error && typeof error === "object" && "code" in error) {
      if (error.code === "SQLITE_BUSY" || error.code === "SQLITE_BUSY_SNAPSHOT" || error.code === "SQLITE_BUSY_TIMEOUT") return "database_busy";
      if (error.code === "SQLITE_LOCKED" || error.code === "SQLITE_LOCKED_SHAREDCACHE") return "database_locked";
    }
  } catch {
    // An arbitrary thrown object may implement a getter. Classification must
    // not replace the original failure if that getter itself throws.
    return "unexpected_error";
  }
  if (error instanceof HttpProblem) {
    return error.status >= 500 ? "dependency_unavailable" : "client_rejected";
  }
  return "unexpected_error";
}

function recordCompletion(record: {
  operation: ReviewApiOperation;
  requestId: string;
  status: number;
  durationMs: number;
  failureKind?: FailureKind;
  errorCode?: string;
}): void {
  const now = performance.now();
  let window = logWindows.get(record.operation);
  if (!window || now - window.startedAt >= WINDOW_MS) {
    if (window && Object.values(window.suppressed).some((count) => count > 0)) {
      safeLog("warn", {
        event: "review_api_telemetry_suppressed",
        operation: record.operation,
        ...REVIEW_API_OPERATIONS[record.operation],
        windowMs: WINDOW_MS,
        suppressed: window.suppressed,
      });
    }
    window = {
      startedAt: now,
      emitted: { info: 0, warn: 0, error: 0 },
      suppressed: { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 },
    };
    logWindows.set(record.operation, window);
  }
  const level: LogLevel = record.status >= 500 ? "error" : record.status >= 400 ? "warn" : "info";
  if (window.emitted[level] >= COMPLETION_LOG_LIMITS[level]) {
    const statusClass: StatusClass = record.status >= 500 ? "5xx" : record.status >= 400 ? "4xx" : record.status >= 300 ? "3xx" : "2xx";
    window.suppressed[statusClass] = Math.min(Number.MAX_SAFE_INTEGER, window.suppressed[statusClass] + 1);
    return;
  }
  window.emitted[level] += 1;
  safeLog(level, {
    event: "review_api_request_completed",
    ...record,
    ...REVIEW_API_OPERATIONS[record.operation],
  });
}

function safeLog(level: LogLevel, fields: Record<string, unknown>): void {
  try {
    const message = JSON.stringify({ level, ...fields });
    if (level === "error") console.error(message);
    else if (level === "warn") console.warn(message);
    else console.info(message);
  } catch {
    // A diagnostic sink failure must never alter a payment or access response.
  }
}
