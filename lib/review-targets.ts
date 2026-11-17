export const reviewTargetOptions = [
  "Ethereum",
  "Base",
  "Arbitrum",
  "Optimism",
  "Polygon",
  "Avalanche",
  "BNB Chain",
  "Other EVM network",
  "Solana",
  "Other SVM network",
  "Cosmos SDK chain",
  "CosmWasm chain",
  "Sui",
  "Aptos",
  "Polkadot / Substrate chain",
  "Starknet",
  "Bitcoin / UTXO ecosystem",
  "Other non-EVM network",
] as const;

const fixedPriceReviewTargets = new Set<string>(reviewTargetOptions);

export function isFixedPriceReviewTarget(targetChain: string): boolean {
  return fixedPriceReviewTargets.has(targetChain);
}
