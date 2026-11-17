#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedConfig = path.join(repositoryRoot, "dist/server/wrangler.json");
const bootstrapConfig = path.join(repositoryRoot, "dist/server/wrangler.bootstrap.json");
const expectedSecrets = [
  "BETTER_AUTH_SECRET",
  "RATE_LIMIT_SECRET",
  "ZOHO_SMTP_PASSWORD",
  "REVIEW_CAPABILITY_SECRET",
];

function run(command, args, { capture = false, cwd = repositoryRoot } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) {
    throw new Error(`${command} could not start. Ensure the project toolchain is installed.`);
  }
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function fail(message) {
  process.stderr.write(`Cloudflare release blocked: ${message}\n`);
  process.exitCode = 1;
}

function parseJsonConfig(filename) {
  try {
    return JSON.parse(readFileSync(filename, "utf8"));
  } catch {
    throw new Error(`Could not read generated Wrangler JSON at ${path.relative(repositoryRoot, filename)}. Build the Cloudflare application first.`);
  }
}

function assertTargetConfig(config) {
  const productionDomain = config.routes?.some(
    (route) => route.pattern === "nodezuno.com" && route.custom_domain === true,
  );
  const productionD1 = config.d1_databases?.some(
    (database) =>
      database.binding === "DB" &&
      database.database_name === "nodezuno-production" &&
      /^[0-9a-f-]{36}$/i.test(database.database_id ?? ""),
  );
  const privateDeliverables = config.r2_buckets?.some(
    (bucket) =>
      bucket.binding === "DELIVERABLES" &&
      bucket.bucket_name === "nodezuno-deliverables",
  );
  const vars = config.vars ?? {};
  const safeLaunchDefaults =
    vars.NODEZUNO_LOCAL_PREVIEW === "false" &&
    vars.NODEZUNO_PUBLIC_INDEXING === "false" &&
    vars.NODEZUNO_LEGAL_LAUNCH_APPROVED === "false" &&
    vars.NODEZUNO_STABLECOIN_PAYMENT_MODE === "disabled";
  const zohoSmtpHosts = new Set([
    "smtp.zoho.com", "smtp.zoho.eu", "smtp.zoho.in", "smtp.zoho.com.au",
    "smtp.zoho.jp", "smtp.zoho.ca", "smtp.zoho.com.cn", "smtp.zoho.ae",
    "smtp.zoho.sa",
  ]);

  if (
    config.name !== "nodezuno-production" ||
    config.workers_dev !== false ||
    config.preview_urls !== false ||
    !productionDomain ||
    !productionD1 ||
    !privateDeliverables ||
    !safeLaunchDefaults ||
    !zohoSmtpHosts.has(vars.ZOHO_SMTP_HOST)
  ) {
    throw new Error("Generated Wrangler config does not match the reviewed production target or safe launch defaults.");
  }
}

function wrangler(args) {
  return run("pnpm", ["exec", "wrangler", ...args], { capture: true });
}

