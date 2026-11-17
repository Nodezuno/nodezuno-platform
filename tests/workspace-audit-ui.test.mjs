import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  appendWorkspaceAuditEvents,
  canViewWorkspaceAudit,
  parseWorkspaceAuditEnvelope,
  workspaceAuditActorPresentation,
  workspaceAuditEntityLabel,
  workspaceAuditPagePath,
} from "../lib/client/workspace-audit.ts";

const panelUrl = new URL(
  "../components/workspace-audit-panel.tsx",
  import.meta.url,
);
const consoleUrl = new URL(
  "../components/developer-console.tsx",
  import.meta.url,
);
const clientUrl = new URL(
  "../lib/client/workspace-audit.ts",
  import.meta.url,
);
const stylesUrl = new URL("../app/globals.css", import.meta.url);

const ids = {
  eventA: "ffffffff-ffff-4fff-bfff-ffffffffffff",
  eventB: "eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee",
  eventC: "dddddddd-dddd-4ddd-9ddd-dddddddddddd",
  account: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  apiKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  entity: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  service: "99999999-9999-4999-8999-999999999999",
};

test("audit access and cursor URL construction are exact and bounded", () => {
  assert.equal(canViewWorkspaceAudit("owner"), true);
  assert.equal(canViewWorkspaceAudit("admin"), true);
  assert.equal(canViewWorkspaceAudit("developer"), false);
  assert.equal(canViewWorkspaceAudit(null), false);

  assert.equal(
    workspaceAuditPagePath(null),
    "/api/v1/developer/workspace/audit-events?limit=25",
  );
  assert.equal(
    workspaceAuditPagePath("opaque_CURSOR-7", 100),
    "/api/v1/developer/workspace/audit-events?limit=100&cursor=opaque_CURSOR-7",
  );
  assert.throws(() => workspaceAuditPagePath("cursor.with.dot"));
  assert.throws(() => workspaceAuditPagePath("cursor", 0));
  assert.throws(() => workspaceAuditPagePath("cursor", 101));
});

test("known actions become predefined safe facts without retaining raw detail", () => {
  const cases = [
    [
      "workspace.created",
      { role: "owner" },
      ["Initial role"],
    ],
    [
      "workspace_member.invited",
      { role: "developer", state: "pending" },
      ["Assigned role", "Membership state"],
    ],
    [
      "workspace_member.role_updated",
      { previousRole: "developer", role: "admin" },
      ["Previous role", "New role"],
    ],
    [
      "workspace_member.removed",
      { previousRole: "admin", previousState: "active" },
      ["Previous role", "Previous state"],
    ],
    [
      "api_key.created",
      {
        prefix: "nzu_live_1234abcd",
        lastFour: "Z_9x",
        scopes: ["services:manage"],
        serviceId: null,
        expiresAt: 1_900_000_000_000,
      },
      ["Key fingerprint", "Scopes", "Service binding", "Expires"],
    ],
    [
      "api_key.revoked",
      {},
      [],
    ],
    [
      "api_key.rotated",
      {
        sourceKeyId: ids.apiKey,
        prefix: "nzu_live_abcdef12",
        lastFour: "aB_9",
        scopes: ["rpc:invoke"],
        serviceId: ids.service,
        expiresAt: 1_900_000_000_000,
      },
      [
        "Source key",
        "Replacement key",
        "Scopes",
        "Service binding",
        "Expires",
      ],
    ],
    [
      "service.created",
      {
        product: "rpc-api",
        environment: "production",
        network: "base",
        region: "global",
        status: "active",
      },
      ["Product", "Environment", "Network", "Region", "Initial status"],
    ],
    ["service.archived", {}, []],
    [
      "rpc_access_policy.updated",
      {
        revision: 7,
        allowedOriginsCount: 2,
        allowedIpCidrsCount: 3,
        allowedMethodsCount: 4,
      },
      [
        "Policy revision",
        "Allowed origins",
        "Allowed IP ranges",
        "Allowed methods",
      ],
    ],
  ];

  for (const [action, detail, factLabels] of cases) {
    const parsed = parseWorkspaceAuditEnvelope(
      envelope([auditEvent({ action, detail })]),
    );
    assert.deepEqual(
      parsed.events[0].facts.map((fact) => fact.label),
      factLabels,
      action,
    );
    assert.equal("detail" in parsed.events[0], false);
  }

  const apiKeyEvent = parseWorkspaceAuditEnvelope(
    envelope([
      auditEvent({
        action: "api_key.created",
        detail: {
          prefix: "nzu_live_1234abcd",
          lastFour: "Z_9x",
          scopes: ["services:manage"],
          serviceId: null,
          expiresAt: 1_900_000_000_000,
        },
      }),
    ]),
  ).events[0];
  assert.equal(
    apiKeyEvent.facts.find((fact) => fact.label === "Service binding")
      ?.value,
    "Platform identity only",
  );
  assert.equal(
    apiKeyEvent.facts.find((fact) => fact.label === "Scopes")?.value,
    "services:manage",
  );
});

