export const MAX_JSON_BODY_BYTES = 32 * 1024;
export const REQUEST_BODY_DEADLINE_MS = 10_000;

export type ProblemOptions = {
  status: number;
  code: string;
  title: string;
  detail?: string;
  requestId: string;
  fields?: Record<string, string>;
  headers?: HeadersInit;
};

export type ParsedUser = {
  email: string;
  fullName: string | null;
  displayName: string;
  accountId?: string | null;
  contactEmail?: string | null;
  authMethod?: "email" | "google" | "evm" | "solana" | "chatgpt";
  walletAddress?: string | null;
};

export class HttpProblem extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;
  readonly headers?: HeadersInit;

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: Record<string, string>,
    headers?: HeadersInit,
  ) {
    super(message);
    this.name = "HttpProblem";
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.headers = headers;
  }
}

function baseHeaders(requestId: string): Headers {
  return new Headers({
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": "application/json; charset=utf-8",
    "X-Request-Id": requestId,
  });
}

export function apiJson(
  data: unknown,
  options: {
    requestId: string;
    status?: number;
    headers?: HeadersInit;
    cacheControl?: string;
  },
): Response {
  const headers = baseHeaders(options.requestId);
  if (options.headers) {
    new Headers(options.headers).forEach((value, key) =>
      headers.set(key, value),
    );
  }
  headers.set(
    "Cache-Control",
    options.cacheControl ?? "no-store, max-age=0",
  );
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Request-Id", options.requestId);
  return new Response(JSON.stringify(data), {
    status: options.status ?? 200,
    headers,
  });
}

export function apiRedirect(
  location: string | URL,
  options: {
    requestId: string;
    status: 301 | 302 | 303 | 307 | 308;
  },
): Response {
  const headers = baseHeaders(options.requestId);
  headers.delete("Content-Type");
  headers.set("Location", location.toString());
  return new Response(null, {
    status: options.status,
    headers,
  });
}

export function problemResponse(options: ProblemOptions): Response {
  const headers = baseHeaders(options.requestId);
  headers.set("Content-Type", "application/problem+json; charset=utf-8");
  if (options.headers) {
    new Headers(options.headers).forEach((value, key) =>
      headers.set(key, value),
    );
  }
  headers.set("Cache-Control", "no-store, max-age=0");
  headers.set("Content-Type", "application/problem+json; charset=utf-8");
  headers.set("X-Request-Id", options.requestId);
  return new Response(
    JSON.stringify({
      type: `https://nodezuno.com/problems/${options.code}`,
      title: options.title,
      status: options.status,
      code: options.code,
      detail: options.detail,
      fields: options.fields,
      requestId: options.requestId,
    }),
    { status: options.status, headers },
  );
}

export function responseFromError(
  error: unknown,
  requestId: string,
  options: { logFailure?: boolean } = {},
): Response {
  if (error instanceof HttpProblem) {
    if (error.status >= 500 && options.logFailure !== false) {
      console.error(JSON.stringify({
        level: "error",
        event: "api_dependency_failed",
        requestId,
        status: error.status,
        code: error.code,
      }));
    }
    return problemResponse({
      status: error.status,
      code: error.code,
      title: error.message,
      detail: error.status >= 500 ? "Please try again shortly." : undefined,
      fields: error.fields,
      requestId,
      headers: error.headers,
    });
  }

  if (options.logFailure !== false) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "api_request_failed",
        requestId,
        error:
          error instanceof Error
            ? { name: error.name }
            : { name: "UnknownError" },
      }),
    );
  }
  return problemResponse({
    status: 503,
    code: "service_unavailable",
    title: "The service is temporarily unavailable.",
    detail: "Please try again shortly.",
    requestId,
  });
}

