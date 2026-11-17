import {
  findSubmissionByIdempotency,
  consumeRateLimit,
  persistSubmission,
} from "@/lib/server/database";
import { validateSubmissionPayload } from "@/lib/server/contracts";
import {
  privateHash,
  requestFingerprint,
  sha256Hex,
  stableStringify,
} from "@/lib/server/crypto";
import {
  apiJson,
  assertSameOrigin,
  problemResponse,
  readIdempotencyKey,
  readJsonBody,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";
import { verifyAbuseChallenge } from "@/lib/server/abuse-challenge";
import { accountIdentityFromRequest } from "@/lib/server/account-identity";

export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  try {
    assertSameOrigin(request);
    const idempotencyKey = readIdempotencyKey(request);
    await verifyAbuseChallenge(request, "submission");
    const validation = validateSubmissionPayload(await readJsonBody(request));
    if (!validation.ok) {
      return problemResponse({
        status: 422,
        code: "validation_failed",
        title: "Check the highlighted fields.",
        fields: validation.fields,
        requestId,
      });
    }
    const input = validation.value;

    if (input.website) {
      return apiJson(
        {
          data: {
            id: crypto.randomUUID(),
            status: "received",
            createdAt: new Date().toISOString(),
          },
          requestId,
        },
        { requestId, status: 202 },
      );
    }
    const requestHash = await sha256Hex(
      stableStringify({
        kind: input.kind,
        name: input.name,
        email: input.email,
        company: input.company,
        team: input.team,
        message: input.message,
        sourcePath: input.sourcePath,
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
      }),
    );
    const [fingerprint, emailHash] = await Promise.all([
      requestFingerprint(request),
      privateHash("email", input.email),
    ]);
    const strictSecurityLimit = input.kind === "security_contact";

    // A replay is intentionally cheap for the client, but it must not be free
    // for an attacker. This request-level counter is consumed before the
    // idempotency lookup, so exact replays and conflicts are both bounded.
    await consumeRateLimit({
      scope: `submission:${input.kind}:request:ip`,
      subjectHash: fingerprint.ipHash,
      limit: strictSecurityLimit ? 12 : 40,
      windowMs: strictSecurityLimit ? 60 * 60 * 1000 : 10 * 60 * 1000,
    });

    const existing = await findSubmissionByIdempotency(
      input.kind,
      idempotencyKey,
    );
    if (existing) {
      if (existing.requestHash !== requestHash) {
        return problemResponse({
          status: 409,
          code: "idempotency_conflict",
          title:
            "This submission key was already used for a different request.",
          requestId,
        });
      }
      return apiJson(
        {
          data: {
            id: existing.id,
            status: existing.status,
            createdAt: new Date(existing.createdAt).toISOString(),
          },
          replayed: true,
          requestId,
        },
        { requestId, status: 200 },
      );
    }

    await Promise.all([
      consumeRateLimit({
        scope: `submission:${input.kind}:ip`,
        subjectHash: fingerprint.ipHash,
        limit: strictSecurityLimit ? 2 : 5,
        windowMs: strictSecurityLimit ? 60 * 60 * 1000 : 10 * 60 * 1000,
      }),
      consumeRateLimit({
        scope: `submission:${input.kind}:email`,
        subjectHash: emailHash,
        limit: strictSecurityLimit ? 5 : 20,
        windowMs: 24 * 60 * 60 * 1000,
      }),
    ]);

    const user = await accountIdentityFromRequest(request);
    const result = await persistSubmission({
      input,
      idempotencyKey,
      requestHash,
      ipHash: fingerprint.ipHash,
      userAgentHash: fingerprint.userAgentHash,
      emailHash,
      submittedByAccountId: user?.accountId ?? null,
      submittedByEmail: user?.contactEmail ?? null,
    });

    console.log(
      JSON.stringify({
        level: "info",
        event: "submission_received",
        requestId,
        kind: result.record.kind,
        replayed: result.replayed,
      }),
    );
    return apiJson(
      {
        data: {
          id: result.record.id,
          status: result.record.status,
          createdAt: new Date(result.record.createdAt).toISOString(),
        },
        replayed: result.replayed,
        requestId,
      },
      { requestId, status: result.replayed ? 200 : 201 },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
