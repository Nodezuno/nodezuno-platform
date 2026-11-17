import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".vinext",
  ".wrangler",
  "coverage",
  "dist",
  "node_modules",
]);
const emDash = String.fromCodePoint(0x2014);

function isProbablyBinary(buffer) {
  const sampleLength = Math.min(buffer.length, 8_192);
  for (let index = 0; index < sampleLength; index += 1) {
    if (buffer[index] === 0) return true;
  }
  return false;
}

async function collectRepositoryFiles(directory = repositoryRoot) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;

    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectRepositoryFiles(absolutePath)));
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

test("repository copy does not contain em dashes", async () => {
  const files = await collectRepositoryFiles();
  const findings = [];

  for (const file of files) {
    const buffer = await readFile(file);
    if (isProbablyBinary(buffer)) continue;

    const relativePath = path.relative(repositoryRoot, file);
    const lines = buffer.toString("utf8").split(/\r?\n/);

    for (const [index, line] of lines.entries()) {
      if (line.includes(emDash)) {
        findings.push(`${relativePath}:${index + 1}`);
      }
    }
  }

  assert.deepEqual(
    findings,
    [],
    `Use periods, commas, colons, or parentheses instead of U+2014. Found:\n${findings.join("\n")}`,
  );
});

test("copy-enabled resources expose visible success and failure feedback", async () => {
  const components = [
    "components/documentation-experience.tsx",
    "components/press-kit-experience.tsx",
  ];

  for (const component of components) {
    const source = await readFile(path.join(repositoryRoot, component), "utf8");
    assert.match(source, /navigator\.clipboard\.writeText/);
    assert.match(source, /aria-live="polite"/);
    assert.match(source, /Copied to clipboard/);
    assert.match(source, /Copy failed\./);
    assert.match(source, /copy-feedback-error/);
  }

  const paymentPortal = await readFile(
    path.join(repositoryRoot, "components/review-order-experience.tsx"),
    "utf8",
  );
  assert.match(paymentPortal, /navigator\.clipboard\.writeText/);
  assert.match(paymentPortal, /aria-live="polite"/);
  assert.match(paymentPortal, /Recipient address copied\./);
  assert.match(paymentPortal, /Exact amount copied\./);
  assert.match(paymentPortal, /Copy was blocked by this browser/);
  assert.match(paymentPortal, /ETHEREUM MAINNET PAYMENT/);
  assert.match(paymentPortal, /USDC/);
  assert.match(paymentPortal, /USDT/);
  assert.match(paymentPortal, /Telegram username \*/);
  assert.match(paymentPortal, /Sanjay will check the transaction manually/);
});
