import {
  checkDatabase,
  checkRuntimeConfiguration,
} from "@/lib/server/database";
import { apiJson, requestIdFor } from "@/lib/server/http";

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  const [databaseResult, configurationResult] = await Promise.allSettled([
    checkDatabase(),
    checkRuntimeConfiguration(),
  ]);
  const database =
    databaseResult.status === "fulfilled" && databaseResult.value;
  const configuration =
    configurationResult.status === "fulfilled" && configurationResult.value;
  const ready = database && configuration;
  if (!ready) {
    console.error(JSON.stringify({
      level: "error",
      event: "readiness_failed",
      requestId,
      checks: {
        database,
        configuration,
      },
      failures: {
        database: databaseResult.status === "rejected"
          ? errorName(databaseResult.reason)
          : null,
        configuration: configurationResult.status === "rejected"
          ? errorName(configurationResult.reason)
          : null,
      },
    }));
  }

  return apiJson(
    {
      data: {
        service: "nodezuno-web-control-plane",
        status: ready ? "ready" : "not_ready",
        checkedAt: new Date().toISOString(),
      },
      requestId,
    },
    {
      requestId,
      status: ready ? 200 : 503,
      cacheControl: "no-store, max-age=0",
    },
  );
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}
