import assert from "node:assert/strict";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const API_KEY_PATTERN =
  /^nzu_live_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_[A-Za-z0-9_-]{43}$/;

const base = normalizeLoopbackOrigin(
  process.argv.slice(2).find((value) => value !== "--") ??
    "http://localhost:3000",
);
const suffix = crypto.randomUUID();
const email = `self-service-smoke-${suffix}@nodezuno.local`;
const password = `Nodezuno-smoke-${suffix}-safe`;
let cookie = "";
let serviceId = null;
let apiKeyId = null;
let apiKeySecret = null;
let apiKeyRevoked = false;
let serviceArchived = false;
let managementApiKeyId = null;
let managementApiKeySecret = null;
let identityApiKeyId = null;
let identityApiKeySecret = null;
let automatedServiceId = null;

try {
  const signup = await jsonRequest("/api/auth/sign-up/email", {
    method: "POST",
    body: {
      callbackURL: "/console?product=rpc-api",
      email,
      name: "Nodezuno self-service smoke",
      password,
    },
  });
  assert.equal(signup.response.status, 200, "email signup");
  cookie = sessionCookie(signup.response);

  const session = await jsonRequest("/api/v1/auth/session", {
    cookie,
  });
  assert.equal(session.response.status, 200, "application session");
  assert.equal(session.body.data.user.authMethod, "email");
  assert.equal(session.body.data.user.contactEmail, email);

  const signout = await jsonRequest("/api/auth/sign-out", {
    method: "POST",
    cookie,
    body: {},
  });
  assert.equal(signout.response.status, 200, "session signout");

  const signedOutSession = await jsonRequest(
    "/api/v1/auth/session",
    { cookie },
  );
  assert.equal(signedOutSession.response.status, 200);
  assert.equal(signedOutSession.body.data.user, null);
  cookie = "";

  const signin = await jsonRequest("/api/auth/sign-in/email", {
    method: "POST",
    body: {
      callbackURL: "/console?product=rpc-api",
      email,
      password,
    },
  });
  assert.equal(signin.response.status, 200, "email signin");
  cookie = sessionCookie(signin.response);

  const signedInSession = await jsonRequest(
    "/api/v1/auth/session",
    { cookie },
  );
  assert.equal(signedInSession.response.status, 200);
  assert.equal(signedInSession.body.data.user.authMethod, "email");
  assert.equal(signedInSession.body.data.user.contactEmail, email);

  const initialWorkspace = await jsonRequest(
    "/api/v1/developer/workspace",
    { cookie },
  );
  assert.equal(initialWorkspace.response.status, 200);
  assert.equal(initialWorkspace.body.data.workspace, null);

  const workspace = await jsonRequest("/api/v1/developer/workspace", {
    method: "POST",
    cookie,
    body: { name: `Smoke Company ${suffix.slice(0, 8)}` },
  });
  assert.equal(workspace.response.status, 201, "workspace creation");
  assert.equal(workspace.body.data.created, true);
  assert.equal(workspace.body.data.workspace.role, "owner");

  const service = await jsonRequest("/api/v1/developer/services", {
    method: "POST",
    cookie,
    idempotencyKey: `smoke-service-${suffix}`,
    body: {
      product: "rpc-api",
      name: "Ethereum smoke gateway",
      environment: "development",
      network: "ethereum",
      region: "global",
    },
  });
  assert.equal(service.response.status, 201, "service creation");
  serviceId = service.body.data.service.id;
  assert.match(serviceId, UUID_V4_PATTERN);
  assert.equal(service.body.data.service.product, "rpc-api");
  assert.equal(service.body.data.service.network, "ethereum");

  const key = await jsonRequest("/api/v1/developer/api-keys", {
    method: "POST",
    cookie,
    idempotencyKey: `smoke-rpc-key-${suffix}`,
    body: {
      name: "Ethereum smoke key",
      serviceId,
    },
  });
  assert.equal(key.response.status, 201, "API key creation");
  apiKeyId = key.body.data.apiKey.id;
  apiKeySecret = key.body.data.secret;
  assert.match(apiKeyId, UUID_V4_PATTERN);
  assert.ok(
    API_KEY_PATTERN.test(apiKeySecret),
    "API key should use the documented one-time credential format.",
  );
  assert.equal(key.body.data.apiKey.serviceId, serviceId);
  assert.ok(key.body.data.apiKey.scopes.includes("rpc:invoke"));
  assert.equal(
    key.response.headers.get("cache-control"),
    "no-store, max-age=0",
  );

  const managementKey = await jsonRequest(
    "/api/v1/developer/api-keys",
    {
      method: "POST",
      cookie,
      idempotencyKey: `smoke-management-key-${suffix}`,
      body: {
        name: "Service automation smoke key",
        serviceId: null,
        scopes: ["services:manage"],
      },
    },
  );
  assert.equal(
    managementKey.response.status,
    201,
    "service management key creation",
  );
  managementApiKeyId = managementKey.body.data.apiKey.id;
  managementApiKeySecret = managementKey.body.data.secret;
  assert.equal(managementKey.body.data.apiKey.serviceId, null);
  assert.deepEqual(managementKey.body.data.apiKey.scopes, [
    "services:manage",
  ]);
  assert.ok(API_KEY_PATTERN.test(managementApiKeySecret));

  const identityKey = await jsonRequest(
    "/api/v1/developer/api-keys",
    {
      method: "POST",
      cookie,
      idempotencyKey: `smoke-identity-key-${suffix}`,
      body: {
        name: "Platform identity smoke key",
        serviceId: null,
      },
    },
  );
  assert.equal(identityKey.response.status, 201, "identity key creation");
  identityApiKeyId = identityKey.body.data.apiKey.id;
  identityApiKeySecret = identityKey.body.data.secret;
  assert.deepEqual(identityKey.body.data.apiKey.scopes, [
    "platform:identity",
  ]);

  const services = await jsonRequest("/api/v1/developer/services", {
    cookie,
  });
  assert.equal(services.response.status, 200, "service listing");
  const listedService = services.body.data.services.find(
    (candidate) => candidate.id === serviceId,
  );
  assert.ok(listedService, "created service should be listed");
  const browserRename = await jsonRequest(
    `/api/v1/developer/services/${serviceId}`,
    {
      method: "PATCH",
      cookie,
      body: {
        name: "Ethereum RPC smoke renamed",
        updatedAt: listedService.updatedAt,
      },
    },
  );
  assert.equal(
    browserRename.response.status,
    200,
    "browser service rename",
  );
  assert.equal(
    browserRename.body.data.service.name,
    "Ethereum RPC smoke renamed",
  );
  assert.notEqual(
    browserRename.body.data.service.updatedAt,
    listedService.updatedAt,
  );
  const browserServiceRead = await jsonRequest(
    `/api/v1/developer/services/${serviceId}`,
    { cookie },
  );
  assert.equal(
    browserServiceRead.response.status,
    200,
    "browser service read",
  );
  assert.equal(browserServiceRead.body.data.service.id, serviceId);
  assert.equal(
    browserServiceRead.body.data.service.name,
    "Ethereum RPC smoke renamed",
  );
  assert.match(
    browserServiceRead.response.headers.get("cache-control") ?? "",
    /no-store/,
  );
  assert.match(
    browserServiceRead.response.headers.get("vary") ?? "",
    /Cookie/i,
  );

  const keys = await jsonRequest("/api/v1/developer/api-keys", {
    cookie,
  });
  assert.equal(keys.response.status, 200, "API key listing");
  const listedKey = keys.body.data.apiKeys.find(
    (candidate) => candidate.id === apiKeyId,
  );
  assert.ok(listedKey, "created key should be listed");
  assert.equal(Object.hasOwn(listedKey, "secret"), false);
  assert.equal(Object.hasOwn(listedKey, "secretHash"), false);

  const identity = await jsonRequest("/api/v1/platform/whoami", {
    authorization: `Bearer ${identityApiKeySecret}`,
  });
  assert.equal(identity.response.status, 200, "API key authentication");
  assert.equal(identity.body.data.apiKey.id, identityApiKeyId);
  assert.equal(identity.body.data.apiKey.serviceId, null);

  const leastPrivilegeIdentity = await jsonRequest(
    "/api/v1/platform/whoami",
    {
      authorization: `Bearer ${apiKeySecret}`,
    },
  );
  assert.equal(
    leastPrivilegeIdentity.response.status,
    403,
    "service-bound key scope isolation",
  );
  assert.equal(
    leastPrivilegeIdentity.body.code,
    "api_key_scope_denied",
  );

  const automatedServices = await jsonRequest(
    "/api/v1/control-plane/services",
    {
      authorization: `Bearer ${managementApiKeySecret}`,
    },
  );
  assert.equal(
    automatedServices.response.status,
    200,
    "programmatic service listing",
  );
  assert.ok(
    automatedServices.body.data.services.some(
      (candidate) => candidate.id === serviceId,
    ),
  );
  const automatedServiceRead = await jsonRequest(
    `/api/v1/control-plane/services/${serviceId}`,
    {
      authorization: `Bearer ${managementApiKeySecret}`,
    },
  );
  assert.equal(
    automatedServiceRead.response.status,
    200,
    "programmatic service read",
  );
  const automatedListedService =
    automatedServices.body.data.services.find(
      (candidate) => candidate.id === serviceId,
    );
  assert.deepEqual(
    automatedServiceRead.body.data.service,
    automatedListedService,
  );
  assert.match(
    automatedServiceRead.response.headers.get("cache-control") ?? "",
    /no-store/,
  );
  assert.match(
    automatedServiceRead.response.headers.get("vary") ?? "",
    /Authorization/i,
  );

  const automatedUsage = await jsonRequest(
    `/api/v1/control-plane/services/${serviceId}/usage?window=24h`,
    {
      authorization: `Bearer ${managementApiKeySecret}`,
    },
  );
  assert.equal(
    automatedUsage.response.status,
    200,
    "programmatic usage read",
  );
  assert.equal(automatedUsage.body.data.service.id, serviceId);
  assert.equal(automatedUsage.body.data.series.length, 24);

  const policy = await jsonRequest(
    `/api/v1/control-plane/services/${serviceId}/rpc-access-policy`,
    {
      authorization: `Bearer ${managementApiKeySecret}`,
    },
  );
  assert.equal(policy.response.status, 200, "programmatic policy read");
  const updatedPolicy = await jsonRequest(
    `/api/v1/control-plane/services/${serviceId}/rpc-access-policy`,
    {
      method: "PUT",
      authorization: `Bearer ${managementApiKeySecret}`,
      body: {
        revision: policy.body.data.revision,
        allowedOrigins: [],
        allowedIpCidrs: [],
        allowedMethods: [],
      },
    },
  );
  assert.equal(
    updatedPolicy.response.status,
    200,
    "programmatic policy update",
  );
  assert.equal(
    updatedPolicy.body.data.revision,
    policy.body.data.revision + 1,
  );

  const automatedService = await jsonRequest(
    "/api/v1/control-plane/services",
    {
      method: "POST",
      authorization: `Bearer ${managementApiKeySecret}`,
      idempotencyKey: `smoke-automated-service-${suffix}`,
      body: {
        product: "platform-api",
        name: "Automated platform identity",
        environment: "development",
        network: "global",
        region: "global",
      },
    },
  );
  assert.equal(
    automatedService.response.status,
    201,
    "programmatic service creation",
  );
  automatedServiceId = automatedService.body.data.service.id;
  assert.equal(automatedService.body.data.service.status, "active");
  const automatedRename = await jsonRequest(
    `/api/v1/control-plane/services/${automatedServiceId}`,
    {
      method: "PATCH",
      authorization: `Bearer ${managementApiKeySecret}`,
      body: {
        name: "Automated platform renamed",
        updatedAt: automatedService.body.data.service.updatedAt,
      },
    },
  );
  assert.equal(
    automatedRename.response.status,
    200,
    "programmatic service rename",
  );
  assert.equal(
    automatedRename.body.data.service.name,
    "Automated platform renamed",
  );
  const staleAutomatedRename = await jsonRequest(
    `/api/v1/control-plane/services/${automatedServiceId}`,
    {
      method: "PATCH",
      authorization: `Bearer ${managementApiKeySecret}`,
      body: {
        name: "Stale automated rename",
        updatedAt: automatedService.body.data.service.updatedAt,
      },
    },
  );
  assert.equal(
    staleAutomatedRename.response.status,
    409,
    "stale programmatic rename rejection",
  );
  assert.equal(
    staleAutomatedRename.body.code,
    "service_update_conflict",
  );
  const automatedArchive = await jsonRequest(
    `/api/v1/control-plane/services/${automatedServiceId}`,
    {
      method: "DELETE",
      authorization: `Bearer ${managementApiKeySecret}`,
    },
  );
  assert.equal(
    automatedArchive.response.status,
    200,
    "programmatic service archival",
  );
  assert.equal(automatedArchive.body.data.service.status, "archived");
  automatedServiceId = null;

  const endpointPath = listedService.endpointPath;
  let gatewayState = "configuration-saved";
  if (
    listedService.status === "active" &&
    typeof endpointPath === "string"
  ) {
    assert.equal(endpointPath, `/api/v1/rpc/${serviceId}`);
    const rpc = await jsonRequest(endpointPath, {
      method: "POST",
      authorization: `Bearer ${apiKeySecret}`,
      body: {
        jsonrpc: "2.0",
        id: "self-service-smoke",
        method: "eth_chainId",
        params: [],
      },
    });
    assert.equal(rpc.response.status, 200, "Ethereum RPC request");
    assert.equal(rpc.body.jsonrpc, "2.0");
    assert.equal(rpc.body.id, "self-service-smoke");
    assert.equal(rpc.body.result, "0x1");
    gatewayState = "ethereum-mainnet-request-verified";
  } else {
    assert.equal(listedService.status, "configuration_saved");
    assert.equal(endpointPath, null);
    assert.equal(
      listedService.configuration.provisioning,
      "awaiting_upstream_configuration",
    );
  }

  const diagnosis = await jsonRequest(
    `/api/v1/developer/services/${serviceId}/ai-diagnosis?window=24h`,
    { cookie },
  );
  assert.equal(diagnosis.response.status, 200, "RPC evidence diagnosis");
  assert.equal(diagnosis.body.data.diagnosis.service.id, serviceId);
  assert.equal(diagnosis.body.data.diagnosis.coverage.kind, "operational");
  assert.equal(diagnosis.body.data.diagnosis.engine.mode, "deterministic");
  assert.equal(diagnosis.body.data.diagnosis.engine.modelInvoked, false);
  assert.equal(
    diagnosis.body.data.diagnosis.summary.findingCount,
    diagnosis.body.data.diagnosis.findings.length,
  );
  assert.ok(
    diagnosis.body.data.diagnosis.findings.every(
      (finding) =>
        Array.isArray(finding.evidence) &&
        finding.evidence.length > 0 &&
        Array.isArray(finding.actions) &&
        finding.actions.length > 0,
    ),
    "each diagnosis finding must remain evidence-linked and actionable",
  );

  const revoke = await jsonRequest(
    `/api/v1/developer/api-keys/${apiKeyId}`,
    {
      method: "DELETE",
      cookie,
    },
  );
  assert.equal(revoke.response.status, 200, "API key revocation");
  assert.ok(revoke.body.data.apiKey.revokedAt);
  apiKeyRevoked = true;

  const rejected = await jsonRequest("/api/v1/platform/whoami", {
    authorization: `Bearer ${apiKeySecret}`,
  });
  assert.equal(rejected.response.status, 401, "revoked API key rejection");
  assert.equal(rejected.body.code, "api_key_invalid");
  apiKeySecret = null;

  const revokeManagement = await jsonRequest(
    `/api/v1/developer/api-keys/${managementApiKeyId}`,
    {
      method: "DELETE",
      cookie,
    },
  );
  assert.equal(
    revokeManagement.response.status,
    200,
    "management key revocation",
  );
  const rejectedManagement = await jsonRequest(
    "/api/v1/control-plane/services",
    {
      authorization: `Bearer ${managementApiKeySecret}`,
    },
  );
  assert.equal(
    rejectedManagement.response.status,
    401,
    "revoked management key rejection",
  );
  managementApiKeyId = null;
  managementApiKeySecret = null;

  const revokeIdentity = await jsonRequest(
    `/api/v1/developer/api-keys/${identityApiKeyId}`,
    {
      method: "DELETE",
      cookie,
    },
  );
  assert.equal(
    revokeIdentity.response.status,
    200,
    "identity key revocation",
  );
  identityApiKeyId = null;
  identityApiKeySecret = null;

  const archive = await jsonRequest(
    `/api/v1/developer/services/${serviceId}`,
    {
      method: "DELETE",
      cookie,
    },
  );
  assert.equal(archive.response.status, 200, "service archival");
  assert.equal(archive.body.data.service.status, "archived");
  assert.ok(archive.body.data.service.archivedAt);
  serviceArchived = true;

  const finalServices = await jsonRequest(
    "/api/v1/developer/services",
    { cookie },
  );
  assert.equal(finalServices.response.status, 200);
  assert.equal(
    finalServices.body.data.services.some(
      (candidate) => candidate.id === serviceId,
    ),
    false,
  );

  console.log(
    JSON.stringify({
      account: "email-signup-signout-signin-and-session-verified",
      workspace: "self-provisioned",
      service: "ethereum-rpc-created-and-archived",
      apiKey: "least-privilege-identity-rpc-and-management-keys-verified",
      automation:
        "service-create-list-read-rename-usage-policy-archive-verified",
      gateway: gatewayState,
      diagnosis: "evidence-linked-read-only-analysis-verified",
    }),
  );
} finally {
  apiKeySecret = null;
  managementApiKeySecret = null;
  identityApiKeySecret = null;
  await bestEffortCleanup();
}

