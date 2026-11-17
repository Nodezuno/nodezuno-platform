import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repositoryRoot = new URL("../", import.meta.url);

async function source(pathname) {
  return readFile(new URL(pathname, repositoryRoot), "utf8");
}

test("production image uses the locked workspace policy and a non-root runtime", async () => {
  const dockerfile = await source("Dockerfile");

  assert.match(
    dockerfile,
    /FROM node:24\.14\.0-bookworm-slim@sha256:[0-9a-f]{64} AS dependencies[\s\S]*RUN npm install --global pnpm@11\.9\.0/,
  );
  assert.match(dockerfile, /FROM dependencies AS builder/);
  assert.doesNotMatch(
    dockerfile,
    /COPY --from=dependencies \/app\/node_modules/,
  );
  assert.match(
    dockerfile,
    /COPY package\.json pnpm-lock\.yaml pnpm-workspace\.yaml \.\//,
  );
  assert.match(dockerfile, /pnpm install --frozen-lockfile/);
  assert.match(dockerfile, /USER nextjs/);
  assert.match(
    dockerfile,
    /\/api\/v1\/live/,
  );
  assert.match(
    dockerfile,
    /scripts\/preflight-control-plane\.mjs/,
  );
  assert.match(dockerfile, /scripts\/migrate-container\.mjs/);
  assert.match(dockerfile, /scripts\/migrate-sqlite\.mjs/);
  assert.match(dockerfile, /scripts\/backup-sqlite\.mjs/);
  assert.match(dockerfile, /scripts\/restore-sqlite\.mjs/);
  assert.match(dockerfile, /scripts\/process-notification-outbox\.mjs/);
  assert.match(dockerfile, /scripts\/process-stablecoin-payments\.mjs/);
  assert.match(dockerfile, /scripts\/preflight-stablecoin-payments\.mjs/);
  assert.match(dockerfile, /scripts\/start-single-container\.mjs/);
  assert.match(dockerfile, /\/var\/lib\/nodezuno/);
  assert.match(dockerfile, /chown nextjs:nodejs/);
  assert.match(dockerfile, /lib\/server\/runtime-config\.ts/);
  assert.doesNotMatch(dockerfile, /^\s*COPY\s+\.env(?:\s|$)/m);
});

test("Cloudflare bindings have one authoritative configuration source", async () => {
  const [wranglerSource, vite, packageSource, artifactVerifier, continuousIntegration] = await Promise.all([
    source("wrangler.jsonc"),
    source("vite.config.ts"),
    source("package.json"),
    source("scripts/verify-cloudflare-artifact.mjs"),
    source(".github/workflows/ci.yml"),
  ]);
  const wrangler = JSON.parse(wranglerSource);
  const d1Bindings = (wrangler.d1_databases ?? []).map(
    (binding) => binding.binding,
  );
  const r2Bindings = (wrangler.r2_buckets ?? []).map(
    (binding) => binding.binding,
  );

  assert.deepEqual(d1Bindings, ["DB"]);
  assert.deepEqual(r2Bindings, ["DELIVERABLES"]);
  assert.equal(wrangler.workers_dev, false);
  assert.equal(wrangler.preview_urls, false);
  assert.deepEqual(wrangler.routes, [
    { pattern: "nodezuno.com", custom_domain: true },
  ]);
  assert.equal(wrangler.observability.enabled, true);
  assert.equal(wrangler.observability.redact_query_string, true);
  assert.equal(wrangler.observability.logs.invocation_logs, false);
  assert.equal(wrangler.observability.logs.head_sampling_rate, 0.1);
  assert.equal(wrangler.observability.traces.enabled, false);
  assert.equal(wrangler.vars.NODEZUNO_LEGAL_LAUNCH_APPROVED, "false");
  assert.equal(wrangler.vars.NODEZUNO_STABLECOIN_PAYMENT_MODE, "disabled");
  assert.match(vite, /command === "build" \? \{ secrets: \{ required: \[\] \} \}/);
  assert.match(artifactVerifier, /local environment files are present in build output/);
  assert.match(artifactVerifier, /artifact\.includes\(secret\.value\)/);
  assert.equal(JSON.parse(packageSource).scripts["verify:cloudflare-artifact"],
    "node scripts/verify-cloudflare-artifact.mjs");
  assert.doesNotMatch(vite, /\b(?:d1_databases|r2_buckets|compatibility_flags)\s*:/);
  assert.match(continuousIntegration, /verify:cloudflare-artifact/);
  assert.match(
    continuousIntegration,
    /wrangler deploy --dry-run --config dist\/server\/wrangler\.json/,
  );
});

test("native build permissions stay version scoped and match the lockfile", async () => {
  const workspace = await source("pnpm-workspace.yaml");
  const lockfile = await source("pnpm-lock.yaml");
  const approvedWorkerdVersions = [
    ...workspace.matchAll(/^\s{2}"workerd@([^"]+)": true$/gm),
  ].map((match) => match[1]);
  const lockedWorkerdVersions = [
    ...new Set(
      [...lockfile.matchAll(/^  workerd@([^:]+):$/gm)].map(
        (match) => match[1],
      ),
    ),
  ];

  assert.doesNotMatch(workspace, /^\s{2}workerd:/m);
  assert.deepEqual(approvedWorkerdVersions, lockedWorkerdVersions);
  assert.ok(
    approvedWorkerdVersions.every((version) =>
      /^\d+\.\d+\.\d+$/.test(version),
    ),
  );
});

