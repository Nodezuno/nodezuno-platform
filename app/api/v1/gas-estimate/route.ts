import { calculateGasEstimate } from "@/lib/server/contracts";
import {
  apiJson,
  assertSameOrigin,
  problemResponse,
  readJsonBody,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";

export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  try {
    assertSameOrigin(request);
    const result = calculateGasEstimate(await readJsonBody(request));
    if (!result.ok) {
      return problemResponse({
        status: 422,
        code: "validation_failed",
        title: "Check the calculator inputs.",
        fields: result.fields,
        requestId,
      });
    }
    return apiJson(
      { data: result.value, requestId },
      { requestId, status: 200 },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
