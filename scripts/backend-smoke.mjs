import assert from "node:assert/strict";

const baseUrl = new URL(process.argv[2] ?? "http://localhost:3000");
if (!new Set(["localhost", "127.0.0.1", "[::1]"]).has(baseUrl.hostname)) {
  throw new Error(
    `The local backend smoke check refuses non-loopback host ${baseUrl.hostname}.`,
  );
}

async function getJson(pathname) {
  const response = await fetch(new URL(pathname, baseUrl), {
    headers: { Accept: "application/json" },
  });
  const body = await response.json();
  assert.equal(response.status, 200, pathname);
  assert.equal(typeof body.requestId, "string", pathname);
  return body;
}

const live = await getJson("/api/v1/live");
assert.equal(live.data.status, "alive");

const status = await getJson("/api/v1/status");
assert.ok(Array.isArray(status.data.services));
assert.ok(
  status.data.services.every(
    (service) =>
      !/rpc|grpc|developer.workspace|node.attachment|explorer/i.test(
        `${service.slug} ${service.name}`,
      ),
  ),
);

const chains = await getJson("/api/v1/chains");
assert.ok(Array.isArray(chains.data.chains));

const auth = await getJson("/api/v1/auth/providers");
assert.equal(typeof auth.data.providers.email, "boolean");

const removedProductRouteResponses = await Promise.all(
  ["GET", "POST"].map((method) =>
    fetch(new URL("/api/v1/rpc/legacy-service", baseUrl), { method }),
  ),
);
assert.ok(
  removedProductRouteResponses.every((response) =>
    [404, 405].includes(response.status),
  ),
  "The retired RPC route must not serve requests.",
);

process.stdout.write("Nodezuno website backend smoke check passed.\n");