test("local Mac releases include every scheduled worker artifact", async () => {
  const [
    deployment,
    installer,
    workerRunner,
    workerPlist,
    paymentWorkerRunner,
    paymentWorkerPlist,
    common,
    start,
    status,
    stop,
  ] = await Promise.all([
    source("deploy/local-mac/deploy.sh"),
    source("deploy/local-mac/install.sh"),
    source("deploy/local-mac/run-email-worker.sh"),
    source("deploy/local-mac/com.nodezuno.email-worker.plist.template"),
    source("deploy/local-mac/run-payment-worker.sh"),
    source("deploy/local-mac/com.nodezuno.payment-worker.plist.template"),
    source("deploy/local-mac/_common.sh"),
    source("deploy/local-mac/start.sh"),
    source("deploy/local-mac/status.sh"),
    source("deploy/local-mac/stop.sh"),
  ]);

  for (const moduleName of [
    "crypto.ts",
    "ethereum-rpc.ts",
    "http.ts",
    "rpc-node-preflight.ts",
    "runtime-config.ts",
  ]) {
    assert.match(deployment, new RegExp(`\\b${moduleName.replace(".", "\\.")}\\b`));
  }
  assert.match(
    deployment,
    /scripts\/preflight-node-attachments\.mjs ethereum/,
  );
  assert.match(deployment, /process-notification-outbox\.mjs/);
  assert.match(deployment, /process-stablecoin-payments\.mjs/);
  assert.match(deployment, /preflight-stablecoin-payments\.mjs/);
  assert.match(installer, /render_email_worker_launch_agent/);
  assert.match(installer, /render_payment_worker_launch_agent/);
  assert.match(workerRunner, /process-notification-outbox\.mjs --once/);
  assert.doesNotMatch(workerRunner, /RESEND|AUTH_EMAIL_FROM|NODEZUNO_REVIEW_EMAIL/);
  assert.match(workerPlist, /<key>StartInterval<\/key>\s*<integer>60<\/integer>/);
  assert.match(paymentWorkerRunner, /process-stablecoin-payments\.mjs --once/);
  assert.match(paymentWorkerRunner, /NODEZUNO_STABLECOIN_PAYMENT_MODE/);
  assert.match(paymentWorkerRunner, /NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON/);
  assert.match(paymentWorkerPlist, /<key>StartInterval<\/key>\s*<integer>60<\/integer>/);
  assert.match(common, /NODEZUNO_PAYMENT_WORKER_LABEL/);
  assert.match(start, /nodezuno_payment_worker_target/);
  assert.match(status, /Payment worker: scheduled/);
  assert.match(stop, /nodezuno_payment_worker_target/);
});

test("Ethereum attachment check remains read-only and configured-port aware", async () => {
  const [attachment, common] = await Promise.all([
    source("ops/ethereum-light/attach-nodezuno.sh"),
    source("ops/ethereum-light/common.sh"),
  ]);

  assert.match(attachment, /load_config/);
  assert.match(attachment, /UPSTREAM_LINE=.*\$RPC_PORT/);
  assert.match(
    attachment,
    /if \[ "\$mode" = 'check' \]; then[\s\S]*?exit 0[\s\S]*?config_tmp=/,
  );
  assert.match(common, /config_file_mode=\$\(config_mode\)/);
  assert.doesNotMatch(common, /^\s*mode=\$\(config_mode\)/m);
});