export function requestIdFor(
  request: Request,
  options: { allowEdgeId?: boolean } = {},
): string {
  const edgeId =
    options.allowEdgeId === false || process.env.NODEZUNO_RUNTIME === "container"
      ? null
      : request.headers.get("cf-ray");
  return edgeId && /^[A-Za-z0-9-]{8,80}$/.test(edgeId)
    ? edgeId
    : crypto.randomUUID();
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    throw new HttpProblem(
      403,
      "cross_origin_request",
      "Cross-site submissions are not allowed.",
    );
  }
  if (!origin) {
    throw new HttpProblem(
      403,
      "origin_required",
      "Browser-origin verification is required for submissions.",
    );
  }

  let expected: string;
  try {
    const configuredOrigin =
      process.env.NODEZUNO_RUNTIME === "container"
        ? process.env.PUBLIC_ORIGIN?.trim()
        : undefined;
    expected = configuredOrigin
      ? new URL(configuredOrigin).origin
      : new URL(request.url).origin;
  } catch {
    throw new HttpProblem(
      400,
      "invalid_request_url",
      "The request URL is invalid.",
    );
  }
  if (origin !== expected) {
    throw new HttpProblem(
      403,
      "cross_origin_request",
      "Cross-site submissions are not allowed.",
    );
  }
}

export function requestHasMediaType(
  request: Request,
  expectedMediaType: string,
): boolean {
  const contentType = request.headers.get("content-type");
  if (contentType === null) return false;
  const separator = contentType.indexOf(";");
  const mediaType =
    separator === -1 ? contentType : contentType.slice(0, separator);
  return (
    mediaType.trim().toLowerCase() === expectedMediaType.toLowerCase()
  );
}

export async function readJsonBody(request: Request): Promise<unknown> {
  if (!requestHasMediaType(request, "application/json")) {
    throw new HttpProblem(
      415,
      "unsupported_media_type",
      "Send the request as application/json.",
    );
  }

  const body = await readTextBody(request, MAX_JSON_BODY_BYTES);
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new HttpProblem(
      400,
      "invalid_json",
      "The request body is not valid JSON.",
    );
  }
}

export async function readTextBody(
  request: Request,
  maximumBytes: number,
): Promise<string> {
  const declaredHeader = request.headers.get("content-length");
  if (declaredHeader !== null) {
    if (!/^[0-9]+$/.test(declaredHeader)) {
      throw new HttpProblem(
        400,
        "invalid_content_length",
        "The request Content-Length is invalid.",
      );
    }
    const declaredLength = Number(declaredHeader);
    if (!Number.isSafeInteger(declaredLength) || declaredLength < 0) {
      throw new HttpProblem(
        400,
        "invalid_content_length",
        "The request Content-Length is invalid.",
      );
    }
    if (declaredLength > maximumBytes) {
      throw new HttpProblem(
        413,
        "request_too_large",
        "The request body is too large.",
      );
    }
  }

  if (!request.body) return "";
  if (request.signal.aborted) {
    throw new HttpProblem(408, "request_aborted", "The request was interrupted. Retry when your connection is stable.");
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let rejectInterrupted: (reason: HttpProblem) => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    rejectInterrupted = reject;
  });
  const onAbort = () => rejectInterrupted(new HttpProblem(
    408, "request_aborted", "The request was interrupted. Retry when your connection is stable.",
  ));
  const timeout = setTimeout(() => rejectInterrupted(new HttpProblem(
    408, "request_body_timeout", "The request took too long to arrive. Retry when your connection is stable.",
  )), REQUEST_BODY_DEADLINE_MS);
  request.signal.addEventListener("abort", onAbort, { once: true });
  if (request.signal.aborted) onAbort();
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), interrupted]);
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        throw new HttpProblem(
          413,
          "request_too_large",
          "The request body is too large.",
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    // Cancellation is best effort. A stalled upstream must not hold the error
    // response open after the deadline or size limit has already been reached.
    void reader.cancel("request body rejected").catch(() => {});
    throw error;
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new HttpProblem(
      400,
      "invalid_body_encoding",
      "The request body must use UTF-8 encoding.",
    );
  }
}

export function readIdempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key")?.trim() ?? "";
  if (
    key.length < 16 ||
    key.length > 128 ||
    !/^[A-Za-z0-9._:-]+$/.test(key)
  ) {
    throw new HttpProblem(
      400,
      "invalid_idempotency_key",
      "Provide a valid Idempotency-Key header.",
    );
  }
  return key;
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function userFromRequest(request: Request): ParsedUser | null {
  const email = request.headers
    .get("oai-authenticated-user-email")
    ?.trim()
    .toLowerCase();
  if (!email) return null;

  const encodedName = request.headers.get(
    "oai-authenticated-user-full-name",
  );
  const fullName =
    encodedName &&
    request.headers.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? safeDecode(encodedName)
      : null;
  return {
    email,
    fullName,
    displayName: fullName ?? email,
  };
}

export function parseAdminAllowlist(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}
