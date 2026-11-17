import {
  checkDatabase,
  checkRuntimeConfiguration,
} from "@/lib/server/database";
import {
  apiJson,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  try {
    const [database, configuration] = await Promise.all([
      checkDatabase(),
      checkRuntimeConfiguration(),
    ]);
    const healthy = database && configuration;
    return apiJson(
      {
        data: {
          service: "nodezuno-release-review",
          status: healthy ? "healthy" : "unavailable",
          database,
          configuration,
          checkedAt: new Date().toISOString(),
          scope:
            "Website and release-review application readiness only. This endpoint does not report blockchain network health or customer infrastructure availability.",
        },
        requestId,
      },
      {
        requestId,
        status: healthy ? 200 : 503,
        cacheControl: "no-store, max-age=0",
      },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
