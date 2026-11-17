import { createNodezunoAuth } from "@/lib/server/auth";
import { requestIdFor, responseFromError } from "@/lib/server/http";

export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  const requestId = requestIdFor(request);
  try {
    const auth = await createNodezunoAuth(request);
    return await auth.handler(request);
  } catch (error) {
    return responseFromError(error, requestId);
  }
}

export const GET = handle;
export const POST = handle;
