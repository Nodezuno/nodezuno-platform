#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { closeSync, fsyncSync, openSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { forbiddenSourceReason } from "./source-policy.mjs";

const root = realpathSync(path.resolve(import.meta.dirname, ".."));
const argumentsList = process.argv.slice(2);
if (argumentsList[0] === "--") argumentsList.shift();
const destination = argumentsList[0];
if (!destination || argumentsList.length !== 1) {
  console.error("Usage: pnpm run release:source:export /absolute/existing/output-directory");
  process.exit(1);
}

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

let createdArchive = null;
let createdManifest = null;

try {
  if (!path.isAbsolute(destination)) throw new Error("Choose an absolute output directory.");
  const outputDirectory = realpathSync(destination);
  const relative = path.relative(root, outputDirectory);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    throw new Error("Export outside the repository to an existing private directory.");
  }
  const commit = git("rev-parse", "--verify", "HEAD^{commit}").trim();
  // The same reviewed-commit, required-source and immutable-tool gates protect exports.
  execFileSync(process.execPath, [path.join(root, "scripts/verify-source-integrity.mjs")], {
    cwd: root, stdio: "inherit",
  });
  if (git("rev-parse", "--verify", "HEAD^{commit}").trim() !== commit ||
      git("status", "--porcelain=v1", "--untracked-files=all").trim()) {
    throw new Error("Source changed during validation. Review the clean commit and retry.");
  }
  const entries = git("ls-tree", "-rz", commit).split("\0").filter(Boolean);
  const files = entries.map((entry) => {
    const match = /^(100644|100755) blob [0-9a-f]+\t([^\0]+)$/.exec(entry);
    if (!match) throw new Error("Committed source must contain regular files only, not symlinks or submodules.");
    const file = match[2];
    if (forbiddenSourceReason(file)) throw new Error(`Unsafe committed source path: ${file}`);
    return file;
  });
  const filename = `nodezuno-source-${commit}.tar.gz`;
  const archive = path.join(outputDirectory, filename);
  const descriptor = openSync(archive, "wx", 0o600);
  createdArchive = archive;
  try {
    // Archive immutable Git objects, never the working directory or local secrets.
    execFileSync("git", ["archive", "--format=tar.gz", "--prefix=nodezuno.com/", commit], {
      cwd: root, stdio: ["ignore", descriptor, "pipe"],
    });
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(archive)) hash.update(chunk);
  const sha256 = hash.digest("hex");
  const manifestPath = `${archive}.manifest.json`;
  const manifestDescriptor = openSync(manifestPath, "wx", 0o600);
  createdManifest = manifestPath;
  try {
    writeFileSync(manifestDescriptor, `${JSON.stringify({
      schemaVersion: 1,
      sourceCommit: commit,
      filename,
      sha256,
      trackedPathCount: files.length,
      createdAt: new Date().toISOString(),
      note: "Tracked-source export. A content-level secret review is still required before sharing.",
    }, null, 2)}\n`);
    fsyncSync(manifestDescriptor);
  } finally {
    closeSync(manifestDescriptor);
  }
  createdArchive = null;
  createdManifest = null;
  console.log(`Created ${filename} and its SHA-256 manifest. Review before sharing.`);
} catch (error) {
  for (const file of [createdManifest, createdArchive]) {
    if (!file) continue;
    try { unlinkSync(file); }
    catch { console.error("An incomplete private export could not be removed. Remove it before retrying."); }
  }
  console.error(error instanceof Error && !error.code ? error.message : "Source export failed. No source was uploaded.");
  process.exitCode = 1;
}
