#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoots = ["app", "components", "lib"];
const allowedHostnames = new Set([
  "accounts.google.com",
  "docs.soliditylang.org",
  "eips.ethereum.org",
  "etherscan.io",
  "getfoundry.sh",
  "myaccount.google.com",
  "www.etherscan.io",
  "www.getfoundry.sh",
]);
const ignoreFile = new URL("./external-link-ignores.json", import.meta.url);
const ignoreEntries = await loadIgnoreEntries(ignoreFile);
const links = new Map();
const sourceFiles = new Set();
const failures = [];
const redirects = [];
const maximumSourceFiles = 50;
const maximumLinks = 25;
const concurrency = 4;

for (const root of sourceRoots) {
  await collectSourceLinks(path.join(projectRoot, root));
}

if (links.size > maximumLinks) {
  fail(`External link count exceeds the ${maximumLinks}-link safety limit.`);
}

const targets = [...links.keys()];
for (let index = 0; index < targets.length; index += concurrency) {
  await Promise.all(targets.slice(index, index + concurrency).map(checkLink));
}

for (const redirect of redirects) console.info(`REDIRECT ${redirect}`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Verified ${targets.length} external references in public source content.`);
}

async function collectSourceLinks(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectSourceLinks(absolute);
      continue;
    }
    if (!entry.isFile() || !/\.(?:ts|tsx|js|jsx|mjs|mdx)$/.test(entry.name)) continue;
    const body = await readFile(absolute, "utf8");
    const matches = [...body.matchAll(/\bhref\s*=\s*["'](https?:\/\/[^"']+)["']/gi)];
    if (matches.length === 0) continue;
    const relative = path.relative(projectRoot, absolute);
    sourceFiles.add(relative);
    if (sourceFiles.size > maximumSourceFiles) {
      fail(`External links appear in more than ${maximumSourceFiles} source files.`);
    }
    for (const match of matches) {
      const raw = decodeHtmlAttribute(match[1]);
      let url;
      try {
        url = new URL(raw);
      } catch {
        failures.push(`${relative} contains an invalid external URL: ${raw}`);
        continue;
      }
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.port ||
        !allowedHostnames.has(url.hostname)
      ) {
        failures.push(`${relative} contains an unapproved external destination: ${raw}`);
        continue;
      }
      url.hash = "";
      const sources = links.get(url.href) ?? new Set();
      sources.add(relative);
      links.set(url.href, sources);
    }
  }
}

async function checkLink(link) {
  const ignored = ignoreEntries.find(({ url }) => url === link);
  if (ignored) {
    console.info(`IGNORED ${link} (${ignored.reason})`);
    return;
  }

  let current = new URL(link);
  const chain = [current.href];
  for (let hop = 0; hop <= 5; hop += 1) {
    let response;
    try {
      response = await request(current, "HEAD");
      if ([401, 403, 405, 429, 501].includes(response.status)) {
        await response.body?.cancel();
        response = await request(current, "GET");
      }
    } catch (error) {
      failures.push(`${link} could not be fetched: ${errorMessage(error)}${sourceSuffix(link)}`);
      return;
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) {
        failures.push(`${current.href} returned ${response.status} without Location.${sourceSuffix(link)}`);
        return;
      }
      if (hop === 5) {
        failures.push(`${link} exceeded the 5-redirect safety limit.${sourceSuffix(link)}`);
        return;
      }
      try {
        current = new URL(location, current);
      } catch {
        failures.push(`${current.href} redirects to an invalid URL: ${location}${sourceSuffix(link)}`);
        return;
      }
      if (
        current.protocol !== "https:" ||
        current.username ||
        current.password ||
        current.port ||
        !allowedHostnames.has(current.hostname)
      ) {
        failures.push(`${link} redirects to an unapproved destination: ${current.href}${sourceSuffix(link)}`);
        return;
      }
      chain.push(current.href);
      continue;
    }

    await response.body?.cancel();
    if (!response.ok) {
      failures.push(`${current.href} returned HTTP ${response.status}.${sourceSuffix(link)}`);
      return;
    }
    if (chain.length > 1) redirects.push(`${chain.join(" -> ")}${sourceSuffix(link)}`);
    return;
  }
}

async function request(url, method) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetch(url, {
      cache: "no-store",
      credentials: "omit",
      headers:
        method === "GET"
          ? { Range: "bytes=0-1023", "User-Agent": "Nodezuno release link checker" }
          : { "User-Agent": "Nodezuno release link checker" },
      method,
      redirect: "manual",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function sourceSuffix(link) {
  const sources = [...(links.get(link) ?? [])];
  return sources.length > 0 ? ` Referenced by ${sources.join(", ")}.` : "";
}

async function loadIgnoreEntries(file) {
  let value;
  try {
    value = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    fail(`Could not read the external-link ignore file: ${errorMessage(error)}`);
  }
  if (!Array.isArray(value)) fail("External-link ignore entries must be an array.");
  return value.map((entry, index) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof entry.url !== "string" ||
      !entry.url.startsWith("https://") ||
      typeof entry.reason !== "string" ||
      entry.reason.trim().length < 8
    ) {
      fail(`External-link ignore entry ${index + 1} needs an exact HTTPS URL and a specific reason.`);
    }
    return { url: entry.url, reason: entry.reason.trim() };
  });
}

function decodeHtmlAttribute(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'");
}

function errorMessage(error) {
  return error instanceof Error ? error.message : "unknown error";
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
