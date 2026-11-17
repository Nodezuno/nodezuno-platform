import { requireAdminRequest } from "@/lib/server/admin";
import { updateSubmissionStatus } from "@/lib/server/database";
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
  params: Promise<{ id: string }>;
};

const statuses = ["received", "reviewing", "closed", "spam"] as const;

export async function PATCH(request: Request, context: RouteContext) {
  const requestId = requestIdFor(request);
  try {
    assertSameOrigin(request);
    const admin = await requireAdminRequest(request);
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      throw new HttpProblem(
        400,
        "invalid_submission_id",
        "The submission identifier is invalid.",
      );
    }
    const body = await readJsonBody(request);
    const status =
      body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      "status" in body &&
      statuses.includes(
        (body as { status: (typeof statuses)[number] }).status,
      )
        ? (body as { status: (typeof statuses)[number] }).status
        : null;
    if (!status) {
      return problemResponse({
        status: 422,
        code: "validation_failed",
        title: "Choose a supported submission status.",
        fields: { status: "Use received, reviewing, closed, or spam." },
        requestId,
      });
    }

    const submission = await updateSubmissionStatus({
      id,
      status,
      actorEmail: admin.email,
    });
    if (!submission) {
      throw new HttpProblem(
        404,
        "submission_not_found",
        "The submission was not found.",
      );
    }
    return apiJson(
      { data: { submission }, requestId },
      { requestId, status: 200 },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
