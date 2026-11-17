import {
  authenticateDeveloperApiKey,
  consumeRateLimit,
  consumeRpcQuota,
  findPublicRpcAccessPolicy,
  findRpcAccessPolicyForService,
  findRpcServiceGuardrailForAdmission,
  findRpcServiceForApiKey,
  recordRpcUsage,
} from "@/lib/server/database";
import { getDatabase } from "@/lib/server/database-binding";
import {
  developerApiKeyHash,
  requestFingerprint,
} from "@/lib/server/crypto";
import {
  apiKeyAuthenticationProblem,
  developerApiKeyAllowsService,
  isDeveloperResourceId,
  readDeveloperApiKey,
} from "@/lib/server/developer-platform";
import {
  allowedEthereumRpcCalls,
  ETHEREUM_RPC_MAX_REQUEST_BYTES,
  EthereumRpcUpstreamError,
  forwardRpc,
  loadEthereumRpcRuntimeConfiguration,
  parseRpcJsonText,
  renderEthereumRpcResponses,
  rpcNetworkLabel,
  rpcQuotaUnits,
  type EthereumJsonRpcEnvelope,
  type RpcNetwork,
  verifiedRpcUpstreams,
} from "@/lib/server/ethereum-rpc";
import {
  HttpProblem,
  readTextBody,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";
import { requestClientAddress } from "@/lib/server/runtime-config";
import {
  applyRpcAccessPolicyToCalls,
} from "@/lib/server/rpc-access-policy";
import {
  rpcCorsPreflight,
  rpcCorsResponseHeaders,
} from "@/lib/server/rpc-cors";
import {
  RPC_GUARDRAIL_DEFAULT_WARNING_PERCENT,
  effectiveRpcServiceHourlyQuota,
} from "@/lib/server/rpc-guardrail";

type RouteContext = { params: Promise<{ serviceId: string }> };

export async function OPTIONS(
  request: Request,
  context: RouteContext,
) {
  const requestId = requestIdFor(request);
  try {
    const fingerprint = await requestFingerprint(request);
    await consumeRateLimit({
      scope: "rpc-cors-preflight:ip",
      subjectHash: fingerprint.ipHash,
      limit: 300,
      windowMs: 60 * 1000,
    });
    const { serviceId } = await context.params;
    if (!isDeveloperResourceId(serviceId)) {
      throw rpcServiceNotFoundProblem();
    }
    const policy = await findPublicRpcAccessPolicy({ serviceId });
    if (!policy) throw rpcServiceNotFoundProblem();
    const decision = rpcCorsPreflight({
      policy: policy.policy,
      origin: request.headers.get("origin"),
      requestedMethod: request.headers.get(
        "access-control-request-method",
      ),
      requestedHeaders: request.headers.get(
        "access-control-request-headers",
      ),
    });
    if (!decision.allowed) {
      throw new HttpProblem(
        403,
        decision.code,
        "This browser preflight is not enabled for the RPC service.",
        undefined,
        {
          Vary:
            "Origin, Access-Control-Request-Method, Access-Control-Request-Headers",
        },
      );
    }
    decision.headers.set("Cache-Control", "no-store, max-age=0");
    decision.headers.set("X-Request-Id", requestId);
    return new Response(null, {
      status: 204,
      headers: decision.headers,
    });
  } catch (error) {
    return responseFromError(error, requestId);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const requestId = requestIdFor(request);
  let responseCorsHeaders: Headers | null = null;
  const respond = (response: Response) =>
    withResponseHeaders(response, responseCorsHeaders);
  let usage:
    | {
        bucketId: string;
        workspaceId: string;
        serviceId: string;
        apiKeyId: string;
        bytesIn: number;
        callCount: number;
      }
    | undefined;

  try {
    const fingerprint = await requestFingerprint(request);
    await consumeRateLimit({
      scope: "ethereum-rpc-auth:ip",
      subjectHash: fingerprint.ipHash,
      limit: 120,
      windowMs: 60 * 1000,
    });
    const { serviceId } = await context.params;
    if (!isDeveloperResourceId(serviceId)) {
      throw rpcServiceNotFoundProblem();
    }
    const database = await getDatabase();
    const publicPolicy = await findPublicRpcAccessPolicy({
      serviceId,
      database,
    });
    if (publicPolicy) {
      responseCorsHeaders = rpcCorsResponseHeaders({
        policy: publicPolicy.policy,
        origin: request.headers.get("origin"),
      });
    }

    assertJsonContentType(request);
    const body = await readTextBody(
      request,
      ETHEREUM_RPC_MAX_REQUEST_BYTES,
    );
    let envelope = parseRpcJsonText(body, "ethereum");
    const bytesIn = new TextEncoder().encode(body).byteLength;
    if (
      envelope.calls.length === 0 &&
      envelope.protocolErrorCount > 0
    ) {
      return respond(
        rpcEnvelopeResponse({
          envelope,
          requestId,
          status: 400,
        }),
      );
    }

    const presented = readDeveloperApiKey(request);
    const secretHash = await developerApiKeyHash(presented.secret);
    const identity = await authenticateDeveloperApiKey({
      id: presented.id,
      secretHash,
      database,
    });
    if (!identity) throw apiKeyAuthenticationProblem();

    if (!identity.apiKey.scopes.includes("rpc:invoke")) {
      return respond(
        rpcErrorResponse({
          envelope,
          requestId,
          status: 403,
          code: -32003,
          message: "This API key cannot invoke RPC services.",
          detailCode: "api_key_scope_denied",
        }),
      );
    }
    if (!developerApiKeyAllowsService(identity.apiKey, serviceId)) {
      return respond(
        rpcErrorResponse({
          envelope,
          requestId,
          status: 403,
          code: -32003,
          message:
            "This API key is bound to a different developer service.",
          detailCode: "api_key_service_denied",
        }),
      );
    }

    const service = await findRpcServiceForApiKey({
      serviceId,
      workspaceId: identity.workspace.id,
      database,
    });
    if (!service) {
      throw rpcServiceNotFoundProblem();
    }
    const accessPolicy = await findRpcAccessPolicyForService({
      serviceId,
      workspaceId: identity.workspace.id,
      database,
    });
    if (!accessPolicy) {
      throw new HttpProblem(
        503,
        "rpc_access_policy_unavailable",
        "The RPC access policy is temporarily unavailable.",
      );
    }
    const network = service.network as RpcNetwork;
    const networkLabel = rpcNetworkLabel(network);
    envelope = parseRpcJsonText(body, network);
    responseCorsHeaders = rpcCorsResponseHeaders({
      policy: accessPolicy.policy,
      origin: request.headers.get("origin"),
    });
    applyRpcAccessPolicyToCalls({
      calls: envelope.calls,
      policy: accessPolicy.policy,
      origin: request.headers.get("origin"),
      clientAddress: requestClientAddress(request),
    });

    const allowedCalls = allowedEthereumRpcCalls(envelope);
    if (allowedCalls.length === 0) {
      return respond(
        rpcEnvelopeResponse({
          envelope,
          requestId,
          status: envelope.protocolErrorCount > 0 ? 400 : 403,
        }),
      );
    }
    const quotaUnits = rpcQuotaUnits(network, allowedCalls);

    const runtime = await loadEthereumRpcRuntimeConfiguration();
    const configuredUpstreams = runtime.upstreamsByNetwork[network];
    if (
      !runtime.configurationValid ||
      configuredUpstreams.length === 0
    ) {
      return respond(
        rpcErrorResponse({
          envelope,
          requestId,
          status: 503,
          code: -32002,
          message: `No ${networkLabel} RPC upstream is currently configured.`,
          detailCode: "rpc_upstream_unavailable",
        }),
      );
    }
    const guardrail = await findRpcServiceGuardrailForAdmission({
      serviceId: service.id,
      workspaceId: identity.workspace.id,
      database,
    });
    const serviceLimit = effectiveRpcServiceHourlyQuota({
      guardrail,
      platformWorkspaceHourlyQuotaLimit:
        runtime.workspaceHourlyCallQuota,
    });
    const serviceWarningThresholdPercent =
      guardrail?.warningThresholdPercent ??
      RPC_GUARDRAIL_DEFAULT_WARNING_PERCENT;
    const verifiedUpstreams = await verifiedRpcUpstreams({
      network,
      upstreams: configuredUpstreams,
    });
    if (verifiedUpstreams.length === 0) {
      return respond(
        rpcErrorResponse({
          envelope,
          requestId,
          status: 503,
          code: -32002,
          message:
            `No configured upstream currently verifies as ${networkLabel} mainnet.`,
          detailCode: "rpc_mainnet_upstream_unverified",
        }),
      );
    }

    let quota: {
      bucketId: string;
      remaining: number;
      workspaceRemaining: number;
      serviceRemaining: number;
      resetAt: number;
    };
    try {
      quota = await consumeRpcQuota({
        workspaceId: identity.workspace.id,
        serviceId: service.id,
        apiKeyId: identity.apiKey.id,
        callCount: allowedCalls.length,
        quotaUnits,
        limit: runtime.hourlyCallQuota,
        workspaceLimit: runtime.workspaceHourlyCallQuota,
        serviceLimit,
        network,
        database,
      });
    } catch (error) {
      if (
        error instanceof HttpProblem &&
        error.status === 429 &&
        error.code === "rpc_quota_exceeded"
      ) {
        return respond(
          rpcErrorResponse({
            envelope,
            requestId,
            status: 429,
            code: -32005,
            message:
              `The hourly ${networkLabel} RPC call quota has been reached.`,
            detailCode: error.code,
            headers: error.headers,
          }),
        );
      }
      throw error;
    }

    usage = {
      bucketId: quota.bucketId,
      workspaceId: identity.workspace.id,
      serviceId: service.id,
      apiKeyId: identity.apiKey.id,
      bytesIn,
      callCount: allowedCalls.length,
    };

    let forwarded;
    try {
      forwarded = await forwardRpc({
        network,
        calls: allowedCalls,
        batch: envelope.batch,
        upstreams: verifiedUpstreams,
      });
    } catch (error) {
      if (error instanceof EthereumRpcUpstreamError) {
        await recordUsageWithoutBreakingResponse({
          ...usage,
          requestId,
          errorCalls: usage.callCount,
          upstreamFailures: error.upstreamFailures,
          latencyMs: error.latencyMs,
          bytesOut: 0,
          database,
        });
        return respond(
          rpcErrorResponse({
            envelope,
            requestId,
            status: error.status,
            code: -32002,
            message: error.message,
            detailCode: error.code,
          }),
        );
      }
      throw error;
    }

    await recordUsageWithoutBreakingResponse({
      ...usage,
      requestId,
      errorCalls: forwarded.errorCalls,
      upstreamFailures: forwarded.upstreamFailures,
      latencyMs: forwarded.latencyMs,
      bytesOut: forwarded.responseBytes,
      database,
    });

    return respond(
      rpcEnvelopeResponse({
        envelope,
        upstreamResponses: forwarded.responses,
        requestId,
        status: 200,
        successWithoutResponseStatus: 204,
        headers: {
          "X-RateLimit-Limit": String(runtime.hourlyCallQuota),
          "X-RateLimit-Remaining": String(
            Math.min(
              quota.remaining,
              quota.serviceRemaining,
              quota.workspaceRemaining,
            ),
          ),
          "X-RateLimit-Reset": String(
            Math.ceil(quota.resetAt / 1000),
          ),
          "X-Nodezuno-Workspace-RateLimit-Limit": String(
            runtime.workspaceHourlyCallQuota,
          ),
          "X-Nodezuno-Workspace-RateLimit-Remaining": String(
            quota.workspaceRemaining,
          ),
          "X-Nodezuno-Service-RateLimit-Limit": String(
            serviceLimit,
          ),
          "X-Nodezuno-Service-RateLimit-Remaining": String(
            quota.serviceRemaining,
          ),
          "X-Nodezuno-Service-Quota-Warning-Threshold": String(
            serviceWarningThresholdPercent,
          ),
          "X-Nodezuno-Service-Quota-Warning": String(
            (serviceLimit - quota.serviceRemaining) * 100 >=
              serviceLimit * serviceWarningThresholdPercent,
          ),
        },
      }),
    );
  } catch (error) {
    return respond(responseFromError(error, requestId));
  }
}

function withResponseHeaders(
  response: Response,
  headers: Headers | null,
): Response {
  headers?.forEach((value, key) => {
    response.headers.set(key, value);
  });
  return response;
}

function rpcServiceNotFoundProblem(): HttpProblem {
  return new HttpProblem(
    404,
    "rpc_service_not_found",
    "The RPC service was not found.",
  );
}

function assertJsonContentType(request: Request): void {
  const contentType = request.headers.get("content-type") ?? "";
  const valid =
    /^\s*application\/json\s*(?:;\s*[^;=\s]+\s*=\s*(?:"[^"]*"|[^;\s]+)\s*)*$/i.test(
      contentType,
    );
  if (!valid) {
    throw new HttpProblem(
      415,
      "unsupported_media_type",
      "Send the request as application/json.",
    );
  }
}

function rpcErrorResponse(options: {
  envelope: EthereumJsonRpcEnvelope;
  requestId: string;
  status: number;
  code: number;
  message: string;
  detailCode: string;
  headers?: HeadersInit;
}): Response {
  return rpcEnvelopeResponse({
    envelope: options.envelope,
    requestId: options.requestId,
    status: options.status,
    allowedError: {
      code: options.code,
      message: options.message,
      data: { code: options.detailCode },
    },
    headers: options.headers,
  });
}

function rpcEnvelopeResponse(options: {
  envelope: EthereumJsonRpcEnvelope;
  requestId: string;
  status: number;
  successWithoutResponseStatus?: number;
  upstreamResponses?: Parameters<
    typeof renderEthereumRpcResponses
  >[0]["upstreamResponses"];
  allowedError?: Parameters<
    typeof renderEthereumRpcResponses
  >[0]["allowedError"];
  headers?: HeadersInit;
}): Response {
  const payload = renderEthereumRpcResponses({
    envelope: options.envelope,
    upstreamResponses: options.upstreamResponses,
    allowedError: options.allowedError,
  });
  const headers = new Headers(options.headers);
  headers.set("Cache-Control", "no-store, max-age=0");
  headers.set("X-Request-Id", options.requestId);
  if (payload === null) {
    return new Response(null, {
      status: options.successWithoutResponseStatus ?? options.status,
      headers,
    });
  }
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(payload), {
    status: options.status,
    headers,
  });
}

async function recordUsageWithoutBreakingResponse(options: {
  bucketId: string;
  workspaceId: string;
  serviceId: string;
  apiKeyId: string;
  requestId: string;
  errorCalls: number;
  upstreamFailures: number;
  latencyMs: number;
  bytesIn: number;
  bytesOut: number;
  database: D1Database;
}): Promise<void> {
  try {
    await recordRpcUsage({
      bucketId: options.bucketId,
      workspaceId: options.workspaceId,
      serviceId: options.serviceId,
      apiKeyId: options.apiKeyId,
      errorCalls: options.errorCalls,
      upstreamFailures: options.upstreamFailures,
      latencyMs: Math.max(0, Math.round(options.latencyMs)),
      bytesIn: options.bytesIn,
      bytesOut: options.bytesOut,
      database: options.database,
    });
  } catch {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "rpc_telemetry_update_failed",
        requestId: options.requestId,
      }),
    );
  }
}
