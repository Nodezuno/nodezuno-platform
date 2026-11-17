import assert from "node:assert/strict";

const baseUrl = new URL(process.argv[2] ?? "http://localhost:3000");
const origin = baseUrl.origin;
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

if (!localHosts.has(baseUrl.hostname)) {
  throw new Error(
    `Refusing to run the destructive smoke suite against non-local host ${baseUrl.hostname}.`,
  );
}

function hasLeadingZeroBits(digest, difficulty) {
  let remaining = difficulty;
  for (const byte of digest) {
    if (remaining <= 0) return true;
    if (remaining >= 8) {
      if (byte !== 0) return false;
      remaining -= 8;
      continue;
    }
    return (byte >>> (8 - remaining)) === 0;
  }
  return remaining <= 0;
}

async function solveChallenge(purpose) {
  const response = await fetch(
    new URL(`/api/v1/abuse-challenge?purpose=${purpose}`, baseUrl),
    { headers: { Accept: "application/json" } },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  const { challenge, difficulty } = body.data;
  const encoder = new TextEncoder();
  for (let start = 0; start <= 2_000_000; start += 128) {
    const counters = Array.from({ length: 128 }, (_, index) => start + index);
    const results = await Promise.all(
      counters.map(async (counter) => ({
        counter,
        digest: new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            encoder.encode(`${challenge}.${counter}`),
          ),
        ),
      })),
    );
    const solved = results.find(({ digest }) =>
      hasLeadingZeroBits(digest, difficulty),
    );
    if (solved) return `${challenge}.${solved.counter}`;
  }
  throw new Error("Challenge was not solved within the counter budget.");
}

async function json(pathname, init) {
  const response = await fetch(new URL(pathname, baseUrl), init);
  const body = await response.json();
  return { response, body };
}

function sessionCookie(response) {
  const values =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);
  const value = values
    .map((candidate) => candidate.split(";", 1)[0])
    .filter(Boolean)
    .join("; ");
  assert.match(value, /nodezuno\.session_token=/);
  return value;
}

for (const pathname of [
  "/api/v1/health",
  "/api/v1/status",
  "/api/v1/chains",
]) {
  const { response } = await json(pathname);
  assert.equal(response.status, 200, pathname);
}

const suffix = crypto.randomUUID().slice(0, 8);
const submission = {
  kind: "sales",
  name: "Backend Smoke",
  email: `backend-smoke-${suffix}@example.com`,
  company: "Nodezuno Test",
  team: "Infrastructure / developer tools",
  message:
    "This local-only request verifies durable persistence, idempotency, and browser challenge enforcement.",
  consent: true,
  website: "",
  sourcePath: `/contact/sales?utm_campaign=${"x".repeat(400)}`,
  utmSource: null,
  utmMedium: null,
  utmCampaign: "x".repeat(180),
};
const idempotencyKey = `backend-smoke-${crypto.randomUUID()}`;
const proof = await solveChallenge("submission");
const submissionHeaders = {
  "Content-Type": "application/json",
  "Idempotency-Key": idempotencyKey,
  Origin: origin,
  "X-Nodezuno-Challenge": proof,
};

const accepted = await json("/api/v1/submissions", {
  method: "POST",
  headers: submissionHeaders,
  body: JSON.stringify(submission),
});
assert.equal(accepted.response.status, 201);
assert.ok(accepted.body.data.id);

const replay = await json("/api/v1/submissions", {
  method: "POST",
  headers: submissionHeaders,
  body: JSON.stringify(submission),
});
assert.equal(replay.response.status, 200);
assert.equal(replay.body.data.id, accepted.body.data.id);
assert.equal(replay.body.replayed, true);

const anonymousAdmin = await json("/api/v1/admin/submissions");
assert.equal(anonymousAdmin.response.status, 401);

const rejectedForgedAdmin = await json(
  `/api/v1/admin/submissions/${accepted.body.data.id}`,
  {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      "oai-authenticated-user-email": "info@nodezuno.com",
    },
    body: JSON.stringify({ status: "reviewing" }),
  },
);
assert.equal(rejectedForgedAdmin.response.status, 401);

