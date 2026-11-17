import {
  consumeRateLimit,
  revokeDeveloperApiKey,
} from "@/lib/server/database";
import { requireDeveloperApiKeyScope } from "@/lib/server/developer-api-key-auth";
import {
  isDeveloperResourceId,
  serializeDeveloperApiKey,
} from "@/lib/server/developer-platform";
import {
  apiJson,
  HttpProblem,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  const requestId = requestIdFor(request);
  try {
    const identity = await requireDeveloperApiKeyScope(
      request,
      "services:manage",
    );
    const { id } = await context.params;
    if (!isDeveloperResourceId(id)) {
      throw new HttpProblem(
        400,
        "invalid_api_key_id",
        "Use a valid API key identifier.",
      );
    }
    await Promise.all([
      consumeRateLimit({
        scope: "control-plane-api-keys:revoke:key",
        subjectHash: identity.secretHash,
        limit: 60,
        windowMs: 60 * 60 * 1000,
      }),
      consumeRateLimit({
        scope: "control-plane-api-keys:revoke:workspace",
        subjectHash: identity.workspace.id,
        limit: 120,
        windowMs: 60 * 60 * 1000,
      }),
    ]);
    const apiKey = await revokeDeveloperApiKey({
      workspaceId: identity.workspace.id,
      authorizationApiKeyId: identity.apiKey.id,
      id,
    });
    if (!apiKey) {
      throw new HttpProblem(
        404,
        "api_key_not_found",
        "The API key was not found in this workspace.",
      );
    }
    return apiJson(
      {
        data: { apiKey: serializeDeveloperApiKey(apiKey) },
        requestId,
      },
      {
        requestId,
        headers: { Vary: "Authorization" },
      },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
