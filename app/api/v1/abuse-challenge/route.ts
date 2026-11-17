import {
  type AbuseChallengePurpose,
  issueAbuseChallenge,
} from "@/lib/server/abuse-challenge";
import {
  apiJson,
  HttpProblem,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";

const purposes = new Set<AbuseChallengePurpose>([
  "submission",
  "newsletter",
]);

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  try {
    if (request.headers.get("sec-fetch-site") === "cross-site") {
      throw new HttpProblem(
        403,
        "cross_origin_request",
        "Cross-site challenge requests are not allowed.",
      );
    }
    const rawPurpose = new URL(request.url).searchParams.get("purpose") ?? "";
    if (!purposes.has(rawPurpose as AbuseChallengePurpose)) {
      throw new HttpProblem(
        400,
        "invalid_challenge_purpose",
        "Choose a supported browser-verification purpose.",
      );
    }
    const challenge = await issueAbuseChallenge(
      request,
      rawPurpose as AbuseChallengePurpose,
    );
    return apiJson(
      {
        data: {
          ...challenge,
          algorithm: "sha-256",
        },
        requestId,
      },
      { requestId, cacheControl: "no-store, max-age=0" },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
