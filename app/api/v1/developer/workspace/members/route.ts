import {
  consumeRateLimit,
  inviteDeveloperWorkspaceMember,
  listDeveloperWorkspaceMembers,
} from "@/lib/server/database";
import { privateHash } from "@/lib/server/crypto";
import {
  developerActorFromUser,
  developerIdentitySubject,
  requireDeveloperIdentity,
  serializeDeveloperWorkspaceMember,
  validateDeveloperWorkspaceMemberInvitePayload,
} from "@/lib/server/developer-platform";
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
    const members = await listDeveloperWorkspaceMembers(
      developerActorFromUser(user),
    );
    return apiJson(
      {
        data: {
          members: members.map(serializeDeveloperWorkspaceMember),
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
    const validation = validateDeveloperWorkspaceMemberInvitePayload(
      await readJsonBody(request),
    );
    if (!validation.ok) {
      return problemResponse({
        status: 422,
        code: "validation_failed",
        title: "Check the team member details.",
        fields: validation.fields,
        requestId,
      });
    }
    await consumeRateLimit({
      scope: "workspace-member:invite:identity",
      subjectHash: await privateHash(
        "developer-identity",
        developerIdentitySubject(user),
      ),
      limit: 50,
      windowMs: 60 * 60 * 1000,
    });
    const result = await inviteDeveloperWorkspaceMember({
      actor: developerActorFromUser(user),
      email: validation.value.email,
      role: validation.value.role,
    });
    return apiJson(
      {
        data: {
          member: serializeDeveloperWorkspaceMember(result.member),
          created: result.created,
        },
        requestId,
      },
      {
        requestId,
        status: result.created ? 201 : 200,
      },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