test("unknown actions stay visible with no detail and all extra detail fails closed", () => {
  const unknown = parseWorkspaceAuditEnvelope(
    envelope([
      auditEvent({
        action: "future.changed",
        detail: {},
      }),
    ]),
  ).events[0];
  assert.equal(unknown.actionLabel, "Workspace activity recorded");
  assert.deepEqual(unknown.facts, []);

  assert.throws(() =>
    parseWorkspaceAuditEnvelope(
      envelope([
        auditEvent({
          action: "future.changed",
          detail: { secret: "must-not-render" },
        }),
      ]),
    ),
  );
  assert.throws(() =>
    parseWorkspaceAuditEnvelope(
      envelope([
        auditEvent({
          action: "api_key.created",
          detail: {
            prefix: "nzu_live_1234abcd",
            secretHash: "must-not-render",
          },
        }),
      ]),
    ),
  );
  assert.throws(() =>
    parseWorkspaceAuditEnvelope(
      envelope([
        auditEvent({
          action: "api_key.created",
          detail: {
            scopes: ["secret:read"],
          },
        }),
      ]),
    ),
  );
});

test("audit envelopes reject extra structure, unsafe values, duplicates, and unstable order", () => {
  const valid = envelope([auditEvent({})]);
  assert.equal(parseWorkspaceAuditEnvelope(valid).events.length, 1);

  assert.throws(() =>
    parseWorkspaceAuditEnvelope({ ...valid, extra: true }),
  );
  assert.throws(() =>
    parseWorkspaceAuditEnvelope(
      envelope([{ ...auditEvent({}), extra: true }]),
    ),
  );
  assert.throws(() =>
    parseWorkspaceAuditEnvelope(
      envelope([
        {
          ...auditEvent({}),
          actor: {
            ...auditEvent({}).actor,
            token: "must-not-render",
          },
        },
      ]),
    ),
  );
  assert.throws(() =>
    parseWorkspaceAuditEnvelope(
      envelope([
        auditEvent({ createdAt: "18 July 2026" }),
      ]),
    ),
  );
  assert.throws(() =>
    parseWorkspaceAuditEnvelope(
      envelope([
        auditEvent({ id: ids.eventA }),
        auditEvent({ id: ids.eventA }),
      ]),
    ),
  );
  assert.throws(() =>
    parseWorkspaceAuditEnvelope(
      envelope([
        auditEvent({
          id: ids.eventA,
          createdAt: "2026-07-17T10:00:00.000Z",
        }),
        auditEvent({
          id: ids.eventB,
          createdAt: "2026-07-18T10:00:00.000Z",
        }),
      ]),
    ),
  );
  assert.throws(() =>
    parseWorkspaceAuditEnvelope(
      envelope([], { nextCursor: "opaque_cursor" }),
    ),
  );
  assert.throws(() =>
    parseWorkspaceAuditEnvelope(
      envelope([], { nextCursor: "unsafe.cursor" }),
    ),
  );
});

test("page append preserves exact descending order and rejects overlap", () => {
  const first = parseWorkspaceAuditEnvelope(
    envelope([
      auditEvent({
        id: ids.eventA,
        createdAt: "2026-07-18T10:00:00.000Z",
      }),
      auditEvent({
        id: ids.eventB,
        createdAt: "2026-07-17T10:00:00.000Z",
      }),
    ]),
  ).events;
  const second = parseWorkspaceAuditEnvelope(
    envelope([
      auditEvent({
        id: ids.eventC,
        createdAt: "2026-07-16T10:00:00.000Z",
      }),
    ]),
  ).events;

  assert.deepEqual(
    appendWorkspaceAuditEvents(first, second).map((event) => event.id),
    [ids.eventA, ids.eventB, ids.eventC],
  );
  assert.throws(() =>
    appendWorkspaceAuditEvents(first, [first[1]]),
  );
  assert.throws(() =>
    appendWorkspaceAuditEvents(second, first),
  );
});

