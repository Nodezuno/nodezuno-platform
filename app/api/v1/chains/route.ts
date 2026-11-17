import { listPublicChains } from "@/lib/server/database";
import {
  apiJson,
  HttpProblem,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  try {
    const url = new URL(request.url);
    const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const family = (url.searchParams.get("family") ?? "").trim();
    if (query.length > 100 || family.length > 40) {
      throw new HttpProblem(
        400,
        "invalid_filter",
        "The chain filter is too long.",
      );
    }

    const chains = (await listPublicChains()).filter(
      (chain) =>
        (!query ||
          chain.name.toLowerCase().includes(query) ||
          chain.slug.includes(query)) &&
        (!family || family === "All" || chain.family === family),
    );
    return apiJson(
      {
        data: {
          chains,
          count: chains.length,
          generatedAt: new Date().toISOString(),
          disclaimer:
            "Catalog stages describe Nodezuno's current product plan. They are not claims of live endpoint availability.",
        },
        requestId,
      },
      {
        requestId,
        cacheControl:
          "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
      },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
