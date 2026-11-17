import { reviewTargetOptions } from "./review-targets.ts";

/** Current fixed offer. Existing orders and accepted terms retain their stored snapshots. */
export const reviewPolicy = Object.freeze({
  name: "Smart contract and protocol release security review",
  currency: "usd",
  totalAmountMinor: 750_000,
  depositAmountMinor: 375_000,
  balanceAmountMinor: 375_000,
  orderValidityDays: 30,
  targetNetworks: 1,
  releases: 1,
  affectedComponents: Object.freeze({ min: 1, max: 8 }),
  materiallyChangedLines: Object.freeze({ min: 1, max: 500 }),
  fixReviews: 1,
  evmTargetBusinessDays: 5,
  targetChains: reviewTargetOptions,
} as const);

function usdLabel(amountMinor: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

/** Presentation strings are derived from the same minor-unit amounts used by the server. */
export const reviewPriceLabels = Object.freeze({
  total: usdLabel(reviewPolicy.totalAmountMinor),
  deposit: usdLabel(reviewPolicy.depositAmountMinor),
  balance: usdLabel(reviewPolicy.balanceAmountMinor),
});

export const publicReviewScope = Object.freeze({
  coverage: "Supported EVM and non-EVM ecosystems",
  unit: "One network and one release",
  affectedComponentsLabel:
    "Affected contracts, programs, or modules in the planned release",
  changedLinesLabel:
    "Added or modified protocol code, excluding generated files, comments, and formatting-only changes",
  limitsContext:
    "These are opening order limits. The review method, required materials, and delivery estimate adapt to the selected ecosystem.",
});

export const reviewScopeSummary =
  `One network and one release. The opening order accepts up to ${reviewPolicy.affectedComponents.max} affected contracts, programs, or modules and ${reviewPolicy.materiallyChangedLines.max} materially changed protocol code lines. These are intake ceilings, not a universal measure of security complexity. One fix review is included.`;

export const reviewPaymentSteps = Object.freeze([
  { title: "Submit release details", detail: "One bounded smart contract or protocol release" },
  { title: "Accept the service terms", detail: `${reviewPriceLabels.total} total before payment instructions are shown` },
  { title: "Pay the deposit", detail: `${reviewPriceLabels.deposit} using Ethereum Mainnet USDC or USDT` },
  { title: "Prepare for kickoff", detail: "Submit your transaction hash and Telegram username. Nodezuno checks the payment manually, then confirms what is needed for kickoff." },
]);