async function jsonRequest(pathname, options = {}) {
  const headers = new Headers({ Accept: "application/json" });
  if (options.cookie) headers.set("Cookie", options.cookie);
  if (options.authorization) {
    headers.set("Authorization", options.authorization);
  }
  if (options.idempotencyKey) {
    headers.set("Idempotency-Key", options.idempotencyKey);
  }
  const init = {
    method: options.method ?? "GET",
    redirect: "manual",
    headers,
  };
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    headers.set("Origin", base.origin);
    init.body = JSON.stringify(options.body);
  } else if (init.method !== "GET" && init.method !== "HEAD") {
    headers.set("Origin", base.origin);
  }
  const response = await fetch(new URL(pathname, base), init);
  let body = null;
  try {
    body = await response.clone().json();
  } catch {
    body = null;
  }
  return { response, body };
}

function sessionCookie(response) {
  const values =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);
  const value = values
    .map((candidate) => candidate.split(";", 1)[0])
    .filter(Boolean)
    .join("; ");
  assert.match(value, /nodezuno\.session_token=/);
  return value;
}

function normalizeLoopbackOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "Use an absolute loopback URL for the self-service smoke suite.",
    );
  }
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "The self-service smoke suite refuses every non-loopback or non-HTTP target.",
    );
  }
  return url;
}

async function bestEffortCleanup() {
  for (const id of [managementApiKeyId, identityApiKeyId]) {
    if (!cookie || !id) continue;
    try {
      await jsonRequest(`/api/v1/developer/api-keys/${id}`, {
        method: "DELETE",
        cookie,
      });
    } catch {
      // A failed smoke run still reports its original assertion or request.
    }
  }
  if (cookie && apiKeyId && !apiKeyRevoked) {
    try {
      await jsonRequest(`/api/v1/developer/api-keys/${apiKeyId}`, {
        method: "DELETE",
        cookie,
      });
    } catch {
      // A failed smoke run still reports its original assertion or request.
    }
  }
  if (cookie && automatedServiceId) {
    try {
      await jsonRequest(
        `/api/v1/developer/services/${automatedServiceId}`,
        {
          method: "DELETE",
          cookie,
        },
      );
    } catch {
      // Local-only cleanup is best effort.
    }
  }
  if (cookie && serviceId && !serviceArchived) {
    try {
      await jsonRequest(`/api/v1/developer/services/${serviceId}`, {
        method: "DELETE",
        cookie,
      });
    } catch {
      // Local-only cleanup is best effort.
    }
  }
}
