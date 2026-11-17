"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  canChangeWorkspaceMemberRole,
  canRemoveWorkspaceMember,
  parseWorkspaceMemberEnvelope,
  parseWorkspaceMembersEnvelope,
  workspaceInvitePayload,
  workspaceInviteRoles,
  workspaceMemberLabel,
  workspaceRoleUpdatePayload,
  type ManagedWorkspaceTeamRole,
  type WorkspaceMember,
  type WorkspaceTeamRole,
} from "@/lib/client/workspace-team";

type LoadState = "loading" | "ready" | "refreshing" | "error";
type MutationState =
  | { kind: "idle"; memberId: null }
  | {
      kind: "invite" | "role" | "remove";
      memberId: string | null;
    };

const membersEndpoint = "/api/v1/developer/workspace/members";

export function WorkspaceTeamPanel({
  workspaceName,
  workspaceRole,
}: {
  workspaceName: string;
  workspaceRole: WorkspaceTeamRole;
}) {
  const inviteRoles = useMemo(
    () => workspaceInviteRoles(workspaceRole),
    [workspaceRole],
  );
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] =
    useState<ManagedWorkspaceTeamRole>(
      inviteRoles[0] ?? "developer",
    );
  const [roleDrafts, setRoleDrafts] = useState<
    Record<string, ManagedWorkspaceTeamRole>
  >({});
  const [confirmRoleId, setConfirmRoleId] = useState<string | null>(
    null,
  );
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(
    null,
  );
  const [mutation, setMutation] = useState<MutationState>({
    kind: "idle",
    memberId: null,
  });
  const effectiveInviteRole = inviteRoles.includes(inviteRole)
    ? inviteRole
    : (inviteRoles[0] ?? "developer");
  const loadController = useRef<AbortController | null>(null);
  const mutationController = useRef<AbortController | null>(null);
  const busy =
    loadState === "loading" ||
    loadState === "refreshing" ||
    mutation.kind !== "idle";

  const loadMembers = useCallback(
    async (preserveExisting: boolean): Promise<string | null> => {
      loadController.current?.abort();
      const controller = new AbortController();
      loadController.current = controller;
      setLoadState(preserveExisting ? "refreshing" : "loading");
      if (!preserveExisting) setLoadError("");

      try {
        const response = await fetch(membersEndpoint, {
          cache: "no-store",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        const payload = await readJson(response);
        if (!response.ok) {
          throw new Error(
            teamResponseProblem(
              payload,
              "The workspace team could not be loaded.",
            ),
          );
        }
        const result = parseWorkspaceMembersEnvelope(payload);
        const nextMembers = sortMembers(result.members);
        setMembers(nextMembers);
        setRoleDrafts(roleDraftsFromMembers(nextMembers));
        setLoadState("ready");
        setLoadError("");
        return null;
      } catch (caught) {
        if (controller.signal.aborted) return null;
        const message =
          caught instanceof Error
            ? caught.message
            : "The workspace team could not be loaded.";
        setLoadState(preserveExisting ? "ready" : "error");
        if (!preserveExisting) setLoadError(message);
        return message;
      } finally {
        if (loadController.current === controller) {
          loadController.current = null;
        }
      }
    },
    [],
  );

  useEffect(() => {
    const task = window.setTimeout(() => {
      void loadMembers(false);
    }, 0);
    return () => {
      window.clearTimeout(task);
      loadController.current?.abort();
      mutationController.current?.abort();
    };
  }, [loadMembers]);

  async function retryLoad() {
    const error = await loadMembers(false);
    restoreTeamFocus(
      error ? "workspace-team-retry" : "workspace-team-title",
    );
  }

  async function refreshMembers() {
    if (busy) return;
    setFeedback(null);
    const error = await loadMembers(true);
    setFeedback(
      error
        ? {
            tone: "error",
            message: `The existing member list is still visible. ${error}`,
          }
        : {
            tone: "success",
            message: "Workspace member records are up to date.",
          },
    );
    restoreTeamFocus("workspace-team-refresh");
  }

  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || inviteRoles.length === 0) return;

    let body: ReturnType<typeof workspaceInvitePayload>;
    try {
      body = workspaceInvitePayload(
        workspaceRole,
        inviteEmail,
        effectiveInviteRole,
      );
    } catch (caught) {
      setFeedback({
        tone: "error",
        message:
          caught instanceof Error
            ? caught.message
            : "The membership record could not be created.",
      });
      return;
    }

    const controller = beginMutation("invite", null);
    setFeedback(null);
    try {
      const response = await fetch(membersEndpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const payload = await readJson(response);
      if (response.status === 409) {
        showConflict(
          "This membership conflicts with the current team state. No record was changed. Refresh the list before retrying.",
        );
        return;
      }
      if (!response.ok) {
        throw new Error(
          teamResponseProblem(
            payload,
            "The membership record could not be created.",
          ),
        );
      }
      const result = parseWorkspaceMemberEnvelope(payload);
      if (result.created === undefined) {
        throw new Error(
          "The membership response did not include its creation state.",
        );
      }
      const nextMember = result.member;
      setMembers((current) => upsertMember(current, nextMember));
      setRoleDrafts((current) => ({
        ...current,
        [nextMember.id]:
          nextMember.role === "owner"
            ? "developer"
            : nextMember.role,
      }));
      if (result.created) setInviteEmail("");
      setFeedback({
        tone: "success",
        message: result.created
          ? `${workspaceMemberLabel(nextMember)} was recorded as ${nextMember.state}. This does not confirm that an invitation email was sent.`
          : `No new member record was created. The existing ${nextMember.state} membership is shown. This does not confirm email delivery.`,
      });
      restoreTeamFocus(memberHeadingId(nextMember.id));
    } catch (caught) {
      if (controller.signal.aborted) return;
      setFeedback({
        tone: "error",
        message:
          caught instanceof Error
            ? caught.message
            : "The membership record could not be created.",
      });
    } finally {
      finishMutation(controller);
    }
  }

  async function updateMemberRole(member: WorkspaceMember) {
    if (busy) return;
    const nextRole = roleDrafts[member.id] ?? "developer";
    let body: ReturnType<typeof workspaceRoleUpdatePayload>;
    try {
      body = workspaceRoleUpdatePayload(
        workspaceRole,
        member,
        nextRole,
      );
    } catch (caught) {
      setFeedback({
        tone: "error",
        message:
          caught instanceof Error
            ? caught.message
            : "The member role could not be changed.",
      });
      return;
    }

    const controller = beginMutation("role", member.id);
    setFeedback(null);
    try {
      const response = await fetch(memberEndpoint(member.id), {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const payload = await readJson(response);
      if (response.status === 409) {
        setConfirmRoleId(null);
        showConflict(
          "This member changed before the role update completed. Your selected role is still visible. Refresh the list before retrying.",
        );
        restoreTeamFocus(roleTriggerId(member.id));
        return;
      }
      if (!response.ok) {
        throw new Error(
          teamResponseProblem(
            payload,
            "The member role could not be changed.",
          ),
        );
      }
      const result = parseWorkspaceMemberEnvelope(payload);
      setMembers((current) => upsertMember(current, result.member));
      setRoleDrafts((current) => ({
        ...current,
        [result.member.id]:
          result.member.role === "owner"
            ? "developer"
            : result.member.role,
      }));
      setConfirmRoleId(null);
      setFeedback({
        tone: "success",
        message: `${workspaceMemberLabel(result.member)} now has the ${result.member.role} role.`,
      });
      restoreTeamFocus(memberHeadingId(result.member.id));
    } catch (caught) {
      if (controller.signal.aborted) return;
      setFeedback({
        tone: "error",
        message:
          caught instanceof Error
            ? caught.message
            : "The member role could not be changed.",
      });
    } finally {
      finishMutation(controller);
    }
  }

  async function removeMember(member: WorkspaceMember) {
    if (busy || !canRemoveWorkspaceMember(workspaceRole, member)) {
      return;
    }
    const controller = beginMutation("remove", member.id);
    setFeedback(null);
    try {
      const response = await fetch(memberEndpoint(member.id), {
        method: "DELETE",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      const payload = await readJson(response);
      if (response.status === 409) {
        setConfirmRemoveId(null);
        showConflict(
          "This member changed before removal completed. No member was removed. Refresh the list before retrying.",
        );
        restoreTeamFocus(removeTriggerId(member.id));
        return;
      }
      if (!response.ok) {
        throw new Error(
          teamResponseProblem(
            payload,
            "The member could not be removed.",
          ),
        );
      }
      const result = parseWorkspaceMemberEnvelope(payload);
      setMembers((current) =>
        current.filter((item) => item.id !== result.member.id),
      );
      setConfirmRemoveId(null);
      setFeedback({
        tone: "success",
        message: `${workspaceMemberLabel(result.member)} was removed from the workspace.`,
      });
      restoreTeamFocus("workspace-team-list-title");
    } catch (caught) {
      if (controller.signal.aborted) return;
      setFeedback({
        tone: "error",
        message:
          caught instanceof Error
            ? caught.message
            : "The member could not be removed.",
      });
    } finally {
      finishMutation(controller);
    }
  }

  function beginMutation(
    kind: Exclude<MutationState["kind"], "idle">,
    memberId: string | null,
  ): AbortController {
    mutationController.current?.abort();
    const controller = new AbortController();
    mutationController.current = controller;
    setMutation({ kind, memberId });
    return controller;
  }

  function finishMutation(controller: AbortController) {
    if (mutationController.current === controller) {
      mutationController.current = null;
      setMutation({ kind: "idle", memberId: null });
    }
  }

  function showConflict(message: string) {
    setFeedback({ tone: "error", message });
  }

  function openRoleConfirmation(memberId: string) {
    setConfirmRemoveId(null);
    setConfirmRoleId(memberId);
  }

  function cancelRoleConfirmation(memberId: string) {
    setConfirmRoleId(null);
    restoreTeamFocus(roleTriggerId(memberId));
  }

  function openRemoveConfirmation(memberId: string) {
    setConfirmRoleId(null);
    setConfirmRemoveId(memberId);
  }

  function cancelRemoveConfirmation(memberId: string) {
    setConfirmRemoveId(null);
    restoreTeamFocus(removeTriggerId(memberId));
  }

  return (
    <section
      aria-busy={busy}
      aria-labelledby="workspace-team-title"
      className="workspace-team-panel"
    >
      <div className="workspace-team-heading">
        <div>
          <span>Workspace team</span>
          <h3 id="workspace-team-title" tabIndex={-1}>
            Manage {workspaceName} together.
          </h3>
          <p>
            Membership is enforced by workspace role. A pending record does
            not prove that an email was delivered or that the teammate has
            signed in.
          </p>
        </div>
        <div className="workspace-team-access">
          <span>Your access</span>
          <strong>{workspaceRole}</strong>
          <small>{permissionSummary(workspaceRole)}</small>
        </div>
      </div>

      {loadState === "loading" ? (
        <div className="workspace-team-loading" role="status">
          Loading workspace member records.
        </div>
      ) : loadState === "error" ? (
        <div className="workspace-team-load-error" role="alert">
          <strong>Team records unavailable</strong>
          <p>{loadError}</p>
          <button
            className="button button-outline"
            id="workspace-team-retry"
            onClick={() => void retryLoad()}
            type="button"
          >
            Retry team load
          </button>
        </div>
      ) : (
        <div className="workspace-team-body">
          {inviteRoles.length > 0 ? (
            <form
              aria-busy={mutation.kind === "invite"}
              className="workspace-team-invite"
              onSubmit={inviteMember}
            >
              <div>
                <span>Record an invitation</span>
                <h4>Add a teammate without a sales gate.</h4>
                <p id="workspace-team-invite-help">
                  This creates a membership record. Nodezuno does not claim
                  that an invitation email was sent from this screen.
                </p>
              </div>
              <label>
                <span>Team member email</span>
                <input
                  aria-describedby="workspace-team-invite-help"
                  autoComplete="email"
                  disabled={busy}
                  maxLength={254}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="engineer@example.com"
                  required
                  type="email"
                  value={inviteEmail}
                />
              </label>
              {workspaceRole === "owner" ? (
                <label>
                  <span>Workspace role</span>
                  <select
                    disabled={busy}
                    onChange={(event) =>
                      setInviteRole(
                        event.target.value as ManagedWorkspaceTeamRole,
                      )
                    }
                    value={effectiveInviteRole}
                  >
                    <option value="admin">Admin</option>
                    <option value="developer">Developer</option>
                  </select>
                </label>
              ) : (
                <div className="workspace-team-fixed-role">
                  <span>Workspace role</span>
                  <strong>Developer</strong>
                  <small>Admins can add developer records only.</small>
                </div>
              )}
              <button
                className="button button-solid"
                disabled={busy || inviteEmail.trim().length === 0}
                type="submit"
              >
                {mutation.kind === "invite"
                  ? "Creating member record..."
                  : "Create pending member record"}
              </button>
            </form>
          ) : (
            <div className="workspace-team-view-only" role="note">
              <strong>Team records are view-only for developers.</strong>
              <p>
                Owners manage roles and non-owner members. Admins can add or
                remove developer records.
              </p>
            </div>
          )}

          <div
            aria-busy={loadState === "refreshing"}
            aria-labelledby="workspace-team-list-title"
            className="workspace-team-list"
            role="region"
          >
            <div className="workspace-team-list-head">
              <div>
                <strong id="workspace-team-list-title" tabIndex={-1}>
                  Workspace members
                </strong>
                <span>
                  {members.length} total /{" "}
                  {
                    members.filter((member) => member.state === "pending")
                      .length
                  }{" "}
                  pending
                </span>
              </div>
              <button
                className="button button-outline"
                disabled={busy}
                id="workspace-team-refresh"
                onClick={() => void refreshMembers()}
                type="button"
              >
                {loadState === "refreshing"
                  ? "Refreshing members..."
                  : "Refresh members"}
              </button>
            </div>

            {members.length === 0 ? (
              <div className="workspace-team-empty">
                <strong>No member records were returned.</strong>
                <p>
                  Refresh once before creating a pending teammate record.
                </p>
              </div>
            ) : (
              <div className="workspace-team-rows">
                {members.map((member) => {
                  const label = workspaceMemberLabel(member);
                  const roleDraft =
                    roleDrafts[member.id] ??
                    (member.role === "owner"
                      ? "developer"
                      : member.role);
                  const canChangeRole =
                    canChangeWorkspaceMemberRole(
                      workspaceRole,
                      member,
                    );
                  const canRemove = canRemoveWorkspaceMember(
                    workspaceRole,
                    member,
                  );
                  const memberBusy =
                    mutation.memberId === member.id;
                  return (
                    <article
                      aria-labelledby={memberHeadingId(member.id)}
                      className="workspace-team-row"
                      key={member.id}
                    >
                      <div className="workspace-team-member">
                        <div>
                          <span
                            className={`workspace-member-state is-${member.state}`}
                          >
                            {member.state}
                          </span>
                          <span className="workspace-member-role">
                            {member.role}
                          </span>
                        </div>
                        <h4
                          id={memberHeadingId(member.id)}
                          tabIndex={-1}
                        >
                          {label}
                        </h4>
                        {!member.email ? (
                          <code>{member.id}</code>
                        ) : null}
                        <dl>
                          <div>
                            <dt>Created</dt>
                            <dd>{formatMemberDate(member.createdAt)}</dd>
                          </div>
                          <div>
                            <dt>Updated</dt>
                            <dd>{formatMemberDate(member.updatedAt)}</dd>
                          </div>
                        </dl>
                      </div>

                      <div className="workspace-team-row-actions">
                        {confirmRoleId === member.id ? (
                          <div
                            aria-label={`Change ${label} role confirmation`}
                            className="workspace-team-confirm"
                            onKeyDown={(event) => {
                              if (event.key === "Escape" && !memberBusy) {
                                event.preventDefault();
                                cancelRoleConfirmation(member.id);
                              }
                            }}
                            role="group"
                          >
                            <p id={roleWarningId(member.id)}>
                              Change this non-owner member from {member.role}{" "}
                              to {roleDraft}. Access changes immediately after
                              the server accepts the update.
                            </p>
                            <button
                              aria-describedby={roleWarningId(member.id)}
                              autoFocus
                              className="button button-solid"
                              disabled={memberBusy}
                              onClick={() =>
                                void updateMemberRole(member)
                              }
                              type="button"
                            >
                              {memberBusy
                                ? "Changing role..."
                                : "Confirm role change"}
                            </button>
                            <button
                              className="button button-outline"
                              disabled={memberBusy}
                              onClick={() =>
                                cancelRoleConfirmation(member.id)
                              }
                              type="button"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : confirmRemoveId === member.id ? (
                          <div
                            aria-label={`Remove ${label} confirmation`}
                            className="workspace-team-confirm is-danger"
                            onKeyDown={(event) => {
                              if (event.key === "Escape" && !memberBusy) {
                                event.preventDefault();
                                cancelRemoveConfirmation(member.id);
                              }
                            }}
                            role="group"
                          >
                            <p id={removeWarningId(member.id)}>
                              Remove this {member.state} {member.role} member
                              record from the workspace. This cannot be undone
                              from this screen.
                            </p>
                            <button
                              aria-describedby={removeWarningId(member.id)}
                              autoFocus
                              className="button button-solid"
                              disabled={memberBusy}
                              onClick={() => void removeMember(member)}
                              type="button"
                            >
                              {memberBusy
                                ? "Removing member..."
                                : "Confirm removal"}
                            </button>
                            <button
                              className="button button-outline"
                              disabled={memberBusy}
                              onClick={() =>
                                cancelRemoveConfirmation(member.id)
                              }
                              type="button"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            {canChangeRole ? (
                              <div className="workspace-team-role-control">
                                <label>
                                  <span>Role for {label}</span>
                                  <select
                                    disabled={busy}
                                    onChange={(event) =>
                                      setRoleDrafts((current) => ({
                                        ...current,
                                        [member.id]: event.target
                                          .value as ManagedWorkspaceTeamRole,
                                      }))
                                    }
                                    value={roleDraft}
                                  >
                                    <option value="admin">Admin</option>
                                    <option value="developer">
                                      Developer
                                    </option>
                                  </select>
                                </label>
                                <button
                                  className="button button-outline"
                                  disabled={
                                    busy || roleDraft === member.role
                                  }
                                  id={roleTriggerId(member.id)}
                                  onClick={() =>
                                    openRoleConfirmation(member.id)
                                  }
                                  type="button"
                                >
                                  Review role change
                                </button>
                              </div>
                            ) : null}
                            {canRemove ? (
                              <button
                                className="workspace-team-remove"
                                disabled={busy}
                                id={removeTriggerId(member.id)}
                                onClick={() =>
                                  openRemoveConfirmation(member.id)
                                }
                                type="button"
                              >
                                Remove {label}
                              </button>
                            ) : member.role === "owner" ? (
                              <small>
                                Owner access is protected in this panel.
                              </small>
                            ) : workspaceRole === "admin" ? (
                              <small>
                                Admins can manage developer members only.
                              </small>
                            ) : (
                              <small>Your role has view-only access.</small>
                            )}
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div
        aria-atomic="true"
        className="workspace-team-feedback"
      >
        {feedback ? (
          <p
            className={`is-${feedback.tone}`}
            role={feedback.tone === "error" ? "alert" : "status"}
          >
            {feedback.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function memberEndpoint(memberId: string): string {
  return `${membersEndpoint}/${encodeURIComponent(memberId)}`;
}

function memberHeadingId(memberId: string): string {
  return `workspace-member-${encodeURIComponent(memberId)}`;
}

function roleTriggerId(memberId: string): string {
  return `workspace-role-trigger-${encodeURIComponent(memberId)}`;
}

function removeTriggerId(memberId: string): string {
  return `workspace-remove-trigger-${encodeURIComponent(memberId)}`;
}

function roleWarningId(memberId: string): string {
  return `workspace-role-warning-${encodeURIComponent(memberId)}`;
}

function removeWarningId(memberId: string): string {
  return `workspace-remove-warning-${encodeURIComponent(memberId)}`;
}

function restoreTeamFocus(id: string) {
  window.requestAnimationFrame(() => {
    document.getElementById(id)?.focus();
  });
}

function roleDraftsFromMembers(
  members: WorkspaceMember[],
): Record<string, ManagedWorkspaceTeamRole> {
  return Object.fromEntries(
    members
      .filter(
        (
          member,
        ): member is WorkspaceMember & {
          role: ManagedWorkspaceTeamRole;
        } => member.role !== "owner",
      )
      .map((member) => [member.id, member.role]),
  );
}

function upsertMember(
  members: WorkspaceMember[],
  member: WorkspaceMember,
): WorkspaceMember[] {
  return sortMembers([
    member,
    ...members.filter((candidate) => candidate.id !== member.id),
  ]);
}

function sortMembers(members: WorkspaceMember[]): WorkspaceMember[] {
  const roleOrder: Record<WorkspaceTeamRole, number> = {
    owner: 0,
    admin: 1,
    developer: 2,
  };
  return [...members].sort(
    (left, right) =>
      roleOrder[left.role] - roleOrder[right.role] ||
      Number(left.state === "pending") -
        Number(right.state === "pending") ||
      workspaceMemberLabel(left).localeCompare(
        workspaceMemberLabel(right),
      ),
  );
}

function permissionSummary(role: WorkspaceTeamRole): string {
  if (role === "owner") {
    return "Invite, change roles, and remove non-owner members.";
  }
  if (role === "admin") {
    return "Invite and remove developer members.";
  }
  return "View workspace member records.";
}

function formatMemberDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function teamResponseProblem(
  payload: unknown,
  fallback: string,
): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return fallback;
  }
  const candidate = payload as Record<string, unknown>;
  for (const key of ["detail", "message", "title", "error"]) {
    if (typeof candidate[key] === "string" && candidate[key].trim()) {
      return candidate[key].trim();
    }
  }
  if (
    candidate.fields &&
    typeof candidate.fields === "object" &&
    !Array.isArray(candidate.fields)
  ) {
    const messages = Object.values(
      candidate.fields as Record<string, unknown>,
    ).filter(
      (value): value is string =>
        typeof value === "string" && Boolean(value.trim()),
    );
    if (messages.length > 0) return messages.join(" ");
  }
  return fallback;
}
