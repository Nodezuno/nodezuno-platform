// Browser request handling for order creation. The form owns interaction and focus state.
type ReviewOrderReceipt = {
  id: string;
  reference?: string;
  status?: string;
  trackingPath?: string;
  accessToken?: string;
};

type ReviewOrderEnvelope = {
  data?: { order?: ReviewOrderReceipt } & ReviewOrderReceipt;
  title?: string;
  detail?: string;
  fields?: Record<string, string>;
  requestId?: string;
};

const REVIEW_REQUEST_TIMEOUT_MS = 15_000;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function secureIdempotencyKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readReviewEnvelope(response: Response) {
  try {
    const body = await response.json();
    return body && typeof body === "object"
      ? (body as ReviewOrderEnvelope)
      : ({} as ReviewOrderEnvelope);
  } catch {
    return {} as ReviewOrderEnvelope;
  }
}

export function reviewRequestError(
  response: Response,
  body: ReviewOrderEnvelope,
  fallback: string,
) {
  const message = body.title ?? body.detail ?? fallback;
  const candidate = body.requestId ?? response.headers.get("x-request-id") ?? "";
  return REQUEST_ID_PATTERN.test(candidate)
    ? `${message} Request ID: ${candidate}.`
    : message;
}

export async function postReviewRequest(
  input: RequestInfo | URL,
  init: RequestInit,
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    REVIEW_REQUEST_TIMEOUT_MS,
  );
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    return { response, body: await readReviewEnvelope(response) };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        "The request timed out. You can retry the same details without creating a duplicate order.",
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function trackingDestination(order: ReviewOrderReceipt) {
  const fallback = `/review/${encodeURIComponent(order.id)}`;
  const path = order.trackingPath?.startsWith("/review/") && !order.trackingPath.startsWith("//")
    ? order.trackingPath
    : fallback;
  if (!order.accessToken) return path;
  return `${path}#access=${encodeURIComponent(order.accessToken)}`;
}
