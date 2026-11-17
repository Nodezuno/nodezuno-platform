import assert from "node:assert/strict";
import test from "node:test";
import {
  validateNewsletterPayload,
  validateSubmissionPayload,
} from "../lib/server/contracts.ts";
import {
  assertSameOrigin,
  HttpProblem,
  parseAdminAllowlist,
  readIdempotencyKey,
  readJsonBody,
  readTextBody,
  userFromRequest,
} from "../lib/server/http.ts";
import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
} from "../lib/auth-paths.ts";
import { deriveOverallStatus } from "../lib/server/status.ts";
import { hasLeadingZeroBits } from "../lib/abuse-proof.ts";
import { unsubscribeNewsletter } from "../lib/server/database.ts";

const validSubmission = {
  kind: "sales",
  name: " Ada Lovelace ",
  email: "ADA@EXAMPLE.COM",
  company: "Analytical Engines",
  team: "Infrastructure / developer tools",
  message:
    "We are evaluating a policy-aware transaction infrastructure architecture.",
  consent: true,
  sourcePath: "/contact/sales?utm_source=test",
  website: "",
  utmSource: "test",
  utmMedium: null,
  utmCampaign: null,
};

test("submission validation normalizes a complete request", () => {
  const result = validateSubmissionPayload(validSubmission);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.name, "Ada Lovelace");
  assert.equal(result.value.email, "ada@example.com");
  assert.equal(result.value.kind, "sales");
  assert.equal(result.value.sourcePath, "/contact/sales");
});

test("submission validation rejects unknown, missing, and unsafe fields", () => {
  const unknown = validateSubmissionPayload({
    ...validSubmission,
    isAdmin: true,
  });
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.match(unknown.fields.body, /unsupported/i);

  const invalid = validateSubmissionPayload({
    ...validSubmission,
    email: "not-an-email",
    message: "short",
    consent: false,
    sourcePath: "https://evil.example/",
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.match(invalid.fields.email, /valid/i);
    assert.match(invalid.fields.message, /20/);
    assert.match(invalid.fields.consent, /required/i);
    assert.match(invalid.fields.sourcePath, /same-site/i);
  }
});

test("security contact limits sensitive detail length", () => {
  const result = validateSubmissionPayload({
    ...validSubmission,
    kind: "security_contact",
    message: "x".repeat(1501),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.fields.message, /1500/);
});

test("campaign attribution is bounded and never blocks a valid request", () => {
  const result = validateSubmissionPayload({
    ...validSubmission,
    sourcePath: `/contact/sales?utm_campaign=${"x".repeat(1000)}`,
    utmSource: 42,
    utmMedium: `paid\u0000social`,
    utmCampaign: "x".repeat(180),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.sourcePath, "/contact/sales");
  assert.equal(result.value.utmSource, null);
  assert.equal(result.value.utmMedium, "paidsocial");
  assert.equal(result.value.utmCampaign?.length, 100);
});

test("newsletter validation is strict and normalizes email", () => {
  const result = validateNewsletterPayload({
    email: " NEWS@EXAMPLE.COM ",
    name: " Grace ",
    consent: true,
    sourcePath: "/community/newsletter",
    website: "",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.email, "news@example.com");
  assert.equal(result.value.name, "Grace");
});

test("newsletter unsubscribe is conditional on the current token inside one batch", async () => {
  const currentTokenHash = "current-token-hash";
  const staleTokenHash = "stale-token-hash";
  const row = {
    id: "subscription-1",
    tokenHash: currentTokenHash,
    state: "pending",
    updatedAt: 100,
  };
  const outbox = [];
  const database = createNewsletterRaceDatabase(row, outbox);

  assert.equal(
    await unsubscribeNewsletter(staleTokenHash, 200, database),
    false,
  );
  assert.equal(row.state, "pending");
  assert.equal(outbox.length, 0);

  assert.equal(
    await unsubscribeNewsletter(currentTokenHash, 201, database),
    true,
  );
  assert.equal(row.state, "unsubscribed");
  assert.equal(row.updatedAt, 201);
  assert.equal(outbox.length, 1);
});

test("request guards enforce origin, media type, size, and idempotency", async () => {
  const sameOrigin = new Request("https://nodezuno.com/api/v1/submissions", {
    method: "POST",
    headers: {
      Origin: "https://nodezuno.com",
      "Content-Type": "application/json",
      "Idempotency-Key": "backend-contract-test-0001",
    },
    body: "{}",
  });
  assert.doesNotThrow(() => assertSameOrigin(sameOrigin));
  assert.equal(readIdempotencyKey(sameOrigin), "backend-contract-test-0001");
  assert.deepEqual(await readJsonBody(sameOrigin), {});

  const crossOrigin = new Request(
    "https://nodezuno.com/api/v1/submissions",
    { headers: { Origin: "https://evil.example" } },
  );
  assert.throws(
    () => assertSameOrigin(crossOrigin),
    (error) => error instanceof HttpProblem && error.status === 403,
  );
  assert.throws(
    () =>
      assertSameOrigin(
        new Request("https://nodezuno.com/api/v1/submissions", {
          method: "POST",
        }),
      ),
    (error) =>
      error instanceof HttpProblem &&
      error.status === 403 &&
      error.code === "origin_required",
  );

  await assert.rejects(
    () =>
      readJsonBody(
        new Request("https://nodezuno.com/api", {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: "{}",
        }),
      ),
    (error) => error instanceof HttpProblem && error.status === 415,
  );

  await assert.rejects(
    () =>
      readJsonBody(
        new Request("https://nodezuno.com/api", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": String(40 * 1024),
          },
          body: "{}",
        }),
      ),
    (error) => error instanceof HttpProblem && error.status === 413,
  );

  const oversizedStreamingRequest = new Request(
    "https://nodezuno.com/api",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(20 * 1024));
          controller.enqueue(new Uint8Array(20 * 1024));
          controller.close();
        },
      }),
      duplex: "half",
    },
  );
  assert.equal(
    oversizedStreamingRequest.headers.has("content-length"),
    false,
  );
  await assert.rejects(
    () => readJsonBody(oversizedStreamingRequest),
    (error) =>
      error instanceof HttpProblem &&
      error.status === 413 &&
      error.code === "request_too_large",
  );

  const boundedText = new Request("https://nodezuno.com/api", {
    method: "POST",
    body: "token=small",
  });
  assert.equal(await readTextBody(boundedText, 64), "token=small");
});