const developerEmail = `developer-smoke-${suffix}@nodezuno.local`;
const developerPassword = `Nodezuno-backend-smoke-${crypto.randomUUID()}-safe`;
const signup = await json("/api/auth/sign-up/email", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: origin,
  },
  body: JSON.stringify({
    callbackURL: "/console?product=rollups&network=avalanche-l1",
    email: developerEmail,
    name: "Nodezuno backend smoke",
    password: developerPassword,
  }),
});
assert.equal(signup.response.status, 200, "email signup");
const developerCookie = sessionCookie(signup.response);
const developerIdentityHeaders = {
  Cookie: developerCookie,
};
const emptyWorkspace = await json("/api/v1/developer/workspace", {
  headers: developerIdentityHeaders,
});
assert.equal(emptyWorkspace.response.status, 200);
assert.equal(emptyWorkspace.body.data.workspace, null);

const createdWorkspace = await json("/api/v1/developer/workspace", {
  method: "POST",
  headers: {
    ...developerIdentityHeaders,
    "Content-Type": "application/json",
    Origin: origin,
  },
  body: JSON.stringify({ name: `Smoke Workspace ${suffix}` }),
});
assert.equal(createdWorkspace.response.status, 201);
assert.equal(createdWorkspace.body.data.created, true);
assert.equal(createdWorkspace.body.data.workspace.role, "owner");

const chainProject = await json("/api/v1/developer/services", {
  method: "POST",
  headers: {
    ...developerIdentityHeaders,
    "Content-Type": "application/json",
    "Idempotency-Key": `backend-smoke-chain-${crypto.randomUUID()}`,
    Origin: origin,
  },
  body: JSON.stringify({
    product: "rollups",
    name: `Avalanche L1 smoke ${suffix}`,
    environment: "development",
    network: "avalanche-l1",
    region: "global",
  }),
});
assert.equal(chainProject.response.status, 201, "chain project creation");
assert.equal(chainProject.body.data.service.status, "configuration_saved");
assert.equal(chainProject.body.data.service.endpointPath, null);
assert.equal(
  chainProject.body.data.service.configuration.provisioning,
  "project_created",
);
assert.equal(
  chainProject.body.data.service.configuration.stack.id,
  "avalanche-l1",
);
const chainProjectId = chainProject.body.data.service.id;

const chainDiagnosis = await json(
  `/api/v1/developer/services/${chainProjectId}/ai-diagnosis?window=24h`,
  { headers: developerIdentityHeaders },
);
assert.equal(chainDiagnosis.response.status, 200, "chain readiness diagnosis");
assert.equal(chainDiagnosis.body.data.diagnosis.service.id, chainProjectId);
assert.equal(chainDiagnosis.body.data.diagnosis.coverage.kind, "readiness");
assert.equal(chainDiagnosis.body.data.diagnosis.coverage.status, "limited");
assert.equal(chainDiagnosis.body.data.diagnosis.engine.mode, "deterministic");
assert.equal(chainDiagnosis.body.data.diagnosis.engine.modelInvoked, false);
assert.ok(
  chainDiagnosis.body.data.diagnosis.limitations.some((limitation) =>
    limitation.includes("runtime"),
  ),
  "a project brief must not be presented as runtime telemetry",
);

const createdKey = await json("/api/v1/developer/api-keys", {
  method: "POST",
  headers: {
    ...developerIdentityHeaders,
    "Content-Type": "application/json",
    "Idempotency-Key": `backend-smoke-key-${crypto.randomUUID()}`,
    Origin: origin,
  },
  body: JSON.stringify({
    name: "Smoke identity key",
    serviceId: null,
    scopes: ["platform:identity"],
  }),
});
assert.equal(createdKey.response.status, 201);
assert.equal(createdKey.body.data.apiKey.serviceId, null);
assert.match(
  createdKey.body.data.secret,
  /^nzu_live_[0-9a-f-]{36}_[A-Za-z0-9_-]{43}$/,
);
assert.equal(createdKey.response.headers.get("cache-control"), "no-store, max-age=0");
const developerKeyId = createdKey.body.data.apiKey.id;
let developerSecret = createdKey.body.data.secret;

