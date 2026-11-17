import {
  MINIMUM_PAYMENT_RPC_ENDPOINTS,
  stablecoinPaymentConfiguration,
} from "./stablecoin-payment-config.ts";
import { stablecoinPaymentVerifierIsReady } from "./stablecoin-payment-health.ts";

export type ReviewPaymentExperience =
  | "manual_ethereum"
  | "ethereum_mainnet"
  | "unavailable";

export type PublicReviewPaymentConfiguration = {
  paymentExperience: ReviewPaymentExperience;
  verificationReady: boolean;
  confirmationsRequired: number;
};

export async function publicReviewPaymentConfiguration(
): Promise<PublicReviewPaymentConfiguration> {
  const stablecoin = await stablecoinPaymentConfiguration();

  if (stablecoin.mode === "manual_ethereum" && stablecoin.ready) {
    return {
      paymentExperience: "manual_ethereum",
      verificationReady: false,
      confirmationsRequired: stablecoin.confirmationsRequired,
    };
  }

  const ethereumReady =
    stablecoin.mode === "ethereum_mainnet" &&
    stablecoin.ready &&
    stablecoin.endpoints.length >= MINIMUM_PAYMENT_RPC_ENDPOINTS &&
    await stablecoinPaymentVerifierIsReady(stablecoin);
  if (ethereumReady) {
    return {
      paymentExperience: "ethereum_mainnet",
      verificationReady: true,
      confirmationsRequired: stablecoin.confirmationsRequired,
    };
  }

  return {
    paymentExperience: "unavailable",
    verificationReady: false,
    confirmationsRequired: stablecoin.confirmationsRequired,
  };
}
