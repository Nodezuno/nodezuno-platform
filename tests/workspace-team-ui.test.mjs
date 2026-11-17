import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canChangeWorkspaceMemberRole,
  canRemoveWorkspaceMember,
  parseWorkspaceMemberEnvelope,
  parseWorkspaceMembersEnvelope,
  workspaceInvitePayload,
  workspaceInviteRoles,
  workspaceRoleUpdatePayload,
} from "../lib/client/workspace-team.ts";

const panelUrl = new URL(
  "../components/workspace-team-panel.tsx",
  import.meta.url,
);
const consoleUrl = new URL(
  "../components/developer-console.tsx",
  import.meta.url,
);
const stylesUrl = new URL("../app/globals.css", import.meta.url);

const owner = member({
  id: "owner-1",
  email: "owner@example.com",
  role: "owner",
  state: "active",
});
const admin = member({
  id: "admin-1",
  email: "admin@example.com",
  role: "admin",
  state: "active",
});
const developer = member({
  id: "developer-1",
  email: "dev@example.com",
  role: "developer",
  state: "pending",
});

test("workspace role capabilities enforce the exact owner, admin, and developer boundaries", () => {
  assert.deepEqual(workspaceInviteRoles("owner"), [
    "admin",
    "developer",
  ]);
  assert.deepEqual(workspaceInviteRoles("admin"), ["developer"]);
  assert.deepEqual(workspaceInviteRoles("developer"), []);

  assert.equal(canChangeWorkspaceMemberRole("owner", admin), true);
  assert.equal(canChangeWorkspaceMemberRole("owner", owner), false);
  assert.equal(canChangeWorkspaceMemberRole("admin", developer), false);
  assert.equal(
    canChangeWorkspaceMemberRole("developer", developer),
    false,
  );

  assert.equal(canRemoveWorkspaceMember("owner", admin), true);
  assert.equal(canRemoveWorkspaceMember("owner", owner), false);
  assert.equal(canRemoveWorkspaceMember("admin", developer), true);
  assert.equal(canRemoveWorkspaceMember("admin", admin), false);
  assert.equal(
    canRemoveWorkspaceMember("developer", developer),
    false,
  );
});

test("team mutation payloads contain only contract fields", () => {
  assert.deepEqual(
    workspaceInvitePayload(
      "owner",
      " Admin@Example.COM ",
      "admin",
    ),
    {
      email: "admin@example.com",
      role: "admin",
    },
  );
  assert.deepEqual(
    workspaceInvitePayload("admin", "dev@example.com", "developer"),
    {
      email: "dev@example.com",
      role: "developer",
    },
  );
  assert.throws(() =>
    workspaceInvitePayload("admin", "admin@example.com", "admin"),
  );
  assert.throws(() =>
    workspaceInvitePayload(
      "developer",
      "dev@example.com",
      "developer",
    ),
  );
  assert.throws(() =>
    workspaceInvitePayload("owner", "not-an-email", "developer"),
  );
  assert.deepEqual(
    workspaceRoleUpdatePayload("owner", developer, "admin"),
    { role: "admin" },
  );
  assert.throws(() =>
    workspaceRoleUpdatePayload("admin", developer, "admin"),
  );
  assert.throws(() =>
    workspaceRoleUpdatePayload("owner", owner, "developer"),
  );
});

test("team response parsers require the exact envelope and member states", () => {
  const payload = {
    data: { members: [owner, developer] },
    requestId: "request-members",
  };
  assert.deepEqual(parseWorkspaceMembersEnvelope(payload), {
    members: [owner, developer],
    requestId: "request-members",
  });
  assert.deepEqual(
    parseWorkspaceMemberEnvelope({
      data: { member: developer, created: true },
      requestId: "request-create",
    }),
    {
      member: developer,
      created: true,
      requestId: "request-create",
    },
  );
  assert.deepEqual(
    parseWorkspaceMemberEnvelope({
      data: { member: admin },
      requestId: "request-update",
    }),
    {
      member: admin,
      requestId: "request-update",
    },
  );
  assert.throws(() =>
    parseWorkspaceMembersEnvelope({
      data: { members: [{ ...developer, state: "invited" }] },
      requestId: "bad-state",
    }),
  );
  assert.throws(() =>
    parseWorkspaceMemberEnvelope({
      data: { member: developer, created: "yes" },
      requestId: "bad-created",
    }),
  );
  assert.throws(() =>
    parseWorkspaceMembersEnvelope({
      data: { members: [] },
    }),
  );
});

