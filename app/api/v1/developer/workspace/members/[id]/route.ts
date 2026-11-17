import {
  consumeRateLimit,
  removeDeveloperWorkspaceMember,
  updateDeveloperWorkspaceMemberRole,
} from "@/lib/server/database";
import { privateHash } from "@/lib/server/crypto";
import {
  developerActorFromUser,
  developerIdentitySubject,
  isDeveloperResourceId,
  requireDeveloperIdentity,
  serializeDeveloperWorkspaceMember,
  validateDeveloperWorkspaceMemberRolePayload,
} from "@/lib/server/developer-platform";
import {
  apiJson,
  assertSameOrigin,
  HttpProblem,
  problemResponse,
  readJsonBody,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext) {
  const requestId = requestIdFor(request);
  try {
    assertSameOrigin(request);
    const user = await requireDeveloperIdentity(request);
    const { id } = await context.params;
    assertMemberId(id);
    const validation = validateDeveloperWorkspaceMemberRolePayload(
      await readJsonBody(request),
    );
    if (!validation.ok) {
      return problemResponse({
        status: 422,
        code: "validation_failed",
        title: "Check the team member role.",
        fields: validation.fields,
        requestId,
      });
    }
    await memberMutationRateLimit(user);
    const member = await updateDeveloperWorkspaceMemberRole({
      actor: developerActorFromUser(user),
      memberId: id,
      role: validation.value.role,
    });
    if (!member) throw memberNotFoundProblem();
    return apiJson(
      {
        data: {
          member: serializeDeveloperWorkspaceMember(member),
        },
        requestId,
      },
      { requestId },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requestId = requestIdFor(request);
  try {
    assertSameOrigin(request);
    const user = await requireDeveloperIdentity(request);
    const { id } = await context.params;
    assertMemberId(id);
    await memberMutationRateLimit(user);
    const member = await removeDeveloperWorkspaceMember({
      actor: developerActorFromUser(user),
      memberId: id,
    });
    if (!member) throw memberNotFoundProblem();
    return apiJson(
      {
        data: {
          member: serializeDeveloperWorkspaceMember(member),
        },
        requestId,
      },
      { requestId },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}

function assertMemberId(id: string): void {
  if (!isDeveloperResourceId(id)) {
    throw new HttpProblem(
      400,
      "invalid_workspace_member_id",
      "Use a valid workspace member identifier.",
    );
  }
}

async function memberMutationRateLimit(
  user: Awaited<ReturnType<typeof requireDeveloperIdentity>>,
): Promise<void> {
  await consumeRateLimit({
    scope: "workspace-member:mutate:identity",
    subjectHash: await privateHash(
      "developer-identity",
      developerIdentitySubject(user),
    ),
    limit: 100,
    windowMs: 60 * 60 * 1000,
  });
}

function memberNotFoundProblem(): HttpProblem {
  return new HttpProblem(
    404,
    "workspace_member_not_found",
    "The team member was not found in this workspace.",
  );
}
