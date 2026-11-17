import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = process.cwd();
const artifactRoot = path.resolve(repositoryRoot, process.argv[2] ?? "dist");
const forbiddenEnvironmentFile = /^(?:\.dev\.vars(?:\..*)?|\.env(?:\..*)?)$/;
const secretName = /(?:SECRET|TOKEN|PEPPER|API_KEY|CLIENT_SECRET|PRIVATE_KEY|PASSWORD|CREDENTIAL)/i;

async function collectFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(absolutePath));
    else if (entry.isFile()) files.push(absolutePath);
  }
  return files;
}

function localSecretValues(source) {
  return source
    .split(/\r?\n/)
    .flatMap((line) => {
      const separator = line.indexOf("=");
      if (separator <= 0) return [];
      const name = line.slice(0, separator).trim();
      const rawValue = line.slice(separator + 1).trim();
      const value = rawValue.length >= 2 &&
        ["'", "\"", "`"].includes(rawValue[0]) &&
        rawValue.at(-1) === rawValue[0]
        ? rawValue.slice(1, -1)
        : rawValue;
      return secretName.test(name) && value.length > 0
        ? [{ name, value: Buffer.from(value) }]
        : [];
    });
}

let files;
try {
  files = await collectFiles(artifactRoot);
} catch {
  console.error("Cloudflare artifact verification failed: build output is missing or unreadable.");
  process.exit(1);
}

const unsafeFiles = files.filter((file) => forbiddenEnvironmentFile.test(path.basename(file)));
if (unsafeFiles.length > 0) {
  console.error("Cloudflare artifact verification failed: local environment files are present in build output.");
  process.exit(1);
}

let configuredSecrets = [];
try {
  configuredSecrets = localSecretValues(await readFile(path.join(repositoryRoot, ".dev.vars"), "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") {
    console.error("Cloudflare artifact verification failed: local environment could not be checked.");
    process.exit(1);
  }
}

const secretMatches = [];
for (const file of files) {
  const artifact = await readFile(file);
  for (const secret of configuredSecrets) {
    if (artifact.includes(secret.value)) secretMatches.push(secret.name);
  }
}

if (secretMatches.length > 0) {
  console.error(
    `Cloudflare artifact verification failed: local secret values were found (${[...new Set(secretMatches)].join(", ")}).`,
  );
  process.exit(1);
}

console.log("Cloudflare artifact verification passed: no local environment files or configured local secrets are present.");
