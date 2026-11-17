#!/usr/bin/env node

import { spawn } from "node:child_process";

const node = process.execPath;
const workerCommands = [
  ["scripts/process-notification-outbox.mjs", "--once"],
  ["scripts/process-stablecoin-payments.mjs", "--once"],
];
let stopping = false;
let workersRunning = false;
let serverExited = false;

const server = spawn(node, ["server.js"], {
  env: process.env,
  stdio: "inherit",
});

async function runWorkers() {
  if (stopping || workersRunning) return;
  workersRunning = true;
  try {
    for (const command of workerCommands) {
      if (stopping) break;
      const exitCode = await run(command);
      if (exitCode !== 0) {
        process.stderr.write(`${JSON.stringify({
          service: "nodezuno-single-container",
          worker: command[0],
          status: "failed",
          exitCode,
        })}\n`);
      }
    }
  } finally {
    workersRunning = false;
  }
}

const initialRun = setTimeout(() => void runWorkers(), 5_000);
const timer = setInterval(() => void runWorkers(), 60_000);

function stop(signal) {
  if (stopping) return;
  stopping = true;
  clearTimeout(initialRun);
  clearInterval(timer);
  if (!server.killed) server.kill(signal);
  const forcedExit = setTimeout(() => {
    if (!serverExited) server.kill("SIGKILL");
    process.exit(1);
  }, 25_000);
  forcedExit.unref();
}

process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));

server.on("error", () => {
  stop("SIGTERM");
  process.exitCode = 1;
});

server.on("exit", (code, signal) => {
  serverExited = true;
  clearTimeout(initialRun);
  clearInterval(timer);
  if (!stopping && signal) process.kill(process.pid, signal);
  else process.exit(code ?? (stopping ? 0 : 1));
});

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(node, args, {
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", () => resolve(1));
    child.on("exit", (code) => resolve(code ?? 1));
  });
}
