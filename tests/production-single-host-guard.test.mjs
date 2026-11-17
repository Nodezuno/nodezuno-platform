import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DeploymentTopologyError,
  validateSingleHostSqliteTopology,
} from "../scripts/preflight-deployment-topology.mjs";

const validEnvironment = {
  NODE_ENV: "production",
  NODEZUNO_RUNTIME: "container",
  NODEZUNO_LOCAL_PREVIEW: "false",
  NODEZUNO_DATABASE_DRIVER: "sqlite",
  NODEZUNO_SQLITE_PATH: "/var/lib/nodezuno/nodezuno.sqlite",
  NODEZUNO_DEPLOYMENT_TOPOLOGY: "single-host-sqlite",
  NODEZUNO_WEB_REPLICA_COUNT: "1",
  NODEZUNO_BACKGROUND_WORKER_OWNER: "systemd-single-host",
  NODEZUNO_PROCESS_ROLE: "web",
};

test("single-host SQLite topology accepts one declared web process", () => {
  assert.deepEqual(
    validateSingleHostSqliteTopology(validEnvironment, "web"),
    {
      database: "sqlite",
      topology: "single-host-sqlite",
      webReplicas: 1,
      processRole: "web",
      backgroundWorkerOwner: "systemd-single-host",
    },
  );
});

test("single-host SQLite topology rejects unsafe replica and ownership settings", () => {
  for (const override of [
    { NODEZUNO_WEB_REPLICA_COUNT: "2" },
    { NODEZUNO_WEB_REPLICA_COUNT: "01" },
    { NODEZUNO_WEB_REPLICA_COUNT: undefined },
    { NODEZUNO_BACKGROUND_WORKER_OWNER: "web-process" },
    { NODEZUNO_DEPLOYMENT_TOPOLOGY: "high-availability" },
    { NODEZUNO_SQLITE_PATH: "/var/lib/nodezuno/../shared.sqlite" },
  ]) {
    assert.throws(
      () =>
        validateSingleHostSqliteTopology(
          { ...validEnvironment, ...override },
          "web",
        ),
      DeploymentTopologyError,
    );
  }
});

test("worker role cannot impersonate the web or another worker", () => {
  const paymentEnvironment = {
    ...validEnvironment,
    NODEZUNO_PROCESS_ROLE: "payment-worker",
  };
  assert.equal(
    validateSingleHostSqliteTopology(
      paymentEnvironment,
      "payment-worker",
    ).processRole,
    "payment-worker",
  );
  assert.throws(
    () =>
      validateSingleHostSqliteTopology(
        paymentEnvironment,
        "email-worker",
      ),
    DeploymentTopologyError,
  );
});

test("AWS runtime has an enforced singleton and observable worker owner", async () => {
  const [compose, dockerfile, activator, metrics, monitoring] =
    await Promise.all([
      source("deploy/aws/compose.ec2.yaml"),
      source("Dockerfile"),
      source("deploy/aws/scripts/nodezuno-activate-release.sh"),
      source("deploy/aws/scripts/nodezuno-host-metrics.sh"),
      source("deploy/aws/terraform/bootstrap/monitoring.tf"),
    ]);

  assert.match(dockerfile, /apt-get install[^\n]*util-linux/);
  assert.match(
    compose,
    /NODEZUNO_DEPLOYMENT_TOPOLOGY:\s*single-host-sqlite/,
  );
  assert.match(compose, /NODEZUNO_WEB_REPLICA_COUNT:\s*["']1["']/);
  assert.match(compose, /deploy:\s*\n\s*replicas:\s*1/);
  assert.match(
    compose,
    /flock --exclusive --nonblock --no-fork --conflict-exit-code 78[^\n]+node server\.js/,
  );
  assert.match(
    compose,
    /preflight-deployment-topology\.mjs payment-worker/,
  );
  assert.match(
    activator,
    /conflict-exit-code 75[^\n]+nodezuno-background\.lock/,
  );
  assert.match(activator, /ExecStartPost=[^\n]+last-success/);
  assert.match(activator, /run_worker_and_verify/);
  assert.match(activator, /email-worker\.last-success/);
  assert.match(activator, /payment-worker\.last-success/);
  assert.match(metrics, /BackgroundWorkersHealthy/);
  assert.match(metrics, /email_worker_age_seconds <= 300/);
  assert.match(metrics, /payment_worker_age_seconds <= 300/);
  assert.match(
    monitoring,
    /resource "aws_cloudwatch_metric_alarm" "background_workers_health"/,
  );
});

async function source(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}