function readOnlyCloudflarePreflight({ bootstrap = false } = {}) {
  const failures = [];
  const configPath = existsSync(generatedConfig)
    ? generatedConfig
    : path.join(repositoryRoot, "wrangler.jsonc");
  const config = parseJsonConfig(configPath);
  assertTargetConfig(config);

  const identity = wrangler(["whoami"]);
  if (identity.status !== 0) {
    failures.push("Wrangler is not authenticated. Sign in to the Cloudflare account that owns nodezuno.com.");
  }

  const database = config.d1_databases?.find(
    (entry) => entry.binding === "DB",
  );
  const databaseList = wrangler(["d1", "list", "--json", "--config", "wrangler.jsonc"]);
  if (databaseList.status !== 0) {
    failures.push("Could not read Cloudflare D1 databases. Verify account access and the configured production database.");
  } else {
    try {
      const entries = JSON.parse(databaseList.stdout);
      if (!entries.some((entry) => entry.name === database.database_name && entry.uuid === database.database_id)) {
        failures.push("The configured D1 database name or ID does not match the authenticated Cloudflare account.");
      }
    } catch {
      failures.push("Wrangler returned an unreadable D1 inventory; the database identity could not be verified.");
    }
  }

  if (databaseList.status === 0) {
    const migrations = wrangler([
      "d1", "migrations", "list", database.database_name,
      "--remote", "--config", "wrangler.jsonc",
    ]);
    const migrationOutput = `${migrations.stdout}\n${migrations.stderr}`
      .replace(/\u001b\[[0-9;]*m/g, "");
    if (migrations.status !== 0) {
      failures.push("Could not read the remote D1 migration state.");
    } else if (/Migrations to be applied:/i.test(migrationOutput)) {
      const pending = [...migrationOutput.matchAll(/^\s*[│|]\s*(\d{4}_[^\s│|]+\.sql)\s*[│|]\s*$/gm)]
        .map((match) => match[1]);
      failures.push(
        pending.length
          ? `Remote D1 has ${pending.length} pending migration(s), from ${pending[0]} through ${pending.at(-1)}. Back up, review and apply them separately before deployment.`
          : "Remote D1 reports unapplied migrations. Back up, review and apply migrations separately before deployment.",
      );
    }
  }

  const bucket = config.r2_buckets?.find(
    (entry) => entry.binding === "DELIVERABLES",
  );
  const bucketList = wrangler(["r2", "bucket", "list"]);
  if (bucketList.status !== 0) {
    failures.push(`Cloudflare R2 is unavailable for this account. Enable R2 and create the private ${bucket.bucket_name} bucket before deployment.`);
  } else if (!new RegExp(`(^|[^A-Za-z0-9_-])${escapeRegExp(bucket.bucket_name)}([^A-Za-z0-9_-]|$)`, "m").test(bucketList.stdout)) {
    failures.push(`The configured private R2 bucket ${bucket.bucket_name} does not exist in the authenticated account.`);
  }

  if (!bootstrap) {
    const secretList = wrangler([
      "secret", "list", "--name", config.name,
      "--config", "wrangler.jsonc", "--format", "json",
    ]);
    if (secretList.status !== 0) {
      failures.push("The production Worker does not exist yet. Bootstrap it without a public route, configure its secrets, then run the production preflight again.");
    } else {
      try {
        const names = new Set(JSON.parse(secretList.stdout).map((entry) => entry.name));
        const missing = expectedSecrets.filter((name) => !names.has(name));
        if (missing.length) failures.push(`Production Worker secrets are missing: ${missing.join(", ")}.`);
      } catch {
        failures.push("Could not verify production Worker secret names.");
      }
    }
  }

  return failures;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function runLocalReleaseChecks() {
  const checks = [
    ["pnpm", ["run", "release:source:verify"]],
    ["pnpm", ["run", "lint"]],
    ["pnpm", ["exec", "tsc", "--noEmit", "--incremental", "false"]],
    ["pnpm", ["run", "build:cloudflare"]],
    ["pnpm", ["run", "verify:cloudflare-artifact"]],
    ["pnpm", ["exec", "wrangler", "deploy", "--dry-run", "--config", "dist/server/wrangler.json"]],
  ];
  for (const [command, args] of checks) {
    process.stdout.write(`\n> ${command} ${args.join(" ")}\n`);
    if (run(command, args).status !== 0) {
      throw new Error("A local release check failed. No Cloudflare deployment was made.");
    }
  }
}

function requireFlag(flag, message) {
  if (!process.argv.includes(flag)) throw new Error(message);
}

function deploy(config = generatedConfig) {
  const result = run("pnpm", [
    "exec", "wrangler", "deploy", "--config", path.relative(repositoryRoot, config), "--strict",
  ]);
  if (result.status !== 0) throw new Error("Wrangler deployment failed. Check the Cloudflare dashboard before retrying.");
}

function dryRun(config = generatedConfig) {
  const result = run("pnpm", [
    "exec", "wrangler", "deploy", "--dry-run", "--config", path.relative(repositoryRoot, config),
  ]);
  if (result.status !== 0) throw new Error("Wrangler rejected the deployment config. No Cloudflare deployment was made.");
}

function withBootstrapConfig(operation) {
  const config = parseJsonConfig(generatedConfig);
  config.routes = [];
  delete config.triggers;
  config.workers_dev = false;
  config.preview_urls = false;
  writeFileSync(bootstrapConfig, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  try {
    return operation(bootstrapConfig);
  } finally {
    try { unlinkSync(bootstrapConfig); } catch {}
  }
}

function validateBootstrapConfig() {
  if (!existsSync(generatedConfig)) return;
  withBootstrapConfig((config) => {
    process.stdout.write("Validating the isolated bootstrap Worker config with Wrangler.\n");
    dryRun(config);
  });
}

async function main() {
  const action = process.argv[2] ?? "deploy";
  if (!["preflight", "bootstrap", "deploy"].includes(action)) {
    throw new Error("Usage: pnpm run preflight:cloudflare | pnpm run bootstrap:cloudflare -- --confirm-bootstrap | pnpm run deploy:cloudflare -- --confirm-production --acknowledge-dashboard-config");
  }

  if (action === "preflight") {
    const failures = [];
    try {
      validateBootstrapConfig();
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "Bootstrap Wrangler dry-run failed.");
    }
    failures.push(...readOnlyCloudflarePreflight());
    if (failures.length) {
      process.stderr.write("Cloudflare production preflight: BLOCKED\n");
      for (const failure of failures) process.stderr.write(`- ${failure}\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write("Cloudflare production preflight: account resources and required secret names are present. Verify dashboard variables and release evidence before deployment.\n");
    }
    return;
  }

  if (action === "bootstrap") {
    requireFlag("--confirm-bootstrap", "Bootstrap deploy creates the Worker script without its production domain route. Pass --confirm-bootstrap only after reviewing the release guide.");
  } else {
    requireFlag("--confirm-production", "This publishes code to the production Worker. Pass --confirm-production only after reviewing the release and rollback plan.");
    requireFlag("--acknowledge-dashboard-config", "Confirm the Worker has the documented admin, email, canonical-origin, webhook and privacy configuration, and that CI is green, by passing --acknowledge-dashboard-config.");
  }

  runLocalReleaseChecks();
  const failures = readOnlyCloudflarePreflight({ bootstrap: action === "bootstrap" });
  if (failures.length) {
    process.stderr.write("Cloudflare production preflight: BLOCKED\n");
    for (const failure of failures) process.stderr.write(`- ${failure}\n`);
    throw new Error("Resolve the listed Cloudflare account prerequisites. No production Worker deployment was made.");
  }

  if (action === "bootstrap") {
    withBootstrapConfig((config) => {
      process.stdout.write("Checking the no-route bootstrap configuration with Wrangler.\n");
      dryRun(config);
      process.stdout.write("Creating the Worker without a public route or scheduled jobs so secrets can be configured safely.\n");
      deploy(config);
    });
    process.stdout.write("Bootstrap complete. Add the required secrets and dashboard variables, then run pnpm run preflight:cloudflare before production deployment.\n");
    return;
  }

  deploy();
  process.stdout.write("Production Worker deployment completed. Verify /api/v1/live and /api/v1/ready, authentication, email delivery, private R2 access, and the Cloudflare deployment version before enabling any paid service.\n");
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : "Unexpected Cloudflare release failure.");
});