const listedKeys = await json("/api/v1/developer/api-keys", {
  headers: developerIdentityHeaders,
});
assert.equal(listedKeys.response.status, 200);
assert.equal(listedKeys.body.data.apiKeys[0].id, developerKeyId);
assert.equal(listedKeys.body.data.apiKeys[0].serviceId, null);
assert.equal(
  Object.hasOwn(listedKeys.body.data.apiKeys[0], "secret"),
  false,
);
assert.equal(
  Object.hasOwn(listedKeys.body.data.apiKeys[0], "secretHash"),
  false,
);

const keyIdentity = await json("/api/v1/platform/whoami", {
  headers: { Authorization: `Bearer ${developerSecret}` },
});
assert.equal(keyIdentity.response.status, 200);
assert.equal(
  keyIdentity.body.data.workspace.id,
  createdWorkspace.body.data.workspace.id,
);
assert.deepEqual(keyIdentity.body.data.apiKey.scopes, [
  "platform:identity",
]);
assert.equal(keyIdentity.body.data.apiKey.serviceId, null);

const revokedKey = await json(
  `/api/v1/developer/api-keys/${developerKeyId}`,
  {
    method: "DELETE",
    headers: {
      ...developerIdentityHeaders,
      Origin: origin,
    },
  },
);
assert.equal(revokedKey.response.status, 200);
assert.ok(revokedKey.body.data.apiKey.revokedAt);

const rejectedRevokedKey = await json("/api/v1/platform/whoami", {
  headers: { Authorization: `Bearer ${developerSecret}` },
});
assert.equal(rejectedRevokedKey.response.status, 401);
assert.equal(rejectedRevokedKey.body.code, "api_key_invalid");
developerSecret = null;

const archivedChainProject = await json(
  `/api/v1/developer/services/${chainProjectId}`,
  {
    method: "DELETE",
    headers: {
      ...developerIdentityHeaders,
      Origin: origin,
    },
  },
);
assert.equal(archivedChainProject.response.status, 200);
assert.equal(archivedChainProject.body.data.service.status, "archived");
assert.ok(archivedChainProject.body.data.service.archivedAt);

const conflict = await json("/api/v1/submissions", {
  method: "POST",
  headers: submissionHeaders,
  body: JSON.stringify({
    ...submission,
    message: `${submission.message} Changed payload.`,
  }),
});
assert.equal(conflict.response.status, 409);

const missingChallenge = await json("/api/v1/submissions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Idempotency-Key": `backend-smoke-${crypto.randomUUID()}`,
    Origin: origin,
  },
  body: JSON.stringify({
    ...submission,
    email: `missing-challenge-${suffix}@example.com`,
  }),
});
assert.equal(missingChallenge.response.status, 403);
assert.equal(missingChallenge.body.code, "challenge_required");

const newsletterProof = await solveChallenge("newsletter");
const newsletter = await json("/api/v1/newsletter/subscriptions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: origin,
    "X-Nodezuno-Challenge": newsletterProof,
  },
  body: JSON.stringify({
    email: `signal-smoke-${suffix}@example.com`,
    name: "Backend Smoke",
    consent: true,
    website: "",
    sourcePath: "/community/newsletter",
  }),
});
assert.equal(newsletter.response.status, 202);
assert.equal(newsletter.body.data.state, "pending");

const unsubscribePage = await fetch(
  new URL("/community/newsletter/unsubscribe", baseUrl),
);
assert.equal(unsubscribePage.status, 200);

console.log(
  JSON.stringify({
    health: "healthy",
    statusCatalog: "reachable",
    chainCatalog: "reachable",
    submission: "accepted-replayed-conflict-checked",
    adminBoundary: "anonymous-and-forged-identity-rejected",
    developerAccount: "email-session-created",
    developerWorkspace: "self-provisioned",
    chainProject: "avalanche-l1-brief-created-and-archived",
    developerApiKey: "issued-used-revoked",
    abuseChallenge: "enforced",
    newsletter: "pending",
    unsubscribePage: "reachable",
  }),
);
