import {
  consumeRateLimit,
  revokeDeveloperApiKey,
} from "@/lib/server/database";
import { privateHash } from "@/lib/server/crypto";
import {
  developerActorFromUser,
  developerIdentitySubject,
  isDeveloperResourceId,
  requireDeveloperIdentity,
  serializeDeveloperApiKey,
} from "@/lib/server/developer-platform";
import {
  apiJson,
  assertSameOrigin,
  HttpProblem,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  const requestId = requestIdFor(request);
  try {
    assertSameOrigin(request);
    const user = await requireDeveloperIdentity(request);
    const { id } = await context.params;
    if (!isDeveloperResourceId(id)) {
      throw new HttpProblem(
        400,
        "invalid_api_key_id",
        "Use a valid API key identifier.",
      );
    }
    const identityHash = await privateHash(
      "developer-identity",
      developerIdentitySubject(user),
    );
    await consumeRateLimit({
      scope: "developer-api-key:revoke:identity",
      subjectHash: identityHash,
      limit: 60,
      windowMs: 60 * 60 * 1000,
    });
    const apiKey = await revokeDeveloperApiKey({
      actorAccountId: user.accountId ?? null,
      actorEmail: developerActorFromUser(user).email,
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
      { requestId },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
