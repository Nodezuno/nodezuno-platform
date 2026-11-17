#!/usr/bin/env node

import { readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";

const requiredProductionSuites = [
  "notification-outbox-worker.test.mjs",
  "review-commerce-security.test.mjs",
  "review-deliverables-security.test.mjs",
  "stablecoin-payment-security.test.mjs",
];

function fail(message) {
  console.error(`Test discovery failed: ${message}`);
  process.exitCode = 1;
}

function parseArguments(argv) {
  const options = {
    discoveryOnly: false,
    exact: null,
    prefix: null,
    requireProductionSuites: true,
  };

  for (const argument of argv) {
    if (argument === "--discovery-only") {
      options.discoveryOnly = true;
    } else if (argument === "--allow-partial") {
      options.requireProductionSuites = false;
    } else if (argument.startsWith("--exact=")) {
      options.exact = argument.slice("--exact=".length);
    } else if (argument.startsWith("--prefix=")) {
      options.prefix = argument.slice("--prefix=".length);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (options.exact && options.prefix) {
    throw new Error("Use either --exact or --prefix, not both.");
  }
  return options;
}

async function discover(directory, root = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const discovered = [];

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      discovered.push(...await discover(absolute, root));
    } else if (entry.isFile() && entry.name.endsWith(".test.mjs")) {
      discovered.push(path.relative(root, absolute));
    }
  }

  return discovered;
}

async function run() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    fail(error instanceof Error ? error.message : "Invalid arguments.");
    return;
  }

  const repositoryRoot = path.resolve(import.meta.dirname, "..");
  const testsRoot = path.join(repositoryRoot, "tests");
  let files;
  try {
    files = (await discover(testsRoot)).sort((left, right) => left.localeCompare(right));
  } catch (error) {
    fail(
      error instanceof Error
        ? `the tests directory could not be read (${error.message})`
        : "the tests directory could not be read",
    );
    return;
  }

  if (options.exact) {
    files = files.filter((file) => file === options.exact);
  } else if (options.prefix) {
    files = files.filter((file) => path.basename(file).startsWith(options.prefix));
  }

  if (files.length === 0) {
    fail("zero test files were discovered");
    return;
  }

  if (options.requireProductionSuites) {
    const discoveredNames = new Set(files.map((file) => path.basename(file)));
    const missing = requiredProductionSuites.filter((file) => !discoveredNames.has(file));
    if (missing.length > 0) {
      fail(`required production suites are missing: ${missing.join(", ")}`);
      return;
    }
  }

  console.log(`Discovered ${files.length} Node test files.`);
  if (options.discoveryOnly) return;

  const child = spawn(
    process.execPath,
    ["--test", "--test-concurrency=1", ...files.map((file) => path.join("tests", file))],
    {
      cwd: repositoryRoot,
      env: process.env,
      stdio: "inherit",
    },
  );

  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Node test runner stopped after signal ${signal}.`));
        return;
      }
      resolve(code ?? 1);
    });
  });
  process.exitCode = exitCode;
}

await run().catch((error) => {
  fail(error instanceof Error ? error.message : "the test runner failed");
});
