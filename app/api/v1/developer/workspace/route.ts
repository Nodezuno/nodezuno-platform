import {
  consumeRateLimit,
  createDeveloperWorkspace,
  findDeveloperWorkspaceForIdentity,
} from "@/lib/server/database";
import {
  defaultDeveloperWorkspaceName,
  developerActorFromUser,
  developerIdentitySubject,
  requireDeveloperIdentity,
  serializeDeveloperWorkspace,
  validateDeveloperWorkspacePayload,
} from "@/lib/server/developer-platform";
import { privateHash } from "@/lib/server/crypto";
import {
  apiJson,
  assertSameOrigin,
  problemResponse,
  readJsonBody,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  try {
    const user = await requireDeveloperIdentity(request);
    const workspace = await findDeveloperWorkspaceForIdentity(
      developerActorFromUser(user),
    );
    return apiJson(
      {
        data: {
          workspace: workspace
            ? serializeDeveloperWorkspace(workspace)
            : null,
        },
        requestId,
      },
      { requestId },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  try {
    assertSameOrigin(request);
    const user = await requireDeveloperIdentity(request);
    const validation = validateDeveloperWorkspacePayload(
      await readJsonBody(request),
    );
    if (!validation.ok) {
      return problemResponse({
        status: 422,
        code: "validation_failed",
        title: "Check the workspace details.",
        fields: validation.fields,
        requestId,
      });
    }
    const identityHash = await privateHash(
      "developer-identity",
      developerIdentitySubject(user),
    );
    await consumeRateLimit({
      scope: "developer-workspace:create:identity",
      subjectHash: identityHash,
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });

    const result = await createDeveloperWorkspace({
      name:
        validation.value.name ?? defaultDeveloperWorkspaceName(user),
      actorAccountId: user.accountId ?? null,
      actorEmail: developerActorFromUser(user).email,
    });
    return apiJson(
      {
        data: {
          workspace: serializeDeveloperWorkspace(result.workspace),
          created: result.created,
        },
        requestId,
      },
      { requestId, status: result.created ? 201 : 200 },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
