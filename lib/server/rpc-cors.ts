import {
  normalizeRpcRequestOrigin,
  type RpcAccessPolicy,
} from "./rpc-access-policy.ts";

const PREFLIGHT_MAX_AGE_SECONDS = 600;
const MAX_REQUESTED_HEADERS_LENGTH = 512;
const CORS_REQUEST_HEADERS = new Set([
  "authorization",
  "content-type",
]);
const EXPOSED_RESPONSE_HEADERS = [
  "X-Request-Id",
  "X-RateLimit-Limit",
  "X-RateLimit-Remaining",
  "X-RateLimit-Reset",
  "X-Nodezuno-Workspace-RateLimit-Limit",
  "X-Nodezuno-Workspace-RateLimit-Remaining",
  "X-Nodezuno-Service-RateLimit-Limit",
  "X-Nodezuno-Service-RateLimit-Remaining",
  "X-Nodezuno-Service-Quota-Warning-Threshold",
  "X-Nodezuno-Service-Quota-Warning",
].join(", ");
const VARY_VALUE =
  "Origin, Access-Control-Request-Method, Access-Control-Request-Headers";
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export type RpcCorsDecision =
  | { allowed: true; headers: Headers }
  | {
      allowed: false;
      code:
        | "rpc_cors_origin_not_allowed"
        | "rpc_cors_method_not_allowed"
        | "rpc_cors_headers_not_allowed";
    };

export function rpcCorsPreflight(options: {
  policy: RpcAccessPolicy;
  origin: string | null;
  requestedMethod: string | null;
  requestedHeaders: string | null;
}): RpcCorsDecision {
  const origin = allowedCorsOrigin(options.policy, options.origin);
  if (!origin) {
    return {
      allowed: false,
      code: "rpc_cors_origin_not_allowed",
    };
  }
  if (
    !options.requestedMethod ||
    options.requestedMethod !== options.requestedMethod.trim() ||
    options.requestedMethod.toUpperCase() !== "POST"
  ) {
    return {
      allowed: false,
      code: "rpc_cors_method_not_allowed",
    };
  }
  const requestedHeaders = parseRequestedHeaders(
    options.requestedHeaders,
  );
  if (
    requestedHeaders === null ||
    requestedHeaders.some(
      (header) => !CORS_REQUEST_HEADERS.has(header),
    )
  ) {
    return {
      allowed: false,
      code: "rpc_cors_headers_not_allowed",
    };
  }

  const headers = corsOriginHeaders(origin);
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type",
  );
  headers.set(
    "Access-Control-Max-Age",
    String(PREFLIGHT_MAX_AGE_SECONDS),
  );
  headers.set("Vary", VARY_VALUE);
  return { allowed: true, headers };
}

export function rpcCorsResponseHeaders(options: {
  policy: RpcAccessPolicy;
  origin: string | null;
}): Headers | null {
  if (options.origin === null) return new Headers();
  const origin = allowedCorsOrigin(options.policy, options.origin);
  if (!origin) return null;
  const headers = corsOriginHeaders(origin);
  headers.set("Access-Control-Expose-Headers", EXPOSED_RESPONSE_HEADERS);
  return headers;
}

function allowedCorsOrigin(
  policy: RpcAccessPolicy,
  rawOrigin: string | null,
): string | null {
  if (policy.allowedOrigins.length === 0) return null;
  const origin = normalizeRpcRequestOrigin(rawOrigin);
  return origin && policy.allowedOrigins.includes(origin)
    ? origin
    : null;
}

function corsOriginHeaders(origin: string): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
  });
}

function parseRequestedHeaders(value: string | null): string[] | null {
  if (value === null || value === "") return [];
  if (
    value.length > MAX_REQUESTED_HEADERS_LENGTH ||
    value !== value.trim()
  ) {
    return null;
  }
  const headers = value.split(",").map((header) => header.trim().toLowerCase());
  if (
    headers.some(
      (header) => !header || !HEADER_NAME_PATTERN.test(header),
    )
  ) {
    return null;
  }
  return [...new Set(headers)];
}
