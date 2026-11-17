#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { forbiddenSourceReason } from "./source-policy.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

const requiredReleaseFiles = [
  ".github/workflows/public-site-release-check.yml",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "Dockerfile",
  "app/community/newsletter/confirm/page.tsx",
  "app/review/[id]/page.tsx",
  "app/review/start/page.tsx",
  "app/api/v1/admin/review-orders/route.ts",
  "app/api/v1/admin/review-orders/[id]/route.ts",
  "app/api/v1/admin/review-orders/[id]/deliverables/route.ts",
  "app/api/v1/admin/review-orders/[id]/deliverables/[deliverableId]/finalize/route.ts",
  "app/api/v1/admin/review-orders/[id]/payment-reconciliations/[claimId]/route.ts",
  "app/api/v1/newsletter/confirm/route.ts",
  "app/api/v1/review-orders/route.ts",
  "app/api/v1/review-orders/[id]/route.ts",
  "app/api/v1/review-orders/[id]/access/route.ts",
  "app/api/v1/review-orders/[id]/deliverables/[deliverableId]/download/route.ts",
  "app/api/v1/review-orders/[id]/payment-confirmations/[confirmationId]/route.ts",
  "app/api/v1/review-orders/[id]/payment-intents/route.ts",
  "app/api/v1/review-orders/[id]/payment-intents/[intentId]/claims/route.ts",
  "components/admin-review-orders.tsx",
  "components/review-order-experience.tsx",
  "components/review-start-experience.tsx",
  "lib/public-navigation.ts",
  "lib/review-targets.ts",
  "lib/review-policy.ts",
  "lib/client/review-order-request.ts",
  "lib/server/reviews/input.ts",
  "lib/api/shared.ts",
  "lib/server/notification-outbox.ts",
  "lib/server/zoho-email.ts",
  "lib/server/zoho-smtp-cloudflare.ts",
  "lib/server/zoho-smtp-node.ts",
  "lib/server/zoho-smtp-protocol.ts",
  "lib/server/review-commerce.ts",
  "lib/server/review-deliverables.ts",
  "lib/server/review-payment-experience.ts",
  "lib/server/service-agreement.ts",
  "lib/server/stablecoin-payment-config.ts",
  "lib/server/stablecoin-payment-health.ts",
  "lib/server/stablecoin-payment-records.ts",
  "lib/server/stablecoin-payment-store.ts",
  "lib/server/stablecoin-payment.ts",
  "drizzle/0015_upgrade_assurance_commerce.sql",
  "drizzle/0016_newsletter_double_opt_in.sql",
  "drizzle/0017_notification_delivery_state.sql",
  "drizzle/0018_resend_webhook_events.sql",
  "drizzle/0019_ethereum_stablecoin_payments.sql",
  "drizzle/0020_payment_operational_guards.sql",
  "drizzle/0021_review_lifecycle_notifications.sql",
  "drizzle/0022_review_delivery.sql",
  "drizzle/0023_stablecoin_reconciliation.sql",
  "drizzle/0024_remove_legacy_provider_payments.sql",
  "drizzle/0025_review_language.sql",
  "drizzle/0026_direct_checkout.sql",
  "drizzle/0027_direct_checkout_scope_correction.sql",
  "drizzle/0028_zoho_email_delivery.sql",
  "scripts/block-drizzle-generation.mjs",
  "scripts/check-external-links.mjs",
  "scripts/check-public-links.mjs",
  "scripts/external-link-ignores.json",
  "scripts/preflight-deployment-topology.mjs",
  "scripts/preflight-review-application.mjs",
  "scripts/preflight-stablecoin-payments.mjs",
  "scripts/process-notification-outbox.mjs",
  "scripts/process-stablecoin-payments.mjs",
  "scripts/run-node-tests.mjs",
  "scripts/start-single-container.mjs",
  "scripts/verify-source-integrity.mjs",
  "scripts/source-policy.mjs",
  "scripts/export-source.mjs",
  "deploy/aws/Caddy.ec2.conf",
  "deploy/aws/compose.ec2.yaml",
  "deploy/aws/scripts/nodezuno-backup.sh",
  "deploy/aws/scripts/nodezuno-activate-release.sh",
  "deploy/aws/scripts/nodezuno-container-firewall.sh",
  "deploy/aws/scripts/nodezuno-deploy.sh",
  "deploy/aws/scripts/nodezuno-host-metrics.sh",
  "deploy/aws/scripts/upload-production-environment.sh",
  "deploy/aws/terraform/bootstrap/compute.tf",
  "deploy/aws/terraform/bootstrap/templates/stage-host-bundle.sh.tftpl",
  "deploy/aws/terraform/bootstrap/templates/user-data.sh.tftpl",
  "deploy/kubernetes/payment-worker.cronjob.example.yaml",
  "deploy/local-mac/com.nodezuno.email-worker.plist.template",
  "deploy/local-mac/com.nodezuno.payment-worker.plist.template",
  "deploy/local-mac/run-email-worker.sh",
  "deploy/local-mac/run-payment-worker.sh",
  "docs/AWS_DEPLOYMENT.md",
  "docs/DEEP_RESEARCH_REMEDIATION.md",
  "docs/DISASTER_RECOVERY.md",
  "docs/ETHEREUM_STABLECOIN_PAYMENTS.md",
  "docs/MIGRATIONS.md",
  "docs/OPERATIONS.md",
  "docs/PRODUCTION_RELEASE_EVIDENCE.md",
  "docs/README.md",
  "docs/product/SCOPE_AND_PRICING.md",
  "docs/api/README.md",
  "docs/payments/STATE_MACHINE.md",
  "docs/PRODUCTION_IMPROVEMENTS.md",
  "docs/RELEASE.md",
  "docs/UPGRADE_ASSURANCE_COMMERCE.md",
  "tests/notification-outbox-worker.test.mjs",
  "tests/newsletter-double-opt-in.test.mjs",
  "tests/production-single-host-guard.test.mjs",
  "tests/public-navigation.test.mjs",
  "tests/review-commerce-security.test.mjs",
  "tests/review-deliverables-security.test.mjs",
  "tests/stablecoin-payment-security.test.mjs",
];

