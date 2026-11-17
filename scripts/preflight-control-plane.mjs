import { runtimeConfigurationSnapshot } from "../lib/server/runtime-config.ts";
import { stablecoinPaymentConfiguration } from "../lib/server/stablecoin-payment-config.ts";

const snapshot = runtimeConfigurationSnapshot();
const stablecoinPayments = await stablecoinPaymentConfiguration();
const publicIndexingFlag = process.env.NODEZUNO_PUBLIC_INDEXING;
const legalLaunchApprovalFlag =
  process.env.NODEZUNO_LEGAL_LAUNCH_APPROVED;
const indexingFlagsValid =
  isBooleanFlag(publicIndexingFlag) &&
  isBooleanFlag(legalLaunchApprovalFlag);
const publicIndexingRequested =
  publicIndexingFlag === "true";
const legalLaunchApproved =
  legalLaunchApprovalFlag === "true";
const publicIndexing = {
  requested: publicIndexingRequested,
  legalLaunchApproved,
  effective:
    indexingFlagsValid && publicIndexingRequested && legalLaunchApproved,
  state: !indexingFlagsValid
    ? "invalid"
    : publicIndexingRequested
      ? legalLaunchApproved
        ? "enabled"
        : "blocked"
      : "disabled",
};
const checks = {
  runtime: snapshot.runtime === "container",
  publicOrigin: snapshot.publicOrigin,
  secretIsolation: snapshot.secretIsolation,
  accountAuthentication: snapshot.accountAuthentication,
  administratorAllowlist: snapshot.administratorAllowlist,
  databaseConnection: snapshot.databaseConnection,
  ingressBoundary: snapshot.ingressBoundary,
  accessIdentity: snapshot.accessIdentity,
  rateLimitSecret: snapshot.rateLimitSecret,
  apiKeyPepper: snapshot.apiKeyPepper,
  reviewCapabilitySecret: snapshot.reviewCapabilitySecret,
  indexingFlagsValid,
  legalLaunchBoundary:
    !publicIndexingRequested || legalLaunchApproved,
  stablecoinPayments: stablecoinPayments.ready,
  notificationDelivery: snapshot.notificationDelivery,
  deliverableStorage:
    process.env.NODEZUNO_LOCAL_PREVIEW === "true"
      ? true
      : snapshot.deliverableStorage,
};
const ready = Object.values(checks).every(Boolean);

process.stdout.write(
  `${JSON.stringify({
    service: "nodezuno-web-control-plane",
    runtime: snapshot.runtime,
    ready,
    publicIndexing,
    checks,
  })}\n`,
);

if (!ready) process.exitCode = 1;

function isBooleanFlag(value) {
  return value === "true" || value === "false";
}
