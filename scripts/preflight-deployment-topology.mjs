#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";

const ROLES = new Set(["web", "email-worker", "payment-worker"]);

export class DeploymentTopologyError extends Error {}

export function validateSingleHostSqliteTopology(
  environment = process.env,
  expectedRole,
) {
  if (!ROLES.has(expectedRole)) {
    throw new DeploymentTopologyError(
      "Expected process role must be web, email-worker, or payment-worker.",
    );
  }

  const checks = {
    production: environment.NODE_ENV === "production",
    containerRuntime: environment.NODEZUNO_RUNTIME === "container",
    localPreviewDisabled:
      environment.NODEZUNO_LOCAL_PREVIEW === "false",
    sqliteDriver:
      environment.NODEZUNO_DATABASE_DRIVER === "sqlite",
    singleHostTopology:
      environment.NODEZUNO_DEPLOYMENT_TOPOLOGY ===
      "single-host-sqlite",
    oneWebReplica:
      environment.NODEZUNO_WEB_REPLICA_COUNT === "1",
    systemdWorkerOwner:
      environment.NODEZUNO_BACKGROUND_WORKER_OWNER ===
      "systemd-single-host",
    processRole:
      environment.NODEZUNO_PROCESS_ROLE === expectedRole,
    sqlitePath: validSqlitePath(
      environment.NODEZUNO_SQLITE_PATH,
    ),
  };
  const failedChecks = Object.entries(checks)
    .filter(([, valid]) => !valid)
    .map(([name]) => name);
  if (failedChecks.length > 0) {
    throw new DeploymentTopologyError(
      `Unsafe single-host SQLite topology: ${failedChecks.join(", ")}.`,
    );
  }

  return {
    database: "sqlite",
    topology: "single-host-sqlite",
    webReplicas: 1,
    processRole: expectedRole,
    backgroundWorkerOwner: "systemd-single-host",
  };
}

function validSqlitePath(value) {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    !value.startsWith("/") ||
    value.length > 1024 ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    !/\.(?:db|sqlite|sqlite3)$/i.test(value)
  ) {
    return false;
  }
  return !value
    .split("/")
    .some(
      (segment, index) =>
        index > 0 &&
        (segment === "" || segment === "." || segment === ".."),
    );
}

async function main() {
  const argumentsList = process.argv.slice(2);
  if (argumentsList.length !== 1) {
    throw new DeploymentTopologyError(
      "Usage: preflight-deployment-topology.mjs <process-role>",
    );
  }
  const result = validateSingleHostSqliteTopology(
    process.env,
    argumentsList[0],
  );
  process.stdout.write(
    `${JSON.stringify({
      service: "nodezuno-deployment-topology-preflight",
      status: "ready",
      ...result,
    })}\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        service: "nodezuno-deployment-topology-preflight",
        status: "failed",
        error:
          error instanceof DeploymentTopologyError
            ? error.message
            : "Deployment topology preflight failed.",
      })}\n`,
    );
    process.exitCode = 1;
  });
}
