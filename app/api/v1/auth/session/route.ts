import { accountIdentityFromRequest } from "@/lib/server/account-identity";
import {
  apiJson,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  try {
    const user = await accountIdentityFromRequest(request);
    return apiJson(
      {
        data: {
          user: user
            ? {
                id: user.accountId ?? null,
                displayName: user.displayName,
                contactEmail: user.contactEmail ?? null,
                authMethod: user.authMethod ?? "chatgpt",
                walletAddress: user.walletAddress ?? null,
              }
            : null,
        },
        requestId,
      },
      { requestId },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
