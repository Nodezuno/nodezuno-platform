import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  executeControlPlaneCommand,
  NodezunoCliError,
  normalizeControlPlaneOrigin,
  parseCliArguments,
  readServiceManagementKey,
} from "../scripts/nodezuno.mjs";

const key =
  "nzu_live_11111111-1111-4111-8111-111111111111_" +
  "a".repeat(43);
const serviceId = "22222222-2222-4222-8222-222222222222";
const apiKeyId = "33333333-3333-4333-8333-333333333333";
const environment = {
  NODEZUNO_API_KEY: key,
  NODEZUNO_API_ORIGIN: "https://api.nodezuno.com",
};

test("CLI origins and secrets fail closed", () => {
  assert.equal(
    normalizeControlPlaneOrigin("https://nodezuno.com").origin,
    "https://nodezuno.com",
  );
  assert.equal(
    normalizeControlPlaneOrigin("http://localhost:3000").origin,
    "http://localhost:3000",
  );
  for (const unsafe of [
    "http://nodezuno.com",
    "https://user:pass@nodezuno.com",
    "https://nodezuno.com/api",
    "https://nodezuno.com/?secret=value",
  ]) {
    assert.throws(
      () => normalizeControlPlaneOrigin(unsafe),
      NodezunoCliError,
    );
  }
  assert.equal(readServiceManagementKey(environment), key);
  assert.throws(
    () => readServiceManagementKey({ NODEZUNO_API_KEY: "invalid" }),
    (error) =>
      error instanceof NodezunoCliError && error.exitCode === 2,
  );
});

test("CLI parser accepts exact service automation commands", () => {
  const get = parseCliArguments(
    ["services", "get", serviceId],
    environment,
  );
  assert.equal(get.kind, "services.get");
  assert.equal(get.serviceId, serviceId);

  const create = parseCliArguments(
    [
      "services",
      "create",
      "--product",
      "rpc-api",
      "--name",
      "Ethereum production",
      "--environment",
      "production",
      "--network",
      "ethereum",
      "--region",
      "global",
      "--idempotency-key",
      "customer-deploy-0001",
    ],
    environment,
  );
  assert.equal(create.kind, "services.create");
  assert.equal(create.input.name, "Ethereum production");
  assert.equal(create.idempotencyKey, "customer-deploy-0001");

  const usage = parseCliArguments(
    ["services", "usage", serviceId, "--window", "30d"],
    environment,
  );
  assert.equal(usage.kind, "services.usage");
  assert.equal(usage.window, "30d");

  const rename = parseCliArguments(
    [
      "services",
      "rename",
      serviceId,
      "--name",
      "Ethereum primary",
      "--updated-at",
      "2026-07-18T10:20:30.000Z",
    ],
    environment,
  );
  assert.equal(rename.kind, "services.rename");
  assert.deepEqual(rename.input, {
    name: "Ethereum primary",
    updatedAt: "2026-07-18T10:20:30.000Z",
  });

  const policy = parseCliArguments(
    ["services", "policy", "set", serviceId, "--file", "policy.json"],
    environment,
  );
  assert.equal(policy.kind, "services.policy.set");
  assert.equal(policy.file, "policy.json");

  assert.throws(
    () =>
      parseCliArguments(
        ["services", "archive", "not-a-service"],
        environment,
      ),
    (error) =>
      error instanceof NodezunoCliError && error.exitCode === 2,
  );
  assert.throws(
    () =>
      parseCliArguments(
        ["services", "get", serviceId, "--unexpected"],
        environment,
      ),
    (error) =>
      error instanceof NodezunoCliError && error.exitCode === 2,
  );
  assert.throws(
    () =>
      parseCliArguments(
        ["services", "get", "not-a-service"],
        environment,
      ),
    (error) =>
      error instanceof NodezunoCliError && error.exitCode === 2,
  );
  assert.throws(
    () =>
      parseCliArguments(
        [
          "services",
          "create",
          "--product",
          "rpc-api",
          "--name",
          "Ethereum",
          "--environment",
          "production",
          "--network",
          "ethereum",
          "--region",
          "global",
          "--idempotency-key",
          "short",
        ],
        environment,
      ),
    (error) =>
      error instanceof NodezunoCliError && error.exitCode === 2,
  );
  assert.throws(
    () =>
      parseCliArguments(
        [
          "services",
          "rename",
          serviceId,
          "--name",
          "Ethereum",
          "--updated-at",
          "2026-07-18T10:20:30Z",
        ],
        environment,
      ),
    (error) =>
      error instanceof NodezunoCliError && error.exitCode === 2,
  );
});

