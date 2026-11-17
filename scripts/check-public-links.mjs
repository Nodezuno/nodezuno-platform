const suppliedOrigin = process.argv.slice(2).find((value) => value !== "--");
if (!suppliedOrigin) {
  fail("Usage: pnpm run smoke:links -- https://nodezuno.com");
}

const base = normalizeBaseOrigin(suppliedOrigin);
const pending = new Set([
  "/",
  "/robots.txt",
  "/sitemap.xml",
  "/signup",
  "/login",
  "/forgot-password",
]);
const visited = new Map();
const anchors = [];
const redirects = [];
const failures = [];
const maximumTargets = 300;
const concurrency = 8;

while (pending.size > 0 && visited.size < maximumTargets) {
  const batch = [...pending].slice(0, concurrency);
  for (const target of batch) pending.delete(target);
  await Promise.all(batch.map(checkTarget));
}

if (pending.size > 0) {
  failures.push(
    `The crawl exceeded its ${maximumTargets}-target safety limit.`,
  );
}

for (const { source, target, fragment } of anchors) {
  const result = visited.get(target);
  if (!result || result.kind !== "html") {
    failures.push(
      `${source} links to #${fragment} on ${target}, but that page did not return HTML.`,
    );
    continue;
  }
  const encodedFragment = escapeRegularExpression(fragment);
  if (!new RegExp(`\\bid=["']${encodedFragment}["']`).test(result.body)) {
    failures.push(
      `${source} links to missing anchor ${target}#${fragment}.`,
    );
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exitCode = 1;
} else {
  for (const redirect of redirects) console.info(`REDIRECT ${redirect}`);
  console.log(
    `Verified ${visited.size} same-origin pages and assets at ${base.origin}.`,
  );
}

async function checkTarget(target) {
  if (visited.has(target)) return;
  const url = new URL(target, base);
  if (url.origin !== base.origin) return;

  let response;
  try {
    response = await fetchWithTimeout(url);
  } catch (error) {
    failures.push(
      `${target} could not be fetched: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    visited.set(target, { kind: "failed", body: "" });
    return;
  }

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location) {
      failures.push(`${target} returned ${response.status} without Location.`);
      visited.set(target, { kind: "failed", body: "" });
      return;
    }
    const destination = new URL(location, url);
    if (destination.origin !== base.origin) {
      failures.push(`${target} redirects outside the checked origin.`);
      visited.set(target, { kind: "failed", body: "" });
      return;
    }
    redirects.push(`${target} -> ${destination.pathname}${destination.search}${destination.hash}`);
    visited.set(target, { kind: "redirect", body: "" });
    enqueue(destination);
    return;
  }

  if (!response.ok) {
    await response.body?.cancel();
    failures.push(`${target} returned HTTP ${response.status}.`);
    visited.set(target, { kind: "failed", body: "" });
    return;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (/^(?:application|text)\/(?:[a-z0-9.+-]*\+)?xml\b/i.test(contentType)) {
    const body = await response.text();
    visited.set(target, { kind: "xml", body });
    for (const match of body.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
      const rawLocation = decodeHtmlAttribute(match[1]);
      let destination;
      try {
        destination = new URL(rawLocation, url);
      } catch {
        failures.push(`${target} contains an invalid sitemap URL: ${rawLocation}`);
        continue;
      }
      if (
        isLoopbackOrigin(base) &&
        destination.origin === "https://nodezuno.com"
      ) {
        destination = new URL(
          `${destination.pathname}${destination.search}${destination.hash}`,
          base,
        );
      }
      if (destination.origin !== base.origin) {
        failures.push(`${target} contains a cross-origin sitemap URL: ${rawLocation}`);
        continue;
      }
      enqueue(destination);
    }
    return;
  }

  if (!/^text\/html\b/i.test(contentType)) {
    await response.body?.cancel();
    visited.set(target, { kind: "asset", body: "" });
    return;
  }

  const body = await response.text();
  visited.set(target, { kind: "html", body });
  for (const match of body.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)) {
    const href = decodeHtmlAttribute(match[1]);
    if (
      !href ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:")
    ) {
      continue;
    }
    if (href.startsWith("javascript:")) {
      failures.push(`${target} contains a javascript: link.`);
      continue;
    }
    let destination;
    try {
      destination = new URL(href, url);
    } catch {
      failures.push(`${target} contains an invalid link: ${href}`);
      continue;
    }
    if (destination.origin !== base.origin) continue;
    const fragment = safeDecodeFragment(destination.hash);
    destination.hash = "";
    const destinationTarget = `${destination.pathname}${destination.search}`;
    if (fragment) {
      anchors.push({
        source: target,
        target: destinationTarget,
        fragment,
      });
    }
    enqueue(destination);
  }
}

function enqueue(url) {
  if (url.origin !== base.origin) return;
  url.hash = "";
  const target = `${url.pathname}${url.search}`;
  if (!visited.has(target)) pending.add(target);
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetch(url, {
      cache: "no-store",
      credentials: "omit",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.5",
        "User-Agent": "Nodezuno release link checker",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeBaseOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("The link-check origin must be an absolute URL.");
  }
  const local =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if ((!local && url.protocol !== "https:") || url.pathname !== "/") {
    fail("Use an HTTPS origin or a loopback HTTP origin without a path.");
  }
  url.search = "";
  url.hash = "";
  return url;
}

function isLoopbackOrigin(url) {
  return (
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1")
  );
}

function decodeHtmlAttribute(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function safeDecodeFragment(value) {
  if (!value) return "";
  try {
    return decodeURIComponent(value.slice(1));
  } catch {
    return "";
  }
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
