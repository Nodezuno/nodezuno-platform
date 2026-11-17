import {
  parseAiDiagnosisWindow,
  readInfrastructureAiDiagnosis,
} from "@/lib/server/ai-infrastructure-diagnostics";
import { consumeRateLimit } from "@/lib/server/database";
import { privateHash } from "@/lib/server/crypto";
import {
  developerActorFromUser,
  developerIdentitySubject,
  isDeveloperResourceId,
  requireDeveloperIdentity,
} from "@/lib/server/developer-platform";
import { rpcProvisioningSnapshots } from "@/lib/server/ethereum-rpc";
import {
  apiJson,
  HttpProblem,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const requestId = requestIdFor(request);
  try {
    const user = await requireDeveloperIdentity(request);
    const { id } = await context.params;
    if (!isDeveloperResourceId(id)) {
      throw new HttpProblem(
        400,
        "invalid_service_id",
        "Use a valid service identifier.",
      );
    }
    const window = parseAiDiagnosisWindow(
      new URL(request.url).searchParams.get("window"),
    );
    await consumeRateLimit({
      scope: "ai-diagnosis:read:identity",
      subjectHash: await privateHash(
        "developer-identity",
        developerIdentitySubject(user),
      ),
      limit: 120,
      windowMs: 60 * 60 * 1000,
    });
    const rpcProvisioning = await rpcProvisioningSnapshots();
    const diagnosis = await readInfrastructureAiDiagnosis({
      actor: developerActorFromUser(user),
      serviceId: id,
      window,
      rpcProvisioning,
    });
    if (!diagnosis) {
      throw new HttpProblem(
        404,
        "service_not_found",
        "The service was not found in this workspace.",
      );
    }
    return apiJson(
      {
        data: { diagnosis },
        requestId,
      },
      {
        requestId,
        headers: { Vary: "Cookie" },
      },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