function trackedFiles() {
  try {
    const output = execFileSync("git", ["ls-files", "-z"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return output.split("\0").filter(Boolean);
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Git could not enumerate release source: ${error.message}`
        : "Git could not enumerate release source.",
    );
  }
}

function workingTreeChangeCount() {
  try {
    const output = execFileSync(
      "git",
      ["status", "--porcelain=v1", "--untracked-files=all"],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    return output.split(/\r?\n/).filter(Boolean).length;
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Git could not inspect release changes: ${error.message}`
        : "Git could not inspect release changes.",
    );
  }
}

function verifyActionPins(files, failures) {
  for (const file of files.filter((candidate) => candidate.startsWith(".github/workflows/") && /\.ya?ml$/.test(candidate))) {
    const contents = readFileSync(path.join(repositoryRoot, file), "utf8");
    for (const [index, line] of contents.split(/\r?\n/).entries()) {
      if (!/^\s*(?:-\s*)?uses:/.test(line)) continue;
      const match = line.match(/^\s*(?:-\s*)?uses:\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))\s*(?:#.*)?$/);
      if (!match) {
        failures.push(`${file}:${index + 1} has an unparseable action reference`);
        continue;
      }
      const action = match[1] ?? match[2] ?? match[3];
      if (action.startsWith("./")) continue;
      const separator = action.lastIndexOf("@");
      const reference = separator === -1 ? "" : action.slice(separator + 1);
      if (!/^[0-9a-f]{40}$/.test(reference)) {
        failures.push(`${file}:${index + 1} uses a mutable action reference (${action})`);
      }
    }
  }
}

function verifyDockerBasePins(files, failures) {
  const dockerfiles = files.filter(
    (candidate) => candidate === "Dockerfile" || candidate.endsWith("/Dockerfile"),
  );

  for (const file of dockerfiles) {
    const contents = readFileSync(path.join(repositoryRoot, file), "utf8");
    const stages = new Set();

    const syntaxReference = contents.match(/^#\s*syntax=([^\s]+)\s*$/m)?.[1];
    if (
      syntaxReference &&
      !/@sha256:[0-9a-f]{64}$/.test(syntaxReference)
    ) {
      failures.push(
        `${file}:1 uses a mutable Dockerfile frontend (${syntaxReference})`,
      );
    }

    for (const [index, line] of contents.split(/\r?\n/).entries()) {
      const match = line.match(
        /^\s*FROM\s+(?:--platform=\S+\s+)?([^\s]+)(?:\s+AS\s+([A-Za-z0-9._-]+))?\s*$/i,
      );
      if (!match) continue;

      const base = match[1];
      if (
        base !== "scratch" &&
        !stages.has(base) &&
        !/@sha256:[0-9a-f]{64}$/.test(base)
      ) {
        failures.push(
          `${file}:${index + 1} uses a mutable container base (${base})`,
        );
      }

      if (match[2]) stages.add(match[2]);
    }
  }
}

function run() {
  const files = trackedFiles();
  const tracked = new Set(files);
  const failures = [];
  const changeCount = workingTreeChangeCount();
  if (changeCount > 0) {
    failures.push(
      `working tree contains ${changeCount} uncommitted path change(s); release only from a reviewed commit`,
    );
  }

  for (const file of files) {
    const reason = forbiddenSourceReason(file);
    if (reason) failures.push(`${file} contains ${reason}`);
    const pathname = path.join(repositoryRoot, file);
    try {
      if (!lstatSync(pathname).isFile()) {
        failures.push(`${file} must be a regular source file, not a symlink or submodule`);
      }
    } catch {
      failures.push(`${file} is missing or unreadable`);
    }
  }

  for (const file of requiredReleaseFiles) {
    const pathname = path.join(repositoryRoot, file);
    if (!existsSync(pathname)) {
      failures.push(`${file} is required for the production release`);
    } else if (!lstatSync(pathname).isFile()) {
      failures.push(`${file} must be a regular release-source file`);
    } else if (!tracked.has(file)) {
      failures.push(`${file} exists locally but is not tracked in the release source`);
    }
  }

  verifyActionPins(files, failures);
  verifyDockerBasePins(files, failures);

  if (failures.length > 0) {
    console.error("Release source integrity failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Release source integrity passed for ${files.length} tracked files.`);
}

run();
