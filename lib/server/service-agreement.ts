import { sha256Hex } from "./crypto.ts";

export const SERVICE_TERMS_VERSION = "nodezuno-service-terms-2026-11-16" as const;

export const SERVICE_TERMS_ACCEPTANCE_TEXT = [
  "The buyer accepts the exact fixed service order version generated from the details submitted in the private Nodezuno portal.",
  "The engagement is a fixed-scope upgrade assurance review performed by Sanjay Sudagani, sole proprietor trading as Nodezuno.",
  "The scheduling deposit and final balance are each USD 3,750, settled using the exact server-issued USDC or USDT amount on Ethereum mainnet.",
  "A submitted transaction hash is not proof of payment. In the current Cloudflare deployment, Sanjay manually checks the official token, successful Ethereum Mainnet transaction, recipient, and exact amount before recording payment. Automatic payment verification is off.",
  "Work starts after Sanjay records the scheduling deposit, the customer provides every required review artifact through the approved secure channel, the submitted scope is confirmed, and reviewer availability is agreed.",
  "Custody, deployment, incident response, a new protocol audit, and work outside the frozen service order scope are excluded unless added in writing.",
  "Refunds, corrections, tax documents, and exceptional payment reconciliation require a written operational record.",
].join("\n");

export function serviceTermsHash(): Promise<string> {
  return sha256Hex(SERVICE_TERMS_ACCEPTANCE_TEXT);
}
