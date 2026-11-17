import {
  authorizeGrpcDeveloperApiKey,
  GRPC_AUTHORIZATION_BODY_LIMIT,
  GRPC_AUTHORIZATION_TIMEOUT_MS,
  requireGrpcControlPlaneSecret,
  validateGrpcAuthorizationPayload,
} from "@/lib/server/grpc-authorization";
import {
  consumeRateLimit,
  getDatabase,
} from "@/lib/server/database";
import {
  privateHash,
  requestFingerprint,
} from "@/lib/server/crypto";
import {
  apiJson,
  HttpProblem,
  problemResponse,
  readTextBody,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";

export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  let credentialWasRead = false;
  try {
    const controlPlaneSecret =
      await requireGrpcControlPlaneSecret(request);
    assertJsonContentType(request);
    credentialWasRead = true;
    const rawBody = await readTextBody(
      request,
      GRPC_AUTHORIZATION_BODY_LIMIT,
    );
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody) as unknown;
    } catch {
      throw invalidAuthorizationRequest();
    }
    const input = validateGrpcAuthorizationPayload(payload);
    if (!input) throw invalidAuthorizationRequest();

    const authorized = await withDeadline(
      (async () => {
        const [database, fingerprint, gatewayHash] = await Promise.all([
          getDatabase(),
          requestFingerprint(request),
          privateHash("grpc-control-plane", controlPlaneSecret),
        ]);
        await consumeRateLimit({
          scope: "grpc-control-plane:gateway",
          subjectHash: gatewayHash,
          limit: 10_000,
          windowMs: 60 * 1000,
          database,
        });
        await consumeRateLimit({
          scope: "grpc-control-plane:ip",
          subjectHash: fingerprint.ipHash,
          limit: 12_000,
          windowMs: 60 * 1000,
          database,
        });
        return authorizeGrpcDeveloperApiKey({ input, database });
      })(),
      GRPC_AUTHORIZATION_TIMEOUT_MS,
    );
    return apiJson(
      {
        data: { authorized },
        requestId,
      },
      { requestId },
    );
  } catch (error) {
    if (!credentialWasRead || error instanceof HttpProblem) {
      return responseFromError(error, requestId);
    }
    console.error(
      JSON.stringify({
        level: "error",
        event: "grpc_authorization_failed_closed",
        requestId,
      }),
    );
    return problemResponse({
      status: 503,
      code: "grpc_authorization_unavailable",
      title: "Native gRPC authorization is temporarily unavailable.",
      detail: "Please try again shortly.",
      requestId,
    });
  }
}

function assertJsonContentType(request: Request): void {
  const contentType =
    request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!/^application\/json(?:\s*;|$)/.test(contentType)) {
    throw new HttpProblem(
      415,
      "unsupported_media_type",
      "Send the request as application/json.",
    );
  }
}

function invalidAuthorizationRequest(): HttpProblem {
  return new HttpProblem(
    400,
    "invalid_grpc_authorization_request",
    "Send a valid gRPC authorization request.",
  );
}

async function withDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new HttpProblem(
                503,
                "grpc_authorization_timeout",
                "Native gRPC authorization is temporarily unavailable.",
              ),
            ),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
