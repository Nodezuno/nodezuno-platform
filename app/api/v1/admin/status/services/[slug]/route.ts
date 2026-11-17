import { requireAdminRequest } from "@/lib/server/admin";
import { updateStatusService } from "@/lib/server/database";
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

const states = [
  "preview",
  "operational",
  "degraded",
  "partial_outage",
  "major_outage",
  "maintenance",
] as const;

export async function PATCH(request: Request, context: RouteContext) {
  const requestId = requestIdFor(request);
  try {
    assertSameOrigin(request);
    const admin = await requireAdminRequest(request);
    const { slug } = await context.params;
    if (!/^[a-z0-9-]{2,80}$/.test(slug)) {
      throw new HttpProblem(
        400,
        "invalid_service_slug",
        "The service identifier is invalid.",
      );
    }
    const body = await readJsonBody(request);
    const record =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const state = states.includes(record.state as (typeof states)[number])
      ? (record.state as (typeof states)[number])
      : null;
    const description =
      typeof record.description === "string"
        ? record.description.trim()
        : undefined;
    const fields: Record<string, string> = {};
    if (!state) fields.state = "Choose a supported service state.";
    if (description !== undefined && (description.length < 10 || description.length > 300)) {
      fields.description = "Use 10 to 300 characters.";
    }
    if (Object.keys(fields).length > 0 || !state) {
      return problemResponse({
        status: 422,
        code: "validation_failed",
        title: "Check the service update.",
        fields,
        requestId,
      });
    }
    const service = await updateStatusService({
      slug,
      state,
      description,
      actorEmail: admin.email,
    });
    if (!service) {
      throw new HttpProblem(
        404,
        "service_not_found",
        "The status service was not found.",
      );
    }
    return apiJson({ data: { service }, requestId }, { requestId });
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
