import { publicOpenApiDocument } from "@/lib/public-api";
import { requestIdFor } from "@/lib/server/http";

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  return new Response(JSON.stringify(publicOpenApiDocument, null, 2), {
    headers: {
      "Cache-Control":
        "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Type": "application/json; charset=utf-8",
      "X-Request-Id": requestId,
    },
  });
}
