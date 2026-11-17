import { apiJson, requestIdFor } from "@/lib/server/http";
import { isContainerRuntime } from "@/lib/server/runtime-config";

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  return apiJson(
    {
      data: {
        service: "nodezuno-web-control-plane",
        status: "alive",
        runtime: isContainerRuntime() ? "container" : "sites",
        checkedAt: new Date().toISOString(),
      },
      requestId,
    },
    {
      requestId,
      status: 200,
      cacheControl: "no-store, max-age=0",
    },
  );
}