test("team panel implements exact routes, conflict recovery, accessible confirmations, and honest invitation copy", async () => {
  const [panel, consoleSource, styles] = await Promise.all([
    readFile(panelUrl, "utf8"),
    readFile(consoleUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);

  assert.match(
    panel,
    /const membersEndpoint = "\/api\/v1\/developer\/workspace\/members"/,
  );
  assert.match(panel, /credentials: "same-origin"/);
  assert.match(panel, /method: "POST"/);
  assert.match(panel, /method: "PUT"/);
  assert.match(panel, /method: "DELETE"/);
  assert.match(
    panel,
    /`\$\{membersEndpoint\}\/\$\{encodeURIComponent\(memberId\)\}`/,
  );
  assert.match(panel, /body: JSON\.stringify\(body\)/);
  assert.equal(
    panel.match(/response\.status === 409/g)?.length,
    3,
  );
  assert.match(panel, /Your selected role is still visible/);
  assert.match(panel, /No member was removed/);
  assert.match(panel, /No new member record was created/);
  assert.match(panel, /result\.created === undefined/);

  assert.match(panel, /does not confirm that an invitation email was sent/);
  assert.match(panel, /does not claim[\s\S]+invitation email was sent/);
  assert.doesNotMatch(
    panel,
    /Invitation email sent|Email sent successfully/,
  );
  assert.match(panel, /member\.state === "pending"/);
  assert.match(panel, /is-\$\{member\.state\}/);

  assert.match(panel, /workspaceInviteRoles\(workspaceRole\)/);
  assert.match(panel, /canChangeWorkspaceMemberRole/);
  assert.match(panel, /canRemoveWorkspaceMember/);
  assert.match(panel, /Admins can add developer records only/);
  assert.match(panel, /view-only for developers/);
  assert.match(panel, /Owner access is protected/);

  assert.match(panel, /event\.key === "Escape"/);
  assert.match(panel, /autoFocus/);
  assert.match(panel, /restoreTeamFocus/);
  assert.match(panel, /aria-describedby=\{roleWarningId/);
  assert.match(panel, /aria-describedby=\{removeWarningId/);
  assert.match(panel, /aria-busy=\{busy\}/);
  assert.match(panel, /role="region"/);
  assert.match(panel, /role="alert"/);
  assert.match(panel, /role="status"/);
  assert.match(panel, /tabIndex=\{-1\}/);

  assert.match(consoleSource, /<WorkspaceTeamPanel/);
  assert.match(
    consoleSource,
    /workspaceRole=\{workspace\.role\}/,
  );

  assert.match(styles, /\.workspace-team-panel/);
  assert.match(styles, /\.workspace-member-state\.is-active/);
  assert.match(styles, /\.workspace-member-state\.is-pending/);
  assert.match(
    styles,
    /@media \(max-width: 620px\)[\s\S]+\.workspace-team-role-control[\s\S]+grid-template-columns: 1fr/,
  );
  assert.match(
    styles,
    /@media \(forced-colors: active\)[\s\S]+\.workspace-team-panel/,
  );
  assert.match(
    styles,
    /@media \(hover: none\), \(pointer: coarse\)[\s\S]+\.workspace-team-remove/,
  );

  for (const source of [panel, consoleSource, styles]) {
    assert.doesNotMatch(source, /\u2014/);
  }
});

function member(overrides) {
  return {
    id: "member-1",
    email: null,
    role: "developer",
    state: "pending",
    createdAt: "2026-07-18T10:00:00.000Z",
    updatedAt: "2026-07-18T10:00:00.000Z",
    ...overrides,
  };
}
