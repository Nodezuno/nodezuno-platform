export type WorkspaceTeamRole = "owner" | "admin" | "developer";
export type ManagedWorkspaceTeamRole = Exclude<WorkspaceTeamRole, "owner">;
export type WorkspaceMemberState = "active" | "pending";

export type WorkspaceMember = {
  id: string;
  email: string | null;
  role: WorkspaceTeamRole;
  state: WorkspaceMemberState;
  createdAt: string;
  updatedAt: string;
};

export function workspaceInviteRoles(
  actorRole: WorkspaceTeamRole,
): ManagedWorkspaceTeamRole[] {
  if (actorRole === "owner") return ["admin", "developer"];
  if (actorRole === "admin") return ["developer"];
  return [];
}

export function canChangeWorkspaceMemberRole(
  actorRole: WorkspaceTeamRole,
  member: WorkspaceMember,
): boolean {
  return actorRole === "owner" && member.role !== "owner";
}

export function canRemoveWorkspaceMember(
  actorRole: WorkspaceTeamRole,
  member: WorkspaceMember,
): boolean {
  if (member.role === "owner") return false;
  if (actorRole === "owner") return true;
  return actorRole === "admin" && member.role === "developer";
}

export function workspaceInvitePayload(
  actorRole: WorkspaceTeamRole,
  email: string,
  role: ManagedWorkspaceTeamRole,
) {
  const inviteRoles = workspaceInviteRoles(actorRole);
  if (!inviteRoles.includes(role)) {
    throw new Error("Your workspace role cannot create that membership.");
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (
    normalizedEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  ) {
    throw new Error("Enter a valid team member email address.");
  }
  return { email: normalizedEmail, role };
}

export function workspaceRoleUpdatePayload(
  actorRole: WorkspaceTeamRole,
  member: WorkspaceMember,
  role: ManagedWorkspaceTeamRole,
) {
  if (!canChangeWorkspaceMemberRole(actorRole, member)) {
    throw new Error("Only the workspace owner can change this role.");
  }
  return { role };
}

export function parseWorkspaceMembersEnvelope(
  payload: unknown,
): { members: WorkspaceMember[]; requestId: string } {
  const envelope = envelopeRecord(payload);
  const members = envelope.data.members;
  if (!Array.isArray(members)) {
    throw new Error("The team response did not include a member list.");
  }
  return {
    members: members.map(parseWorkspaceMember),
    requestId: envelope.requestId,
  };
}

export function parseWorkspaceMemberEnvelope(
  payload: unknown,
): {
  member: WorkspaceMember;
  created?: boolean;
  requestId: string;
} {
  const envelope = envelopeRecord(payload);
  const created = envelope.data.created;
  if (created !== undefined && typeof created !== "boolean") {
    throw new Error("The team response contained an invalid creation state.");
  }
  return {
    member: parseWorkspaceMember(envelope.data.member),
    ...(created === undefined ? {} : { created }),
    requestId: envelope.requestId,
  };
}

export function workspaceMemberLabel(member: WorkspaceMember): string {
  return member.email?.trim() || "Account without an email address";
}

function envelopeRecord(payload: unknown): {
  data: Record<string, unknown>;
  requestId: string;
} {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("The team response was not a JSON object.");
  }
  const candidate = payload as Record<string, unknown>;
  if (
    !candidate.data ||
    typeof candidate.data !== "object" ||
    Array.isArray(candidate.data) ||
    typeof candidate.requestId !== "string" ||
    !candidate.requestId
  ) {
    throw new Error("The team response envelope was invalid.");
  }
  return {
    data: candidate.data as Record<string, unknown>,
    requestId: candidate.requestId,
  };
}

function parseWorkspaceMember(value: unknown): WorkspaceMember {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The team response contained an invalid member.");
  }
  const member = value as Record<string, unknown>;
  if (
    typeof member.id !== "string" ||
    !member.id ||
    (member.email !== null && typeof member.email !== "string") ||
    !["owner", "admin", "developer"].includes(String(member.role)) ||
    !["active", "pending"].includes(String(member.state)) ||
    typeof member.createdAt !== "string" ||
    !member.createdAt ||
    typeof member.updatedAt !== "string" ||
    !member.updatedAt
  ) {
    throw new Error("The team response contained invalid member fields.");
  }
  return {
    id: member.id,
    email: member.email as string | null,
    role: member.role as WorkspaceTeamRole,
    state: member.state as WorkspaceMemberState,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
  };
}