test("actor and entity labels disclose only bounded audit identity context", () => {
  assert.deepEqual(
    workspaceAuditActorPresentation({
      accountId: ids.account,
      email: "owner@example.com",
      apiKeyId: ids.apiKey,
    }),
    {
      label: "owner@example.com",
      context: "Authenticated with API key …bbbbbbbbbbbb",
    },
  );
  assert.deepEqual(
    workspaceAuditActorPresentation({
      accountId: null,
      email: null,
      apiKeyId: null,
    }),
    {
      label: "Workspace system",
      context: "No user identity was recorded",
    },
  );
  assert.equal(workspaceAuditEntityLabel("service"), "Service");
  assert.equal(
    workspaceAuditEntityLabel("future_entity"),
    "Recorded entity",
  );
});

test("audit panel uses one owner-admin cursor timeline and never renders raw detail", async () => {
  const [panel, consoleSource, client, styles] = await Promise.all([
    readFile(panelUrl, "utf8"),
    readFile(consoleUrl, "utf8"),
    readFile(clientUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);

  assert.match(
    client,
    /\/api\/v1\/developer\/workspace\/audit-events/,
  );
  assert.match(panel, /workspaceAuditPagePath\(cursor, pageSize\)/);
  assert.match(panel, /credentials: "same-origin"/);
  assert.match(panel, /cache: "no-store"/);
  assert.match(panel, /parseWorkspaceAuditEnvelope\(payload\)/);
  assert.match(panel, /appendWorkspaceAuditEvents/);
  assert.match(panel, /page\.nextCursor === cursor/);
  assert.match(panel, /loadController\.current\?\.abort\(\)/);
  assert.doesNotMatch(panel, /\bsetInterval\s*\(|\bwhile\s*\(/);

  assert.match(
    consoleSource,
    /workspace && workspace\.role !== "developer"[\s\S]+<WorkspaceAuditPanel/,
  );
  assert.match(panel, /if \(!authorized\) return null/);
  assert.match(panel, /<ol[\s\S]+className="workspace-audit-timeline"/);
  assert.match(panel, /<time dateTime=\{event\.createdAt\}>/);
  assert.match(panel, /event\.actionLabel/);
  assert.match(panel, /workspaceAuditActorPresentation/);
  assert.match(panel, /event\.facts\.map/);
  assert.doesNotMatch(panel, /event\.detail|Object\.entries|Object\.values/);
  assert.doesNotMatch(panel, /JSON\.stringify/);
  assert.match(
    panel,
    /Secrets, policy values, RPC payloads,[\s\S]+arbitrary detail fields are never rendered/,
  );

  assert.match(panel, /Loading workspace activity/);
  assert.match(panel, /role="alert"/);
  assert.match(panel, /Retry activity load/);
  assert.match(panel, /No workspace activity was returned/);
  assert.match(panel, /Load more activity/);
  assert.match(panel, /Retry older activity/);
  assert.match(panel, /End of recorded workspace activity/);
  assert.match(panel, /aria-live="polite"/);
  assert.match(panel, /restoreAuditFocus/);
  assert.match(panel, /firstNewEventId/);

  assert.match(styles, /\.workspace-audit-panel/);
  assert.match(styles, /\.workspace-audit-timeline/);
  assert.match(
    styles,
    /@media \(max-width: 620px\)[\s\S]+?\.workspace-audit-facts/,
  );
  assert.match(
    styles,
    /@media \(hover: none\), \(pointer: coarse\)[\s\S]+?\.workspace-audit-pagination \.button/,
  );
  assert.match(
    styles,
    /@media \(forced-colors: active\)[\s\S]+?\.workspace-audit-panel/,
  );

  for (const source of [panel, consoleSource, client, styles]) {
    assert.doesNotMatch(source, /\u2014/);
  }
});

function envelope(events, overrides = {}) {
  return {
    data: {
      events,
      nextCursor:
        Object.hasOwn(overrides, "nextCursor")
          ? overrides.nextCursor
          : null,
    },
    requestId: "request-audit-1",
  };
}

function auditEvent(overrides) {
  return {
    id: overrides.id ?? ids.eventA,
    actor: {
      accountId: ids.account,
      email: "owner@example.com",
      apiKeyId: null,
    },
    action: overrides.action ?? "service.archived",
    entity: {
      type: "service",
      id: ids.entity,
    },
    detail: overrides.detail ?? {},
    createdAt:
      overrides.createdAt ?? "2026-07-18T10:00:00.000Z",
  };
}
