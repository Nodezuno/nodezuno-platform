import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("workspace team routes require sessions, same origin, and bounded mutations", async () => {
  const [collection, member] = await Promise.all([
    readFile(
      new URL(
        "../app/api/v1/developer/workspace/members/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/api/v1/developer/workspace/members/[id]/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assert.match(collection, /export async function GET/);
  assert.match(collection, /export async function POST/);
  assert.match(collection, /requireDeveloperIdentity\(request\)/);
  assert.match(collection, /assertSameOrigin\(request\)/);
  assert.match(
    collection,
    /validateDeveloperWorkspaceMemberInvitePayload/,
  );
  assert.match(collection, /workspace-member:invite:identity/);
  assert.match(collection, /status: result\.created \? 201 : 200/);

  assert.match(member, /export async function PUT/);
  assert.match(member, /export async function DELETE/);
  assert.match(member, /assertSameOrigin\(request\)/);
  assert.match(member, /validateDeveloperWorkspaceMemberRolePayload/);
  assert.match(member, /workspace-member:mutate:identity/);
  assert.match(member, /isDeveloperResourceId\(id\)/);
  for (const source of [collection, member]) {
    assert.doesNotMatch(source, /\u2014/);
  }
});

test("workspace membership audits omit invited email values", async () => {
  const source = await readFile(
    new URL("../lib/server/database.ts", import.meta.url),
    "utf8",
  );
  const inviteAudit = source.match(
    /'workspace_member\.invited'[\s\S]*?JSON\.stringify\(\{ role: options\.role, state \}\)/,
  );
  assert.ok(inviteAudit);
  assert.doesNotMatch(inviteAudit[0], /options\.email|email\s*:/);
  assert.match(source, /workspace_member\.role_updated/);
  assert.match(source, /workspace_member\.removed/);
  assert.match(source, /workspace_member_self_invite/);
  assert.match(source, /workspace_owner_protected/);
});