test("CLI sends management bearer auth without redirects or cookies", async () => {
  const requests = [];
  const result = await executeControlPlaneCommand(
    parseCliArguments(["services", "list"], environment),
    {
      environment,
      fetchImplementation: async (url, init) => {
        requests.push({ url: url.href, init });
        return jsonResponse({
          data: { services: [] },
          requestId: "request-1",
        });
      },
    },
  );
  assert.deepEqual(result.data.services, []);
  assert.equal(
    requests[0].url,
    "https://api.nodezuno.com/api/v1/control-plane/services",
  );
  assert.equal(
    requests[0].init.headers.get("authorization"),
    `Bearer ${key}`,
  );
  assert.equal(requests[0].init.headers.has("cookie"), false);
  assert.equal(requests[0].init.redirect, "manual");
});

test("CLI parses service guardrails and least-privilege key lifecycle commands", () => {
  const guardrail = parseCliArguments(
    [
      "services",
      "guardrail",
      "set",
      serviceId,
      "--limit",
      "5000",
      "--warning-percent",
      "80",
      "--revision",
      "3",
    ],
    environment,
  );
  assert.deepEqual(guardrail.input, {
    hourlyQuotaLimit: 5000,
    warningThresholdPercent: 80,
    revision: 3,
  });

  const created = parseCliArguments(
    [
      "keys",
      "create",
      "--name",
      "Ethereum callable",
      "--scope",
      "rpc:invoke",
      "--service-id",
      serviceId,
      "--idempotency-key",
      "customer-key-create-0001",
    ],
    environment,
  );
  assert.deepEqual(created.input, {
    name: "Ethereum callable",
    serviceId,
    scopes: ["rpc:invoke"],
  });
  assert.equal(created.idempotencyKey, "customer-key-create-0001");

  const rotate = parseCliArguments(
    [
      "keys",
      "rotate",
      apiKeyId,
      "--name",
      "Replacement automation",
      "--idempotency-key",
      "customer-key-rotate-0001",
    ],
    environment,
  );
  assert.equal(rotate.apiKeyId, apiKeyId);
  assert.deepEqual(rotate.input, { name: "Replacement automation" });

  assert.throws(
    () =>
      parseCliArguments(
        [
          "keys",
          "create",
          "--name",
          "Unsafe manager",
          "--scope",
          "services:manage",
          "--service-id",
          serviceId,
        ],
        environment,
      ),
    NodezunoCliError,
  );
  assert.throws(
    () =>
      parseCliArguments(
        [
          "services",
          "guardrail",
          "set",
          serviceId,
          "--limit",
          "99",
          "--warning-percent",
          "80",
          "--revision",
          "0",
        ],
        environment,
      ),
    NodezunoCliError,
  );
});

test("CLI sends API-key lifecycle requests to exact control-plane routes", async () => {
  const requests = [];
  const create = parseCliArguments(
    [
      "keys",
      "create",
      "--name",
      "Automation manager",
      "--scope",
      "services:manage",
      "--idempotency-key",
      "customer-key-create-0002",
    ],
    environment,
  );
  await executeControlPlaneCommand(create, {
    environment,
    fetchImplementation: recordJsonRequest(requests),
  });
  assert.equal(
    requests[0].url,
    "https://api.nodezuno.com/api/v1/control-plane/api-keys",
  );
  assert.equal(requests[0].init.method, "POST");
  assert.equal(
    requests[0].init.headers.get("idempotency-key"),
    "customer-key-create-0002",
  );

  await executeControlPlaneCommand(
    parseCliArguments(["keys", "revoke", apiKeyId], environment),
    {
      environment,
      fetchImplementation: recordJsonRequest(requests),
    },
  );
  assert.equal(
    requests[1].url,
    `https://api.nodezuno.com/api/v1/control-plane/api-keys/${apiKeyId}`,
  );
  assert.equal(requests[1].init.method, "DELETE");
});

