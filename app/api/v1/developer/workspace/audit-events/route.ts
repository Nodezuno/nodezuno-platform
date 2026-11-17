import {
  consumeRateLimit,
  listDeveloperAuditEvents,
} from "@/lib/server/database";
import { privateHash } from "@/lib/server/crypto";
import {
  parseDeveloperAuditCursor,
  parseDeveloperAuditLimit,
  serializeDeveloperAuditEvent,
} from "@/lib/server/developer-audit";
import {
  developerActorFromUser,
  developerIdentitySubject,
  requireDeveloperIdentity,
} from "@/lib/server/developer-platform";
import {
  apiJson,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  try {
    const user = await requireDeveloperIdentity(request);
    const searchParams = new URL(request.url).searchParams;
    const limit = parseDeveloperAuditLimit(searchParams.get("limit"));
    const cursor = parseDeveloperAuditCursor(
      searchParams.get("cursor"),
    );
    await consumeRateLimit({
      scope: "developer-audit:read:identity",
      subjectHash: await privateHash(
        "developer-identity",
        developerIdentitySubject(user),
      ),
      limit: 300,
      windowMs: 60 * 60 * 1000,
    });
    const page = await listDeveloperAuditEvents({
      actor: developerActorFromUser(user),
      limit,
      cursor,
    });
    return apiJson(
      {
        data: {
          events: page.events.map(serializeDeveloperAuditEvent),
          nextCursor: page.nextCursor,
        },
        requestId,
      },
      {
        requestId,
        headers: { Vary: "Cookie" },
      },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
