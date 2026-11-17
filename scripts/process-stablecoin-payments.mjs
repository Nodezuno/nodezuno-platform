#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import path from "node:path";
import {
  processPendingStablecoinPaymentClaims,
} from "../lib/server/stablecoin-payment.ts";
import {
  stablecoinPaymentConfiguration,
} from "../lib/server/stablecoin-payment-config.ts";

export async function processStablecoinPaymentsOnce(options = {}) {
  const limit = options.limit ?? 25;
  const configuration = await stablecoinPaymentConfiguration();
  if (configuration.mode === "disabled") {
    return {
      service: "nodezuno-stablecoin-payment-worker",
      enabled: false,
      selected: 0,
      processed: 0,
      verified: 0,
      confirming: 0,
      rejected: 0,
      manualReview: 0,
      failed: 0,
      deferred: 0,
      verifierHealthy: true,
    };
  }
  const result = await processPendingStablecoinPaymentClaims(limit);
  return {
    service: "nodezuno-stablecoin-payment-worker",
    enabled: true,
    selected: result.selected,
    processed: result.processed,
    verified: result.verified,
    confirming: result.confirming,
    rejected: result.rejected,
    manualReview: result.manualReview,
    failed: result.failed,
    deferred: result.deferred,
    verifierHealthy: result.verifierHealthy,
  };
}

async function main() {
  const argumentsList = process.argv.slice(2);
  if (argumentsList.length > 1 || (argumentsList[0] && argumentsList[0] !== "--once")) {
    throw new Error("Usage: process-stablecoin-payments.mjs [--once]");
  }
  const startedAt = performance.now();
  const result = await processStablecoinPaymentsOnce();
  process.stdout.write(`${JSON.stringify({
    timestamp: new Date().toISOString(),
    event: "payment_pass_completed",
    durationMs: Math.round(performance.now() - startedAt),
    ...result,
  })}\n`);
  if (!result.verifierHealthy || result.failed > 0) {
    throw new Error("Payment worker pass was not healthy.");
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      timestamp: new Date().toISOString(),
      event: "payment_worker_failed",
      service: "nodezuno-stablecoin-payment-worker",
      status: "failed",
      error: error instanceof Error ? error.name : "UnknownError",
    })}\n`);
    process.exitCode = 1;
  });
}
