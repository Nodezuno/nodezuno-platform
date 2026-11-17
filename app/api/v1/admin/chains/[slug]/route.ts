import { requireAdminRequest } from "@/lib/server/admin";
import { updateChainStage } from "@/lib/server/database";
import {
  apiJson,
  assertSameOrigin,
  HttpProblem,
  problemResponse,
  readJsonBody,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

const stages = ["planned", "preview", "full", "data_only"] as const;

export async function PATCH(request: Request, context: RouteContext) {
  const requestId = requestIdFor(request);
  try {
    assertSameOrigin(request);
    const admin = await requireAdminRequest(request);
    const { slug } = await context.params;
    if (!/^[a-z0-9-]{2,80}$/.test(slug)) {
      throw new HttpProblem(
        400,
        "invalid_chain_slug",
        "The chain identifier is invalid.",
      );
    }
    const body = await readJsonBody(request);
    const stage =
      body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      "stage" in body &&
      stages.includes((body as { stage: (typeof stages)[number] }).stage)
        ? (body as { stage: (typeof stages)[number] }).stage
        : null;
    if (!stage) {
      return problemResponse({
        status: 422,
        code: "validation_failed",
        title: "Choose a supported chain stage.",
        fields: {
          stage: "Use planned, preview, full, or data_only.",
        },
        requestId,
      });
    }
    const chain = await updateChainStage({
      slug,
      stage,
      actorEmail: admin.email,
    });
    if (!chain) {
      throw new HttpProblem(
        404,
        "chain_not_found",
        "The chain was not found.",
      );
    }
    return apiJson({ data: { chain }, requestId }, { requestId });
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