test("local container preview is bound to loopback only", async () => {
  const compose = await source("compose.yaml");

  assert.match(compose, /127\.0\.0\.1:3000:3000/);
  assert.doesNotMatch(compose, /^\s*-\s*["']?3000:3000["']?\s*$/m);
  assert.match(compose, /NODEZUNO_LOCAL_PREVIEW:\s*["']true["']/);
  assert.match(compose, /NODEZUNO_INGRESS_MODE:\s*direct/);
  assert.match(compose, /NODEZUNO_DATABASE_DRIVER:\s*sqlite/);
  assert.match(
    compose,
    /NODEZUNO_SQLITE_PATH:\s*\/var\/lib\/nodezuno\/nodezuno\.sqlite/,
  );
  assert.match(
    compose,
    /nodezuno-data:\/var\/lib\/nodezuno/,
  );
  assert.match(compose, /node scripts\/migrate-container\.mjs/);
  assert.match(compose, /PUBLIC_ORIGIN:\s*http:\/\/localhost:3000/);
});

test("local Sites preview receives every runtime-sensitive feature toggle", async () => {
  const vite = await source("vite.config.ts");
  const sitesEnvironment = await source(".env.example");
  const containerEnvironment = await source(".env.container.example");

  assert.match(
    vite,
    /NODEZUNO_LOCAL_PREVIEW:\s*\n\s*process\.env\.NODEZUNO_LOCAL_PREVIEW \?\? "true"/,
  );
  assert.match(
    vite,
    /NODEZUNO_PUBLIC_INDEXING:\s*\n\s*process\.env\.NODEZUNO_PUBLIC_INDEXING \?\? "false"/,
  );
  assert.match(vite, /NODEZUNO_GRPC_PUBLIC_ENDPOINT:/);
  assert.match(vite, /NODEZUNO_GRPC_AUTH_SECRET:/);
  for (const environment of [sitesEnvironment, containerEnvironment]) {
    assert.match(environment, /Ethereum, Base, and Solana RPC services/);
    assert.match(environment, /"ethereum":\[/);
    assert.match(environment, /"base":\[/);
    assert.match(environment, /"solana":\[/);
  }
});

test("managed deployment fails closed and checks full readiness", async () => {
  const render = await source("render.yaml");
  const continuousIntegration = await source(
    ".github/workflows/ci.yml",
  );
  const packageJson = JSON.parse(await source("package.json"));

  assert.match(render, /healthCheckPath:\s*\/api\/v1\/ready/);
  assert.match(
    render,
    /key:\s*NODEZUNO_LOCAL_PREVIEW\s*\n\s*value:\s*["']false["']/,
  );
  assert.match(
    render,
    /key:\s*NODEZUNO_PUBLIC_INDEXING\s*\n\s*value:\s*["']false["']/,
  );
  assert.match(
    render,
    /key:\s*NODEZUNO_INGRESS_MODE\s*\n\s*value:\s*direct/,
  );
  assert.doesNotMatch(render, /key:\s*NODEZUNO_ORIGIN_SECRET/);
  assert.match(
    render,
    /dockerCommand:\s*sh -c 'node scripts\/preflight-control-plane\.mjs && node scripts\/preflight-stablecoin-payments\.mjs && node scripts\/migrate-container\.mjs && exec node scripts\/start-single-container\.mjs'/,
  );
  assert.doesNotMatch(render, /preDeployCommand:/);
  assert.match(
    render,
    /key:\s*NODEZUNO_DATABASE_DRIVER\s*\n\s*value:\s*sqlite/,
  );
  assert.match(render, /mountPath:\s*\/var\/lib\/nodezuno/);
  assert.match(render, /numInstances:\s*1/);
  assert.match(
    continuousIntegration,
    /api\/v1\/ready\)[\s\S]*=\s*"503"/,
  );
  assert.match(
    continuousIntegration,
    /api\/v1\/status\)[\s\S]*=\s*"403"/,
  );
  assert.match(
    continuousIntegration,
    /NODEZUNO_DATABASE_DRIVER=sqlite/,
  );
  assert.match(
    continuousIntegration,
    /PUBLIC_ORIGIN=https:\/\/ci\.nodezuno\.com/,
  );
  assert.match(
    continuousIntegration,
    /Host: ci\.nodezuno\.com/,
  );
  assert.match(
    continuousIntegration,
    /Host: attacker\.invalid/,
  );
  assert.match(
    continuousIntegration,
    /node scripts\/migrate-container\.mjs && exec node server\.js/,
  );
  assert.match(
    continuousIntegration,
    /\/var\/lib\/nodezuno\/nodezuno\.sqlite/,
  );
  assert.match(
    continuousIntegration,
    /docker volume rm nodezuno-sqlite-ci/,
  );
  for (const smoke of [
    "smoke:links",
    "smoke:auth",
    "smoke:self-service",
    "smoke:local",
  ]) {
    assert.match(continuousIntegration, new RegExp(`pnpm run ${smoke}`));
  }
  assert.equal(
    packageJson.scripts["preflight:control-plane"],
    "node scripts/preflight-control-plane.mjs",
  );
  assert.equal(
    packageJson.scripts["db:migrate:container"],
    "node scripts/migrate-container.mjs",
  );
  assert.equal(
    packageJson.scripts["db:backup:sqlite"],
    "node scripts/backup-sqlite.mjs",
  );
  assert.equal(
    packageJson.scripts["db:restore:sqlite"],
    "node scripts/restore-sqlite.mjs",
  );
  assert.equal(
    packageJson.scripts["payments:preflight"],
    "node scripts/preflight-stablecoin-payments.mjs",
  );
  assert.equal(
    packageJson.scripts["payments:process"],
    "node scripts/process-stablecoin-payments.mjs --once",
  );
});

test("migration authority and standard deployment paths fail closed", async () => {
  const [
    packageJsonSource,
    generationGuard,
    productionEnvironment,
    containerEnvironment,
    render,
    kubernetesConfiguration,
    awsDeployment,
    localDeployment,
    migrationGuide,
  ] = await Promise.all([
    source("package.json"),
    source("scripts/block-drizzle-generation.mjs"),
    source(".env.production.example"),
    source(".env.container.example"),
    source("render.yaml"),
    source("deploy/kubernetes/web.config.example.yaml"),
    source("deploy/aws/scripts/nodezuno-deploy.sh"),
    source("deploy/local-mac/deploy.sh"),
    source("docs/MIGRATIONS.md"),
  ]);
  const packageJson = JSON.parse(packageJsonSource);

  assert.equal(
    packageJson.scripts["db:generate"],
    "node scripts/block-drizzle-generation.mjs",
  );
  assert.match(generationGuard, /Migration generation is disabled/);
  assert.match(generationGuard, /nodezuno_schema_migrations/);
  assert.match(generationGuard, /docs\/MIGRATIONS\.md/);

  for (const environment of [productionEnvironment, containerEnvironment]) {
    assert.match(
      environment,
      /^NODEZUNO_ALLOW_CONTRACT_MIGRATIONS=false$/m,
    );
  }
  assert.match(
    render,
    /key:\s*NODEZUNO_ALLOW_CONTRACT_MIGRATIONS\s*\n\s*value:\s*["']false["']/,
  );
  assert.match(
    kubernetesConfiguration,
    /NODEZUNO_ALLOW_CONTRACT_MIGRATIONS:\s*["']false["']/,
  );
  for (const deployment of [awsDeployment, localDeployment]) {
    assert.match(deployment, /NODEZUNO_ALLOW_CONTRACT_MIGRATIONS/);
    assert.match(
      deployment,
      /standard deployment path refuses (?:schema-baseline and )?contract(?:-migration| migrations?)/i,
    );
    assert.match(deployment, /docs\/MIGRATIONS\.md/);
  }
  assert.match(
    migrationGuide,
    /NODEZUNO_ALLOW_CONTRACT_MIGRATIONS=false/,
  );
  assert.match(
    migrationGuide,
    /NODEZUNO_ALLOW_CONTRACT_MIGRATIONS=true/,
  );
});

test("direct Ethereum payment deployment is disabled by default and legally gated", async () => {
  const [
    productionEnvironment,
    containerEnvironment,
    uploadEnvironment,
    kubernetesConfiguration,
    kubernetesSecrets,
    kubernetesWorker,
    paymentPreflight,
    singleContainer,
    render,
  ] = await Promise.all([
    source(".env.production.example"),
    source(".env.container.example"),
    source("deploy/aws/scripts/upload-production-environment.sh"),
    source("deploy/kubernetes/web.config.example.yaml"),
    source("deploy/kubernetes/web.secret.example.yaml"),
    source("deploy/kubernetes/payment-worker.cronjob.example.yaml"),
    source("scripts/preflight-stablecoin-payments.mjs"),
    source("scripts/start-single-container.mjs"),
    source("render.yaml"),
  ]);

  assert.match(
    productionEnvironment,
    /^NODEZUNO_STABLECOIN_PAYMENT_MODE=disabled$/m,
  );
  assert.match(
    productionEnvironment,
    /^NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON=$/m,
  );
  assert.match(
    productionEnvironment,
    /^NODEZUNO_PAYMENT_CONFIRMATIONS=12$/m,
  );
  assert.doesNotMatch(productionEnvironment, /^STRIPE_SECRET_KEY=/m);
  assert.doesNotMatch(productionEnvironment, /^STRIPE_WEBHOOK_SECRET=/m);
  assert.doesNotMatch(
    productionEnvironment,
    /^NODEZUNO_PAYMENT_RECIPIENT=/m,
  );
  assert.match(
    containerEnvironment,
    /^NODEZUNO_STABLECOIN_PAYMENT_MODE=disabled$/m,
  );
  for (const environment of [productionEnvironment, containerEnvironment]) {
    assert.match(environment, /^NODEZUNO_LEGAL_LAUNCH_APPROVED=false$/m);
    assert.match(environment, /^NODEZUNO_PUBLIC_INDEXING=false$/m);
  }

  for (const name of [
    "NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON",
    "NODEZUNO_LEGAL_LAUNCH_APPROVED",
    "NODEZUNO_PAYMENT_CONFIRMATIONS",
    "NODEZUNO_PUBLIC_INDEXING",
    "NODEZUNO_STABLECOIN_PAYMENT_MODE",
  ]) {
    assert.match(uploadEnvironment, new RegExp(`\\b${name}\\b`));
  }
  assert.match(
    uploadEnvironment,
    /payment_mode" != "disabled" && "\$payment_mode" != "ethereum_mainnet"/,
  );
  assert.match(uploadEnvironment, /Ethereum mainnet payments require NODEZUNO_LEGAL_LAUNCH_APPROVED=true/);
  assert.match(uploadEnvironment, /Public indexing requires NODEZUNO_LEGAL_LAUNCH_APPROVED=true/);
  assert.match(uploadEnvironment, /require configured verification endpoints/);
  assert.match(uploadEnvironment, /payment_confirmations < 6/);
  assert.match(uploadEnvironment, /payment_confirmations > 64/);

  assert.match(
    kubernetesConfiguration,
    /NODEZUNO_STABLECOIN_PAYMENT_MODE:\s*disabled/,
  );
  assert.match(kubernetesConfiguration, /NODEZUNO_LEGAL_LAUNCH_APPROVED:\s*["']false["']/);
  assert.match(
    kubernetesConfiguration,
    /NODEZUNO_PAYMENT_CONFIRMATIONS:\s*["']12["']/,
  );
  assert.doesNotMatch(
    kubernetesConfiguration,
    /NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON/,
  );
  assert.match(kubernetesSecrets, /NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON:/);
  assert.doesNotMatch(kubernetesSecrets, /STRIPE_/);

  assert.match(kubernetesWorker, /kind:\s*CronJob/);
  assert.match(kubernetesWorker, /schedule:\s*["']\* \* \* \* \*["']/);
  assert.match(kubernetesWorker, /concurrencyPolicy:\s*Forbid/);
  assert.match(kubernetesWorker, /process-stablecoin-payments\.mjs/);
  assert.match(kubernetesWorker, /- --once/);
  assert.match(kubernetesWorker, /claimName:\s*nodezuno-web-data/);
  assert.match(kubernetesWorker, /automountServiceAccountToken:\s*false/);
  assert.match(kubernetesWorker, /readOnlyRootFilesystem:\s*true/);
  assert.match(kubernetesWorker, /allowPrivilegeEscalation:\s*false/);
  assert.match(kubernetesWorker, /drop:\s*\n\s*- ALL/);
  assert.match(kubernetesWorker, /resources:\s*\n\s*requests:[\s\S]*limits:/);
  assert.match(kubernetesWorker, /@sha256:REPLACE_WITH_IMAGE_DIGEST/);

  for (const method of [
    "eth_chainId",
    "eth_getBlockByNumber",
    "eth_getCode",
    "eth_call",
  ]) {
    assert.match(paymentPreflight, new RegExp(`"${method}"`));
  }
  assert.match(paymentPreflight, /["']finalized["']/);
  assert.match(paymentPreflight, /unexpected stablecoin decimals/);
  assert.match(paymentPreflight, /configuration\.mode === "disabled"/);

  assert.match(render, /key:\s*NODEZUNO_STABLECOIN_PAYMENT_MODE/);
  assert.match(
    render,
    /key:\s*NODEZUNO_STABLECOIN_PAYMENT_MODE\s*\n\s*value:\s*disabled/,
  );
  assert.match(
    render,
    /key:\s*NODEZUNO_LEGAL_LAUNCH_APPROVED\s*\n\s*value:\s*["']false["']/,
  );
  const renderEnablesPayments =
    /key:\s*NODEZUNO_STABLECOIN_PAYMENT_MODE\s*\n\s*value:\s*ethereum_mainnet/.test(
      render,
    );
  const renderSchedulesDedicatedWorker =
    /type:\s*(?:worker|cron)[\s\S]*process-stablecoin-payments\.mjs/.test(
      render,
    );
  const renderSchedulesInWebContainer =
    /start-single-container\.mjs/.test(render) &&
    /process-stablecoin-payments\.mjs/.test(singleContainer) &&
    /setInterval\(\(\) => void runWorkers\(\), 60_000\)/.test(
      singleContainer,
    );
  assert.equal(
    renderEnablesPayments &&
      !renderSchedulesDedicatedWorker &&
      !renderSchedulesInWebContainer,
    false,
    "Render must schedule the verifier before it enables stablecoin payments.",
  );
});

test("AWS production deployment is immutable, secret-isolated, and recoverable", async () => {
  const [compose, edge, deployment, activator, firewall, compute, stage, userData, identity, release] = await Promise.all([
    source("deploy/aws/compose.ec2.yaml"),
    source("deploy/aws/Caddy.ec2.conf"),
    source("deploy/aws/scripts/nodezuno-deploy.sh"),
    source("deploy/aws/scripts/nodezuno-activate-release.sh"),
    source("deploy/aws/scripts/nodezuno-container-firewall.sh"),
    source("deploy/aws/terraform/bootstrap/compute.tf"),
    source("deploy/aws/terraform/bootstrap/templates/stage-host-bundle.sh.tftpl"),
    source("deploy/aws/terraform/bootstrap/templates/user-data.sh.tftpl"),
    source("deploy/aws/terraform/bootstrap/iam.tf"),
    source(".github/workflows/aws-release.yml"),
  ]);

  assert.match(compose, /image: \$\{NODEZUNO_IMAGE:\?/);
  assert.match(compose, /pull_policy: missing/);
  assert.match(compose, /\/opt\/nodezuno\/data:\/var\/lib\/nodezuno:ro/);
  assert.match(edge, /health_uri \/api\/v1\/ready/);
  assert.doesNotMatch(edge, /health_uri \/api\/v1\/live/);
  assert.doesNotMatch(
    compose.slice(compose.indexOf("  caddy:")),
    /env_file|\.env\.production|BETTER_AUTH_SECRET|API_KEY_PEPPER/,
  );
  assert.match(deployment, /docker pull "\$image"/);
  assert.match(deployment, /--force-recreate/);
  assert.match(deployment, /Attempting automatic image and environment rollback/);
  assert.match(activator, /nodezuno-deploy\.lock/);
  assert.match(activator, /activate_bundle "\$bundle_dir"/);
  assert.match(activator, /Restoring the previous host bundle/);
  assert.match(activator, /snapshot_worker_units/);
  assert.match(activator, /restore_worker_units/);
  assert.match(activator, /finalize_image_markers/);
  assert.match(activator, /deployment_status" = 74/);
  assert.doesNotMatch(deployment, /DeploymentSuccess 1/);
  assert.doesNotMatch(deployment, /releases\/current-image/);
  assert.match(firewall, /DOCKER-USER/);
  assert.match(firewall, /169\.254\.169\.254\/32/);
  assert.match(firewall, /172\.29\.243\.0\/28/);
  assert.match(userData, /20-nodezuno-container-firewall\.conf/);
  assert.match(userData, /nodezuno\.service\.d\/20-nodezuno-container-firewall\.conf/);
  assert.match(userData, /ExecStartPre=\/usr\/bin\/bash \/usr\/local\/sbin\/nodezuno-container-firewall/);
  assert.match(compose, /email-worker:/);
  assert.match(compose, /process-notification-outbox\.mjs/);
  assert.match(compose, /payment-worker:/);
  assert.match(compose, /process-stablecoin-payments\.mjs/);
  const emailWorker = compose.slice(
    compose.indexOf("  email-worker:"),
    compose.indexOf("  payment-worker:"),
  );
  assert.match(emailWorker, /NODEZUNO_EMAIL_ENV_FILE/);
  assert.doesNotMatch(emailWorker, /NODEZUNO_APP_ENV_FILE|\.env\.production/);
  const isolatedPaymentWorker = compose.slice(
    compose.indexOf("  payment-worker:"),
    compose.indexOf("  caddy:"),
  );
  assert.match(isolatedPaymentWorker, /NODEZUNO_PAYMENT_ENV_FILE/);
  assert.doesNotMatch(
    isolatedPaymentWorker,
    /NODEZUNO_APP_ENV_FILE|\.env\.production/,
  );
  assert.match(deployment, /write_email_environment/);
  assert.match(deployment, /write_payment_environment/);
  assert.doesNotMatch(
    deployment.slice(
      deployment.indexOf("write_email_environment()"),
      deployment.indexOf("write_payment_environment()"),
    ),
    /RESEND|AUTH_EMAIL_FROM|NODEZUNO_REVIEW_EMAIL/,
  );
  assert.doesNotMatch(
    deployment.slice(
      deployment.indexOf("write_payment_environment()"),
      deployment.indexOf("write_runtime()"),
    ),
    /BETTER_AUTH_URL|PUBLIC_ORIGIN/,
  );
  assert.match(deployment, /\.env\.email-worker/);
  assert.match(deployment, /\.env\.payment-worker/);
  assert.match(activator, /previous_email_secret/);
  assert.match(activator, /previous_payment_secret/);
  assert.match(compose, /profiles:\s*\n\s*- operations/);
  assert.match(activator, /nodezuno-email-worker\.timer/);
  assert.match(activator, /nodezuno-payment-worker\.timer/);
  assert.match(activator, /OnUnitActiveSec=1min/);
  assert.match(activator, /flock --exclusive --nonblock/);
  const paymentWorker = compose.slice(
    compose.indexOf("  payment-worker:"),
    compose.indexOf("  caddy:"),
  );
  assert.match(paymentWorker, /profiles:\s*\n\s*- operations/);
  assert.match(
    paymentWorker,
    /preflight-deployment-topology\.mjs payment-worker/,
  );
  assert.match(paymentWorker, /process-stablecoin-payments\.mjs --once/);
  assert.match(paymentWorker, /\/opt\/nodezuno\/data:\/var\/lib\/nodezuno/);
  assert.match(paymentWorker, /read_only:\s*true/);
  assert.match(paymentWorker, /cap_drop:\s*\n\s*- ALL/);
  assert.doesNotMatch(paymentWorker, /network_mode:\s*none/);
  assert.match(emailWorker, /nodezuno-email-egress/);
  assert.match(paymentWorker, /nodezuno-payment-egress/);
  assert.match(compose, /nodezuno-web-egress:[\s\S]*gw_priority:\s*1/);
  assert.match(compute, /stage-host-bundle\.sh\.tftpl/);
  assert.match(compute, /nodezuno-activate-release\.sh/);
  assert.match(stage, /nodezuno-host-stage\.lock/);
  assert.match(stage, /mv --no-target-directory/);
  assert.match(compute, /allowedPattern/);
  assert.match(identity, /repo:\$\{var\.github_repository\}:ref:refs\/heads\/main/);
  assert.match(
    identity,
    /repo:\$\{var\.github_repository\}:environment:\$\{var\.github_environment\}/,
  );
  assert.match(release, /steps\.scan\.outputs\.digest/);
  assert.match(release, /platform\.architecture == "arm64"/);
});

test("AWS launch stack omits premature managed infrastructure", async () => {
  const terraformFiles = await Promise.all(
    [
      "audit.tf",
      "compute.tf",
      "ecr.tf",
      "iam.tf",
      "locals.tf",
      "monitoring.tf",
      "network.tf",
      "outputs.tf",
      "storage.tf",
      "variables.tf",
      "versions.tf",
    ].map((file) => source(`deploy/aws/terraform/bootstrap/${file}`)),
  );
  const terraform = terraformFiles.join("\n");

  assert.match(terraform, /resource "aws_instance" "web"/);
  assert.match(terraform, /associate_public_ip_address\s*=\s*true/);
  assert.match(terraform, /resource "aws_eip" "web"/);
  assert.match(terraform, /resource "aws_s3_bucket" "backups"/);
  assert.match(terraform, /resource "aws_cloudwatch_metric_alarm"/);
  assert.match(terraform, /RootDiskUsedPercent/);
  assert.match(terraform, /stop_instance_before_detaching\s*=\s*true/);
  assert.match(terraform, /treat_missing_data\s*=\s*"missing"/);
  assert.match(terraform, /resource "aws_ssm_association" "weekly_security_patches"/);
  assert.match(terraform, /RebootOption\s*=\s*"NoReboot"/);
  assert.doesNotMatch(terraform, /protocol\s*=\s*"-1"/);
  assert.doesNotMatch(
    terraform,
    /resource "aws_(?:eks_cluster|lb|nat_gateway|rds_cluster|db_instance|ecs_cluster)"/,
  );
});

test("Kubernetes web baseline keeps SQLite single-writer and runtime isolation explicit", async () => {
  const [deployment, configuration, secrets, guide] =
    await Promise.all([
      source("deploy/kubernetes/web.deployment.example.yaml"),
      source("deploy/kubernetes/web.config.example.yaml"),
      source("deploy/kubernetes/web.secret.example.yaml"),
      source("deploy/kubernetes/README.md"),
    ]);

  for (const kind of [
    "ServiceAccount",
    "PersistentVolumeClaim",
    "Deployment",
    "Service",
    "PodDisruptionBudget",
    "NetworkPolicy",
  ]) {
    assert.match(deployment, new RegExp(`kind:\\s*${kind}`));
  }
  assert.match(deployment, /replicas:\s*1/);
  assert.match(deployment, /type:\s*Recreate/);
  assert.match(deployment, /accessModes:\s*\n\s*-\s*ReadWriteOnce/);
  assert.match(deployment, /node scripts\/migrate-container\.mjs/);
  assert.match(
    deployment,
    /node scripts\/preflight-control-plane\.mjs/,
  );
  assert.match(deployment, /path:\s*\/api\/v1\/live/);
  assert.match(deployment, /path:\s*\/api\/v1\/ready/);
  assert.match(deployment, /automountServiceAccountToken:\s*false/);
  assert.match(deployment, /enableServiceLinks:\s*false/);
  assert.match(deployment, /runAsNonRoot:\s*true/);
  assert.match(deployment, /readOnlyRootFilesystem:\s*true/);
  assert.match(deployment, /allowPrivilegeEscalation:\s*false/);
  assert.match(deployment, /privileged:\s*false/);
  assert.match(deployment, /drop:\s*\n\s*-\s*ALL/);
  assert.match(deployment, /type:\s*RuntimeDefault/);
  assert.match(deployment, /type:\s*ClusterIP/);
  assert.match(deployment, /nodezuno\.com\/ingress:\s*["']true["']/);
  assert.doesNotMatch(
    deployment,
    /app\.kubernetes\.io\/name:\s*nodezuno-native-grpc/,
  );
  assert.match(
    deployment,
    /REGISTRY\.example\/nodezuno-web@sha256:REPLACE_WITH_IMAGE_DIGEST/g,
  );
  assert.doesNotMatch(deployment, /kind:\s*Ingress/);

  assert.match(configuration, /NODEZUNO_INGRESS_MODE:\s*direct/);
  assert.match(configuration, /NODEZUNO_DATABASE_DRIVER:\s*sqlite/);
  assert.match(
    configuration,
    /NODEZUNO_SQLITE_PATH:\s*\/var\/lib\/nodezuno\/nodezuno\.sqlite/,
  );
  assert.match(configuration, /PUBLIC_ORIGIN:\s*https:\/\/replace\.invalid/);
  assert.match(
    configuration,
    /BETTER_AUTH_URL:\s*https:\/\/replace\.invalid/,
  );
  assert.doesNotMatch(configuration, /RATE_LIMIT_SECRET|API_KEY_PEPPER/);

  for (const secretName of [
    "RATE_LIMIT_SECRET",
    "API_KEY_PEPPER",
    "BETTER_AUTH_SECRET",
  ]) {
    assert.match(secrets, new RegExp(`^\\s*${secretName}:`, "m"));
  }
  assert.doesNotMatch(secrets, /NODEZUNO_RPC|NODEZUNO_GRPC/);
  assert.doesNotMatch(secrets, /nzu_live_/);
  assert.match(
    guide,
    /Increasing `replicas` does\s+not create availability/,
  );
  assert.match(guide, /immutable digest/);
  assert.match(guide, /not the active AWS deployment/);
  assert.doesNotMatch(
    `${deployment}\n${configuration}\n${secrets}\n${guide}`,
    /\u2014/,
  );
});

test("native gRPC deployment uses the shared customer key lifecycle", async () => {
  const gatewayEnvironment = await source(
    "services/grpc-gateway/config.example.env",
  );
  const cloudRun = await source(
    "services/grpc-gateway/cloudrun.service.example.yaml",
  );
  const render = await source("render.yaml");
  const compose = await source("compose.yaml");

  assert.match(
    gatewayEnvironment,
    /^NODEZUNO_GRPC_AUTH_MODE=control-plane$/m,
  );
  assert.match(
    gatewayEnvironment,
    /^NODEZUNO_GRPC_AUTH_URL=https:\/\/nodezuno\.com\/api\/v1\/internal\/grpc\/authorize$/m,
  );
  assert.match(
    gatewayEnvironment,
    /^NODEZUNO_GRPC_AUTH_SECRET=$/m,
  );
  assert.match(
    gatewayEnvironment,
    /^GRPC_API_KEY_SHA256=$/m,
  );
  assert.match(
    gatewayEnvironment,
    /^ETHEREUM_UPSTREAMS_JSON=$/m,
  );
  assert.match(cloudRun, /name:\s*h2c\s*\n\s*containerPort:\s*8080/);
  assert.match(
    cloudRun,
    /name:\s*NODEZUNO_GRPC_AUTH_MODE\s*\n\s*value:\s*control-plane/,
  );
  assert.match(
    cloudRun,
    /name:\s*NODEZUNO_GRPC_AUTH_SECRET[\s\S]*secretKeyRef:[\s\S]*name:\s*nodezuno-grpc-auth-secret/,
  );
  assert.match(
    cloudRun,
    /name:\s*ETHEREUM_UPSTREAMS_JSON[\s\S]*secretKeyRef:[\s\S]*name:\s*nodezuno-ethereum-upstreams/,
  );
  assert.doesNotMatch(cloudRun, /name:\s*ETHEREUM_RPC_URL/);
  assert.doesNotMatch(cloudRun, /name:\s*ETHEREUM_RPC_HEADERS_JSON/);
  assert.match(render, /key:\s*NODEZUNO_GRPC_PUBLIC_ENDPOINT/);
  assert.match(render, /key:\s*NODEZUNO_GRPC_AUTH_SECRET/);
  assert.match(compose, /profiles:\s*\n\s*-\s*native-grpc/);
  assert.match(compose, /127\.0\.0\.1:50051:50051/);
});

test("native gRPC manifests keep probes, secrets, and runtime isolation explicit", async () => {
  const cloudRun = await source(
    "services/grpc-gateway/cloudrun.service.example.yaml",
  );
  const kubernetes = await source(
    "services/grpc-gateway/kubernetes.deployment.example.yaml",
  );
  const gatewayMain = await source(
    "services/grpc-gateway/cmd/server/main.go",
  );
  const gatewayReadme = await source(
    "services/grpc-gateway/README.md",
  );
  const gatewayDockerfile = await source(
    "services/grpc-gateway/Dockerfile",
  );
  const gatewayModule = await source(
    "services/grpc-gateway/go.mod",
  );

  for (const manifest of [cloudRun, kubernetes]) {
    assert.match(
      manifest,
      /service:\s*nodezuno-native-grpc-liveness/,
    );
    assert.match(
      manifest,
      /service:\s*nodezuno\.ethereum\.v1\.EthereumProxy/,
    );
    assert.match(manifest, /name:\s*ETHEREUM_UPSTREAMS_JSON/);
    assert.match(manifest, /secretKeyRef:/);
    assert.doesNotMatch(manifest, /name:\s*ETHEREUM_RPC_URL/);
    assert.doesNotMatch(manifest, /name:\s*ETHEREUM_RPC_HEADERS_JSON/);
    assert.doesNotMatch(manifest, /\u2014/);
  }

  assert.match(
    cloudRun,
    /serviceAccountName:\s*nodezuno-native-grpc@PROJECT\.iam\.gserviceaccount\.com/,
  );
  assert.match(cloudRun, /resources:\s*\n\s*limits:/);
  assert.match(cloudRun, /cpu:\s*["']1["']/);
  assert.match(cloudRun, /memory:\s*512Mi/);

  for (const kind of ["Deployment", "Service", "PodDisruptionBudget"]) {
    assert.match(kubernetes, new RegExp(`kind:\\s*${kind}`));
  }
  assert.match(kubernetes, /replicas:\s*2/);
  assert.match(kubernetes, /type:\s*RollingUpdate/);
  assert.match(kubernetes, /maxUnavailable:\s*0/);
  assert.match(kubernetes, /maxSurge:\s*1/);
  assert.match(kubernetes, /automountServiceAccountToken:\s*false/);
  assert.match(kubernetes, /enableServiceLinks:\s*false/);
  assert.match(kubernetes, /runAsNonRoot:\s*true/);
  assert.match(kubernetes, /runAsUser:\s*65532/);
  assert.match(kubernetes, /runAsGroup:\s*65532/);
  assert.match(kubernetes, /type:\s*RuntimeDefault/);
  assert.match(kubernetes, /allowPrivilegeEscalation:\s*false/);
  assert.match(kubernetes, /privileged:\s*false/);
  assert.match(kubernetes, /readOnlyRootFilesystem:\s*true/);
  assert.match(kubernetes, /drop:\s*\n\s*-\s*ALL/);
  assert.match(
    kubernetes,
    /resources:\s*\n\s*requests:[\s\S]*limits:/,
  );
  assert.match(
    kubernetes,
    /name:\s*nodezuno-native-grpc-secrets/,
  );
  assert.match(kubernetes, /key:\s*ethereum-upstreams\.json/);
  assert.match(kubernetes, /key:\s*control-plane-auth-secret/);
  assert.match(kubernetes, /type:\s*ClusterIP/);
  assert.doesNotMatch(kubernetes, /type:\s*(?:LoadBalancer|NodePort)/);
  assert.doesNotMatch(kubernetes, /kind:\s*Ingress/);
  assert.doesNotMatch(kubernetes, /kind:\s*Secret/);
  assert.match(kubernetes, /minAvailable:\s*1/);
  assert.match(
    kubernetes,
    /@sha256:REPLACE_WITH_IMAGE_DIGEST/,
  );

  assert.match(
    gatewayMain,
    /const livenessServiceName = "nodezuno-native-grpc-liveness"/,
  );
  assert.match(
    gatewayMain,
    /SetServingStatus\(\s*livenessServiceName,\s*healthv1\.HealthCheckResponse_SERVING,/,
  );
  assert.match(gatewayReadme, /one to four ordered objects/);
  assert.match(gatewayReadme, /no more than two provider attempts/);
  assert.match(gatewayReadme, /cool(?:s|ing) down for 30 seconds/);
  assert.match(gatewayReadme, /Single-upstream compatibility path/);
  assert.match(
    gatewayReadme,
    /not evidence that a Cloud Run service exists/,
  );
  assert.doesNotMatch(gatewayReadme, /\u2014/);

  assert.match(
    gatewayDockerfile,
    /^FROM golang:1\.26\.5-alpine@sha256:[0-9a-f]{64} AS build$/m,
  );
  assert.match(gatewayDockerfile, /^ENV GOTOOLCHAIN=local$/m);
  assert.match(gatewayDockerfile, /go mod download && go mod verify/);
  assert.match(gatewayDockerfile, /-mod=readonly/);
  assert.match(gatewayDockerfile, /^FROM scratch$/m);
  assert.match(gatewayDockerfile, /^USER 65532:65532$/m);
  assert.doesNotMatch(
    gatewayDockerfile,
    /COPY\s+(?:config\.env|\.env)/,
  );
  assert.match(gatewayModule, /^go 1\.25\.0$/m);
});

test("container build context excludes local and production secrets", async () => {
  const dockerignore = await source(".dockerignore");
  const gitignore = await source(".gitignore");

  assert.match(dockerignore, /^\.env$/m);
  assert.match(dockerignore, /^\.env\.\*$/m);
  assert.match(dockerignore, /^!\.env\.container\.example$/m);
  assert.match(dockerignore, /^\.dev\.vars\*$/m);
  assert.match(dockerignore, /^\*\*\/\.terraform$/m);
  assert.match(dockerignore, /^\*\*\/\.terraform\/\*\*$/m);
  assert.match(dockerignore, /^\.tmp-\*$/m);
  assert.match(dockerignore, /^\*\*\/\.DS_Store$/m);
  assert.match(dockerignore, /^\*\.tsbuildinfo$/m);
  assert.match(dockerignore, /^\*\.tfstate$/m);
  assert.match(dockerignore, /^\*\.tfstate\.\*$/m);
  assert.match(dockerignore, /^\*\.sqlite$/m);
  assert.match(dockerignore, /^\*\.sqlite-\*$/m);
  assert.match(gitignore, /^\.dev\.vars\*$/m);
  assert.match(gitignore, /^\*\.sqlite$/m);
  assert.match(gitignore, /^\*\.sqlite-\*$/m);
});

test("customer-journey smoke is local-only and covers teardown", async () => {
  const smoke = await source("scripts/self-service-smoke.mjs");
  const packageJson = JSON.parse(await source("package.json"));

  assert.equal(
    packageJson.scripts["smoke:self-service"],
    "node scripts/self-service-smoke.mjs",
  );
  assert.match(smoke, /refuses every non-loopback or non-HTTP target/);
  assert.match(smoke, /\/api\/auth\/sign-up\/email/);
  assert.match(smoke, /\/api\/auth\/sign-out/);
  assert.match(smoke, /\/api\/auth\/sign-in\/email/);
  assert.match(smoke, /\/api\/v1\/developer\/workspace/);
  assert.match(smoke, /\/api\/v1\/developer\/services/);
  assert.match(smoke, /\/api\/v1\/developer\/api-keys/);
  assert.match(smoke, /\/api\/v1\/platform\/whoami/);
  assert.match(smoke, /\/api\/v1\/control-plane\/services/);
  assert.match(smoke, /services:manage/);
  assert.match(smoke, /Idempotency-Key/);
  assert.match(smoke, /browser service read/);
  assert.match(smoke, /browser service rename/);
  assert.match(smoke, /programmatic service read/);
  assert.match(smoke, /programmatic service rename/);
  assert.match(smoke, /service_update_conflict/);
  assert.match(smoke, /programmatic policy update/);
  assert.match(smoke, /bestEffortCleanup/);
  assert.doesNotMatch(smoke, /console\.log\([^)]*apiKeySecret/);
});

test("backend smoke follows the current least-privilege key contract", async () => {
  const smoke = await source("scripts/backend-smoke.mjs");

  assert.match(smoke, /\/api\/v1\/developer\/api-keys/);
  assert.match(
    smoke,
    /"Idempotency-Key": `backend-smoke-key-\$\{crypto\.randomUUID\(\)\}`/,
  );
  assert.match(smoke, /scopes: \["platform:identity"\]/);
  assert.match(smoke, /\/api\/v1\/platform\/whoami/);
  assert.doesNotMatch(
    smoke.match(
      /assert\.deepEqual\(keyIdentity\.body\.data\.apiKey\.scopes,[\s\S]{0,160}/,
    )?.[0] ?? "",
    /rpc:invoke|grpc:invoke/,
  );
});
