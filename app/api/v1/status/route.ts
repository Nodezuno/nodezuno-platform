import { listPublicStatus } from "@/lib/server/database";
import { deriveOverallStatus } from "@/lib/server/status";
import { publicReviewPaymentConfiguration } from "@/lib/server/review-payment-experience";
import {
  apiJson,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  try {
    const [{ services: storedServices, incidents }, payments] = await Promise.all([
      listPublicStatus(),
      publicReviewPaymentConfiguration(),
    ]);
    const generatedAt = new Date();
    const updatedAt = generatedAt.getTime();
    const retiredServiceSlugs = new Set([
      "developer-workspace",
      "rpc-mesh",
      "rpc-ethereum",
      "rpc-base",
      "rpc-solana",
      "grpc-ethereum",
    ]);
    const services = storedServices
      .filter((service) => !retiredServiceSlugs.has(service.slug))
      .map((service) => {
      if (service.slug === "website") {
        return {
            ...service,
            state: "operational" as const,
            description:
              "The public product, documentation, authentication, and buyer journey answered this request.",
            updatedAt,
          };
      }
      if (service.slug === "payment-verification" || service.slug === "payment-checkout") {
        const manualPayment = payments.paymentExperience === "manual_ethereum";
        return {
          ...service,
          slug: manualPayment ? "payment-checkout" : "payment-verification",
          name: manualPayment ? "Manual crypto payment intake" : "Ethereum payment verification",
          state: manualPayment || (payments.paymentExperience === "ethereum_mainnet" && payments.verificationReady)
            ? "operational" as const
            : "preview" as const,
          description: manualPayment
            ? "Customers can submit Ethereum Mainnet USDC or USDT transaction details. Nodezuno checks transfers manually; automatic verification is off."
            : payments.paymentExperience === "ethereum_mainnet" && payments.verificationReady
            ? "Ethereum mainnet USDC and USDT claims are verified by a fresh independent-provider RPC quorum before an order is marked paid."
            : "New payment instructions remain closed until launch approval and the independent Ethereum verifier quorum are both current.",
          updatedAt,
        };
      }
      return service;
      });
    const overall = deriveOverallStatus(services, incidents);

    return apiJson(
      {
        data: {
          overall,
          services,
          incidents,
          generatedAt: generatedAt.toISOString(),
          disclaimer:
            "This endpoint reports current website and intake readiness plus honest product maturity. It is not historical uptime, an engagement SLA, or evidence that a customer review is active.",
        },
        requestId,
      },
      {
        requestId,
        cacheControl:
          "public, max-age=15, s-maxage=30, stale-while-revalidate=60",
      },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
