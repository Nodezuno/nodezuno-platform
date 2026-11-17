import { getAuthProviderAvailability } from "@/lib/server/auth";
import {
  apiJson,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  try {
    const providers = await getAuthProviderAvailability();
    return apiJson(
      { data: { providers }, requestId },
      {
        requestId,
        cacheControl: "private, max-age=60",
      },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