test("CLI reads one service with GET and no request body", async () => {
  const requests = [];
  const result = await executeControlPlaneCommand(
    parseCliArguments(["services", "get", serviceId], environment),
    {
      environment,
      fetchImplementation: recordJsonRequest(requests),
    },
  );
  assert.equal(result.data.service.id, serviceId);
  assert.equal(requests[0].init.method, "GET");
  assert.equal(
    requests[0].url,
    `https://api.nodezuno.com/api/v1/control-plane/services/${serviceId}`,
  );
  assert.equal(Object.hasOwn(requests[0].init, "body"), false);
});

test("CLI creates idempotently and submits policy files exactly", async () => {
  const requests = [];
  const create = parseCliArguments(
    [
      "services",
      "create",
      "--product",
      "rpc-api",
      "--name",
      "Base production",
      "--environment",
      "production",
      "--network",
      "base",
      "--region",
      "global",
      "--idempotency-key",
      "customer-base-0001",
    ],
    environment,
  );
  await executeControlPlaneCommand(create, {
    environment,
    fetchImplementation: recordJsonRequest(requests),
  });
  assert.equal(
    requests[0].init.headers.get("idempotency-key"),
    "customer-base-0001",
  );
  assert.equal(JSON.parse(requests[0].init.body).network, "base");

  const policy = parseCliArguments(
    ["services", "policy", "set", serviceId, "--file", "policy.json"],
    environment,
  );
  await executeControlPlaneCommand(policy, {
    environment,
    readFileImplementation: async () =>
      Buffer.from(
        JSON.stringify({
          revision: 3,
          allowedOrigins: ["https://app.example.com"],
          allowedIpCidrs: [],
          allowedMethods: ["eth_chainId"],
        }),
      ),
    fetchImplementation: recordJsonRequest(requests),
  });
  assert.equal(requests[1].init.method, "PUT");
  assert.equal(
    JSON.parse(requests[1].init.body).revision,
    3,
  );
});

test("CLI renames with PATCH and exact optimistic timestamp", async () => {
  const requests = [];
  const command = parseCliArguments(
    [
      "services",
      "rename",
      serviceId,
      "--name",
      "Base primary",
      "--updated-at",
      "2026-07-18T10:20:30.000Z",
    ],
    environment,
  );
  await executeControlPlaneCommand(command, {
    environment,
    fetchImplementation: recordJsonRequest(requests),
  });
  assert.equal(requests[0].init.method, "PATCH");
  assert.equal(
    requests[0].url,
    `https://api.nodezuno.com/api/v1/control-plane/services/${serviceId}`,
  );
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    name: "Base primary",
    updatedAt: "2026-07-18T10:20:30.000Z",
  });
});

test("CLI rejects redirects and emits bounded problem context", async () => {
  const command = parseCliArguments(["services", "list"], environment);
  await assert.rejects(
    () =>
      executeControlPlaneCommand(command, {
        environment,
        fetchImplementation: async () =>
          new Response(null, {
            status: 302,
            headers: { Location: "https://attacker.example" },
          }),
      }),
    (error) =>
      error instanceof NodezunoCliError &&
      !error.message.includes(key),
  );
  await assert.rejects(
    () =>
      executeControlPlaneCommand(command, {
        environment,
        fetchImplementation: async () =>
          jsonResponse(
            {
              title: "This key cannot manage services.",
              code: "api_key_scope_denied",
              requestId: "request-2",
            },
            403,
          ),
      }),
    (error) =>
      error instanceof NodezunoCliError &&
      error.code === "api_key_scope_denied" &&
      error.requestId === "request-2" &&
      !error.message.includes(key),
  );
});

test("CLI source never prints or accepts the API key as an argument", async () => {
  const source = await readFile(
    new URL("../scripts/nodezuno.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /--api-key/);
  assert.doesNotMatch(source, /console\.log/);
  assert.doesNotMatch(source, /\u2014/);
  assert.match(source, /services get <service-id>/);
});

function recordJsonRequest(requests) {
  return async (url, init) => {
    requests.push({ url: url.href, init });
    return jsonResponse({
      data: { service: { id: serviceId } },
      requestId: "request-ok",
    });
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