test("identity parsing and admin allowlists are server normalized", () => {
  const request = new Request("https://nodezuno.com/account", {
    headers: {
      "oai-authenticated-user-email": "OWNER@EXAMPLE.COM",
      "oai-authenticated-user-full-name": "Sanjay%20Sudagani",
      "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
    },
  });
  assert.deepEqual(userFromRequest(request), {
    email: "owner@example.com",
    fullName: "Sanjay Sudagani",
    displayName: "Sanjay Sudagani",
  });
  assert.deepEqual(
    [...parseAdminAllowlist("OWNER@example.com, ops@example.com")],
    ["owner@example.com", "ops@example.com"],
  );
});

test("ChatGPT sign-in return paths cannot become open redirects", () => {
  assert.match(chatGPTSignInPath("/account"), /return_to=%2Faccount$/);
  assert.match(chatGPTSignInPath("//evil.example"), /return_to=%2F$/);
  assert.match(chatGPTSignInPath("/\\evil.example"), /return_to=%2F$/);
  assert.match(
    chatGPTSignInPath("/signin-with-chatgpt"),
    /return_to=%2F$/,
  );
  assert.match(
    chatGPTSignOutPath("https://evil.example"),
    /return_to=%2F$/,
  );
});

test("overall status never understates incidents or service outages", () => {
  assert.equal(
    deriveOverallStatus([{ state: "major_outage" }], []),
    "incident",
  );
  assert.equal(
    deriveOverallStatus(
      [{ state: "preview" }],
      [{ state: "investigating", severity: "minor" }],
    ),
    "degraded",
  );
  assert.equal(
    deriveOverallStatus([{ state: "maintenance" }], []),
    "maintenance",
  );
  assert.equal(
    deriveOverallStatus(
      [{ state: "preview" }, { state: "operational" }],
      [],
    ),
    "mixed",
  );
});

test("browser challenge difficulty counts leading SHA-256 bits exactly", () => {
  assert.equal(hasLeadingZeroBits(new Uint8Array([0, 0b00001111]), 12), true);
  assert.equal(hasLeadingZeroBits(new Uint8Array([0, 0b00011111]), 12), false);
  assert.equal(hasLeadingZeroBits(new Uint8Array([1]), 1), true);
  assert.equal(hasLeadingZeroBits(new Uint8Array([128]), 1), false);
});

function createNewsletterRaceDatabase(row, outbox) {
  return {
    prepare(query) {
      return {
        query,
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
      };
    },
    async batch(statements) {
      const [update, enqueue, verify] = statements;
      const [unsubscribedAt, updatedAt, updateTokenHash] = update.values;
      if (row.tokenHash === updateTokenHash) {
        row.state = "unsubscribed";
        row.updatedAt = updatedAt;
        row.unsubscribedAt = unsubscribedAt;
      }

      const [
        outboxId,
        availableAt,
        createdAt,
        outboxUpdatedAt,
        enqueueTokenHash,
        requiredUpdatedAt,
      ] = enqueue.values;
      if (
        row.tokenHash === enqueueTokenHash &&
        row.state === "unsubscribed" &&
        row.updatedAt === requiredUpdatedAt
      ) {
        outbox.push({
          id: outboxId,
          entityId: row.id,
          availableAt,
          createdAt,
          updatedAt: outboxUpdatedAt,
        });
      }

      const [verifyTokenHash, verifyUpdatedAt] = verify.values;
      const matched =
        row.tokenHash === verifyTokenHash &&
        row.state === "unsubscribed" &&
        row.updatedAt === verifyUpdatedAt;
      return [
        { success: true, results: [], meta: {} },
        { success: true, results: [], meta: {} },
        {
          success: true,
          results: matched ? [{ id: row.id }] : [],
          meta: {},
        },
      ];
    },
  };
}
