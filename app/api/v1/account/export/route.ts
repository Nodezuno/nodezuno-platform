import {
  ACCOUNT_DATA_EXPORT_RATE_LIMIT,
  ACCOUNT_DATA_EXPORT_RATE_WINDOW_MS,
  accountDataExportDownloadResponse,
  buildAccountDataExport,
  hardenAccountDataExportResponse,
  requireFreshApplicationAccountSession,
} from "@/lib/server/account-data-export";
import { privateHash } from "@/lib/server/crypto";
import { getDatabase, consumeRateLimit } from "@/lib/server/database";
import {
  assertSameOrigin,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";

export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  try {
    assertSameOrigin(request);
    const database = await getDatabase();
    const now = Date.now();
    const identity = await requireFreshApplicationAccountSession(request, {
      database,
      now,
    });
    const rateLimit = await consumeRateLimit({
      scope: "account-data-export:create:identity",
      subjectHash: await privateHash(
        "account-data-export",
        identity.accountId,
      ),
      limit: ACCOUNT_DATA_EXPORT_RATE_LIMIT,
      windowMs: ACCOUNT_DATA_EXPORT_RATE_WINDOW_MS,
      now,
      database,
    });
    const data = await buildAccountDataExport({
      accountId: identity.accountId,
      currentSessionId: identity.currentSessionId,
      database,
      exportedAt: now,
    });
    return accountDataExportDownloadResponse({
      data,
      requestId,
      rateLimitRemaining: rateLimit.remaining,
    });
  } catch (error) {
    return hardenAccountDataExportResponse(
      responseFromError(error, requestId),
    );
  }
}
