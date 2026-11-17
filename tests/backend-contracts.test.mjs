import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateGasEstimate,
  validateNewsletterPayload,
  validateSubmissionPayload,
} from "../lib/server/contracts.ts";
import {
  assertSameOrigin,
  HttpProblem,
  parseAdminAllowlist,
  readIdempotencyKey,
  readJsonBody,
  readTextBody,
  userFromRequest,
} from "../lib/server/http.ts";
import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
} from "../lib/auth-paths.ts";
import { deriveOverallStatus } from "../lib/server/status.ts";
import { hasLeadingZeroBits } from "../lib/abuse-proof.ts";
import { unsubscribeNewsletter } from "../lib/server/database.ts";
import {
  publicApiEndpoints,
  publicOpenApiDocument,
} from "../lib/public-api.ts";
import { internalOpenApiDocument } from "../lib/api/internal.ts";

const validSubmission = {
  kind: "sales",
  name: " Ada Lovelace ",
  email: "ADA@EXAMPLE.COM",
  company: "Analytical Engines",
  team: "Infrastructure / developer tools",
  message:
    "We are evaluating a policy-aware transaction infrastructure architecture.",
  consent: true,
  sourcePath: "/contact/sales?utm_source=test",
  website: "",
  utmSource: "test",
  utmMedium: null,
  utmCampaign: null,
};

test("submission validation normalizes a complete request", () => {
  const result = validateSubmissionPayload(validSubmission);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.name, "Ada Lovelace");
  assert.equal(result.value.email, "ada@example.com");
  assert.equal(result.value.kind, "sales");
  assert.equal(result.value.sourcePath, "/contact/sales");
});

test("submission validation rejects unknown, missing, and unsafe fields", () => {
  const unknown = validateSubmissionPayload({
    ...validSubmission,
    isAdmin: true,
  });
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.match(unknown.fields.body, /unsupported/i);

  const invalid = validateSubmissionPayload({
    ...validSubmission,
    email: "not-an-email",
    message: "short",
    consent: false,
    sourcePath: "https://evil.example/",
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.match(invalid.fields.email, /valid/i);
    assert.match(invalid.fields.message, /20/);
    assert.match(invalid.fields.consent, /required/i);
    assert.match(invalid.fields.sourcePath, /same-site/i);
  }
});

test("security contact limits sensitive detail length", () => {
  const result = validateSubmissionPayload({
    ...validSubmission,
    kind: "security_contact",
    message: "x".repeat(1501),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.fields.message, /1500/);
});

test("campaign attribution is bounded and never blocks a valid request", () => {
  const result = validateSubmissionPayload({
    ...validSubmission,
    sourcePath: `/contact/sales?utm_campaign=${"x".repeat(1000)}`,
    utmSource: 42,
    utmMedium: `paid\u0000social`,
    utmCampaign: "x".repeat(180),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.sourcePath, "/contact/sales");
  assert.equal(result.value.utmSource, null);
  assert.equal(result.value.utmMedium, "paidsocial");
  assert.equal(result.value.utmCampaign?.length, 100);
});

test("newsletter validation is strict and normalizes email", () => {
  const result = validateNewsletterPayload({
    email: " NEWS@EXAMPLE.COM ",
    name: " Grace ",
    consent: true,
    sourcePath: "/community/newsletter",
    website: "",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.email, "news@example.com");
  assert.equal(result.value.name, "Grace");
});

test("newsletter unsubscribe is conditional on the current token inside one batch", async () => {
  const currentTokenHash = "current-token-hash";
  const staleTokenHash = "stale-token-hash";
  const row = {
    id: "subscription-1",
    tokenHash: currentTokenHash,
    state: "pending",
    updatedAt: 100,
  };
  const outbox = [];
  const database = createNewsletterRaceDatabase(row, outbox);

  assert.equal(
    await unsubscribeNewsletter(staleTokenHash, 200, database),
    false,
  );
  assert.equal(row.state, "pending");
  assert.equal(outbox.length, 0);

  assert.equal(
    await unsubscribeNewsletter(currentTokenHash, 201, database),
    true,
  );
  assert.equal(row.state, "unsubscribed");
  assert.equal(row.updatedAt, 201);
  assert.equal(outbox.length, 1);
});

test("OpenAPI readiness and mutation errors match route contracts", () => {
  const readiness =
    publicOpenApiDocument.paths["/api/v1/ready"].get.responses;
  assert.equal(
    readiness["200"].content["application/json"].schema.$ref,
    "#/components/schemas/ReadinessEnvelope",
  );
  assert.equal(
    readiness["503"].content["application/json"].schema.$ref,
    "#/components/schemas/ReadinessEnvelope",
  );
  assert.deepEqual(
    publicOpenApiDocument.components.schemas.ReadinessEnvelope.properties
      .data.properties.status.enum,
    ["ready", "not_ready"],
  );

  const expectedErrors = {
    "/api/v1/gas-estimate": ["400", "403", "413", "415", "422", "503"],
    "/api/v1/submissions": [
      "400",
      "403",
      "409",
      "413",
      "415",
      "422",
      "429",
      "503",
    ],
    "/api/v1/newsletter/subscriptions": [
      "400",
      "403",
      "413",
      "415",
      "422",
      "429",
      "503",
    ],
    "/api/v1/newsletter/confirm": [
      "400",
      "403",
      "413",
      "415",
      "422",
      "429",
      "503",
    ],
    "/api/v1/newsletter/unsubscribe": [
      "400",
      "403",
      "413",
      "415",
      "422",
      "429",
      "503",
    ],
  };
  for (const [path, statuses] of Object.entries(expectedErrors)) {
    const responses = publicOpenApiDocument.paths[path].post.responses;
    for (const status of statuses) {
      assert.ok(responses[status], `${path} should document ${status}`);
    }
  }
});

test("OpenAPI publishes the self-service control-plane contracts", () => {
  const paths = publicOpenApiDocument.paths;
  assert.ok(paths["/api/v1/auth/providers"].get);
  assert.ok(paths["/api/v1/auth/session"].get);
  assert.ok(paths["/api/v1/developer/workspace"].get);
  assert.ok(paths["/api/v1/developer/workspace"].post);
  assert.ok(paths["/api/v1/developer/workspace/members"].get);
  assert.ok(paths["/api/v1/developer/workspace/members"].post);
  assert.ok(paths["/api/v1/developer/workspace/members/{id}"].put);
  assert.ok(paths["/api/v1/developer/workspace/members/{id}"].delete);
  assert.ok(paths["/api/v1/developer/workspace/audit-events"].get);
  assert.ok(paths["/api/v1/developer/api-keys"].get);
  assert.ok(paths["/api/v1/developer/api-keys"].post);
  assert.ok(paths["/api/v1/developer/api-keys/{id}"].delete);
  assert.ok(paths["/api/v1/developer/api-keys/{id}/rotate"].post);
  assert.ok(paths["/api/v1/developer/services"].get);
  assert.ok(paths["/api/v1/developer/services"].post);
  assert.ok(paths["/api/v1/developer/services/{id}"].get);
  assert.ok(paths["/api/v1/developer/services/{id}"].patch);
  assert.ok(paths["/api/v1/developer/services/{id}"].delete);
  assert.ok(paths["/api/v1/control-plane/services"].get);
  assert.ok(paths["/api/v1/control-plane/services"].post);
  assert.ok(paths["/api/v1/control-plane/services/{id}"].get);
  assert.ok(paths["/api/v1/control-plane/services/{id}"].patch);
  assert.ok(paths["/api/v1/control-plane/services/{id}"].delete);
  assert.ok(paths["/api/v1/control-plane/services/{id}/usage"].get);
  assert.ok(
    paths[
      "/api/v1/control-plane/services/{id}/rpc-access-policy"
    ].get,
  );
  assert.ok(
    paths[
      "/api/v1/control-plane/services/{id}/rpc-access-policy"
    ].put,
  );
  assert.ok(paths["/api/v1/developer/services/{id}/usage"].get);
  assert.ok(
    paths["/api/v1/developer/services/{id}/rpc-access-policy"].get,
  );
  assert.ok(
    paths["/api/v1/developer/services/{id}/rpc-access-policy"].put,
  );
  assert.ok(paths["/api/v1/rpc/{serviceId}"].options);
  assert.ok(paths["/api/v1/rpc/{serviceId}"].post);
  assert.equal(paths["/api/v1/internal/grpc/authorize"], undefined);
  assert.equal(Object.keys(paths).some((pathname) => /\/(internal|admin)\//.test(pathname)), false);
  assert.equal(publicOpenApiDocument.components.securitySchemes.grpcControlPlaneSecret, undefined);
  assert.equal(publicOpenApiDocument.components.schemas.GrpcAuthorizationInput, undefined);
  assert.equal(publicOpenApiDocument.components.schemas.GrpcAuthorizationEnvelope, undefined);
  assert.doesNotMatch(JSON.stringify(publicOpenApiDocument), /"x-nodezuno-internal"/);
  const internalOperation = internalOpenApiDocument.paths["/api/v1/internal/grpc/authorize"].post;
  assert.equal(
    publicOpenApiDocument.components.schemas.AuthProvidersEnvelope.properties
      .data.properties.providers.properties.emailVerification.type,
    "boolean",
  );
  assert.equal(
    publicOpenApiDocument.components.schemas.AuthProvidersEnvelope.properties
      .data.properties.providers.properties.email.type,
    "boolean",
  );
  assert.deepEqual(
    paths["/api/v1/platform/whoami"].get.security,
    [{ developerApiKey: [] }],
  );
  assert.equal(
    publicOpenApiDocument.components.securitySchemes.developerApiKey.scheme,
    "bearer",
  );
  assert.deepEqual(
    internalOperation.security,
    [{ grpcControlPlaneSecret: [] }],
  );
  assert.equal(
    internalOperation[
      "x-nodezuno-internal"
    ],
    true,
  );
  assert.equal(
    internalOperation.requestBody.content[
      "application/json"
    ].schema.$ref,
    "#/components/schemas/GrpcAuthorizationInput",
  );
  assert.equal(
    internalOpenApiDocument.components.schemas.GrpcAuthorizationInput
      .properties.apiKey.writeOnly,
    true,
  );
  assert.deepEqual(
    publicOpenApiDocument.components.schemas.DeveloperApiKeyMetadata
      .properties.scopes.items.enum,
    [
      "platform:identity",
      "services:manage",
      "rpc:invoke",
      "grpc:invoke",
    ],
  );
  assert.deepEqual(
    paths["/api/v1/control-plane/services"].post.security,
    [{ developerApiKey: [] }],
  );
  assert.equal(
    paths["/api/v1/control-plane/services"].post[
      "x-nodezuno-required-scope"
    ],
    "services:manage",
  );
  assert.equal(
    paths["/api/v1/control-plane/services/{id}"].get[
      "x-nodezuno-required-scope"
    ],
    "services:manage",
  );
  assert.deepEqual(
    paths["/api/v1/control-plane/services/{id}"].get.security,
    [{ developerApiKey: [] }],
  );
  assert.equal(
    paths["/api/v1/control-plane/services/{id}"].patch[
      "x-nodezuno-required-scope"
    ],
    "services:manage",
  );
  assert.equal(
    paths["/api/v1/control-plane/services/{id}"].delete[
      "x-nodezuno-required-scope"
    ],
    "services:manage",
  );
  assert.equal(
    paths["/api/v1/control-plane/services/{id}/usage"].get[
      "x-nodezuno-required-scope"
    ],
    "services:manage",
  );
  assert.equal(
    paths[
      "/api/v1/control-plane/services/{id}/rpc-access-policy"
    ].put["x-nodezuno-required-scope"],
    "services:manage",
  );
  const keyInput =
    paths["/api/v1/developer/api-keys"].post.requestBody.content[
      "application/json"
    ].schema;
  assert.equal(keyInput.properties.scopes.maxItems, 1);
  assert.match(
    paths["/api/v1/developer/api-keys"].post.description,
    /least-privilege scope/,
  );
  for (const path of [
    "/api/v1/developer/api-keys",
    "/api/v1/developer/services",
    "/api/v1/developer/api-keys/{id}/rotate",
  ]) {
    const idempotency = paths[path].post.parameters.find(
      (parameter) => parameter.name === "Idempotency-Key",
    );
    assert.equal(idempotency.required, true);
    assert.equal(idempotency.schema.minLength, 16);
    assert.equal(idempotency.schema.maxLength, 128);
  }
  assert.deepEqual(
    paths["/api/v1/developer/api-keys/{id}/rotate"].post[
      "x-nodezuno-roles"
    ],
    ["owner", "admin"],
  );
  assert.equal(
    paths["/api/v1/developer/api-keys/{id}/rotate"].post.responses["201"]
      .content["application/json"].schema.$ref,
    "#/components/schemas/DeveloperApiKeyCreateEnvelope",
  );
  assert.match(
    paths["/api/v1/developer/api-keys/{id}/rotate"].post.description,
    /one database batch/,
  );
  assert.deepEqual(
    paths["/api/v1/developer/workspace/members/{id}"].put[
      "x-nodezuno-roles"
    ],
    ["owner"],
  );
  assert.deepEqual(
    paths["/api/v1/developer/workspace/audit-events"].get[
      "x-nodezuno-roles"
    ],
    ["owner", "admin"],
  );
  assert.equal(
    paths["/api/v1/developer/workspace/audit-events"].get.responses["200"]
      .content["application/json"].schema.$ref,
    "#/components/schemas/DeveloperAuditPageEnvelope",
  );
  assert.equal(
    Object.hasOwn(
      publicOpenApiDocument.components.schemas.DeveloperAuditEvent
        .properties,
      "workspaceId",
    ),
    false,
  );
  assert.deepEqual(
    paths["/api/v1/developer/services/{id}/usage"].get[
      "x-nodezuno-roles"
    ],
    ["owner", "admin", "developer"],
  );
  assert.deepEqual(
    paths["/api/v1/developer/services/{id}/usage"].get.parameters.find(
      (parameter) => parameter.name === "window",
    ).schema.enum,
    ["24h", "7d", "30d"],
  );
  assert.equal(
    paths["/api/v1/developer/services/{id}/usage"].get.responses["200"]
      .content["application/json"].schema.$ref,
    "#/components/schemas/DeveloperRpcUsageEnvelope",
  );
  assert.equal(
    publicOpenApiDocument.components.schemas.DeveloperRpcUsageEnvelope
      .properties.data.properties.series.maxItems,
    30,
  );
  assert.equal(
    Object.hasOwn(
      publicOpenApiDocument.components.schemas.DeveloperRpcUsageApiKey
        .properties,
      "secretHash",
    ),
    false,
  );
  assert.match(
    paths["/api/v1/developer/workspace/members"].post.description,
    /does not claim that an invitation email was delivered/,
  );
  assert.equal(
    paths["/api/v1/developer/services/{id}/rpc-access-policy"].put
      .requestBody.content["application/json"].schema.$ref,
    "#/components/schemas/RpcAccessPolicyUpdate",
  );
  assert.deepEqual(
    paths["/api/v1/developer/services/{id}/rpc-access-policy"].put[
      "x-nodezuno-roles"
    ],
    ["owner", "admin"],
  );
  assert.equal(
    paths["/api/v1/rpc/{serviceId}"].options.responses["204"].headers[
      "Access-Control-Allow-Origin"
    ].schema.format,
    "uri",
  );
  assert.equal(
    JSON.stringify(paths["/api/v1/rpc/{serviceId}"]).includes(
      "Access-Control-Allow-Credentials",
    ),
    false,
  );
  for (const code of [
    "rpc_origin_not_allowed",
    "rpc_ip_not_allowed",
    "rpc_method_not_allowed",
  ]) {
    assert.equal(
      paths["/api/v1/rpc/{serviceId}"].post[
        "x-nodezuno-gateway-error-codes"
      ].includes(code),
      true,
    );
  }
  assert.equal(
    publicOpenApiDocument.components.schemas.DeveloperApiKeyMetadata.required
      .includes("serviceId"),
    true,
  );
  assert.deepEqual(
    publicOpenApiDocument.components.schemas.DeveloperApiKeyMetadata.properties
      .serviceId.type,
    ["string", "null"],
  );
  assert.deepEqual(
    paths["/api/v1/developer/api-keys"].post.requestBody.content[
      "application/json"
    ].schema.required,
    ["name"],
  );
  assert.deepEqual(
    paths["/api/v1/developer/api-keys"].post.requestBody.content[
      "application/json"
    ].schema.properties.serviceId.type,
    ["string", "null"],
  );
  assert.equal(
    Object.hasOwn(
      publicOpenApiDocument.components.schemas.DeveloperApiKeyMetadata
        .properties,
      "secretHash",
    ),
    false,
  );
  assert.deepEqual(
    publicOpenApiDocument.components.schemas.DeveloperService.properties
      .status.enum,
    ["active", "configuration_saved", "archived"],
  );
  assert.equal(
    publicOpenApiDocument.components.schemas.DeveloperServiceInput
      .properties.product.enum.includes("grpc-api"),
    true,
  );
  assert.equal(
    publicOpenApiDocument.components.schemas.DeveloperServiceInput
      .properties.network.enum.includes("avalanche-l1"),
    true,
  );
  assert.deepEqual(
    publicOpenApiDocument.components.schemas.DeveloperServiceInput.allOf[2]
      .then.properties.network.enum,
    [
      "op-stack",
      "arbitrum-orbit",
      "avalanche-l1",
      "polygon-cdk",
      "cosmos-evm",
      "custom-chain",
      "custom-rollup",
    ],
  );
  assert.deepEqual(
    publicOpenApiDocument.components.schemas.DeveloperServiceUpdate.required,
    ["name", "updatedAt"],
  );
  assert.equal(
    publicOpenApiDocument.components.schemas.DeveloperServiceUpdate
      .additionalProperties,
    false,
  );
  assert.equal(
    paths["/api/v1/developer/services/{id}"].patch.requestBody.content[
      "application/json"
    ].schema.$ref,
    "#/components/schemas/DeveloperServiceUpdate",
  );
  assert.equal(
    paths["/api/v1/control-plane/services/{id}"].patch.requestBody.content[
      "application/json"
    ].schema.$ref,
    "#/components/schemas/DeveloperServiceUpdate",
  );
  assert.ok(
    paths["/api/v1/developer/services/{id}"].patch.responses["409"],
  );
  assert.ok(
    paths["/api/v1/control-plane/services/{id}"].patch.responses["409"],
  );
  assert.ok(
    publicOpenApiDocument.components.schemas.DeveloperService.required.includes(
      "telemetry",
    ),
  );
  assert.equal(
    publicOpenApiDocument.components.schemas.DeveloperService.properties
      .telemetry.oneOf[0].$ref,
    "#/components/schemas/DeveloperServiceTelemetry",
  );
  assert.deepEqual(
    paths["/api/v1/rpc/{serviceId}"].post.security,
    [{ developerApiKey: [] }],
  );
  assert.equal(
    paths["/api/v1/rpc/{serviceId}"].post[
      "x-nodezuno-required-scope"
    ],
    "rpc:invoke",
  );
  assert.equal(
    paths["/api/v1/rpc/{serviceId}"].post.operationId,
    "invokeJsonRpc",
  );
  assert.deepEqual(
    paths["/api/v1/rpc/{serviceId}"].post[
      "x-nodezuno-networks"
    ],
    ["ethereum", "base", "solana"],
  );
  assert.deepEqual(
    paths["/api/v1/rpc/{serviceId}"].post[
      "x-nodezuno-routing"
    ],
    {
      strategy: "pulse_adaptive_failover",
      stateScope: "process-local",
      safeReads:
        "verified successful-latency EWMA plus failure and circuit state; at most two attempts",
      writes: "configured primary; exactly one attempt",
    },
  );
  assert.match(
    paths["/api/v1/rpc/{serviceId}"].post.description,
    /adaptive routing, not predictive or machine-learning inference/i,
  );
  assert.equal(
    paths["/api/v1/rpc/{serviceId}"].post[
      "x-nodezuno-chain-verification"
    ].base.result,
    "0x2105",
  );
  assert.deepEqual(
    paths["/api/v1/rpc/{serviceId}"].post[
      "x-nodezuno-chain-verification"
    ].solana.methods,
    ["getGenesisHash", "getHealth"],
  );
  assert.equal(
    paths["/api/v1/rpc/{serviceId}"].post.requestBody.content[
      "application/json"
    ].schema.$ref,
    "#/components/schemas/JsonRpcRequestPayload",
  );
  assert.equal(
    paths["/api/v1/rpc/{serviceId}"].post.responses["400"].content[
      "application/json"
    ].schema.$ref,
    "#/components/schemas/JsonRpcResponsePayload",
  );
  assert.match(
    paths["/api/v1/rpc/{serviceId}"].post.responses["400"]
      .description,
    /-32700.*-32600/,
  );
  assert.match(
    paths["/api/v1/rpc/{serviceId}"].post.description,
    /method-weighted quota units/,
  );
  assert.match(
    paths["/api/v1/rpc/{serviceId}"].post.responses["403"]
      .description,
    /bound to another service/,
  );
  assert.equal(
    publicOpenApiDocument.components.schemas.PlatformIdentityEnvelope
      .properties.data.properties.apiKey.required.includes("serviceId"),
    true,
  );
  assert.deepEqual(
    publicOpenApiDocument.components.schemas.JsonRpcRequest.required,
    ["jsonrpc", "method"],
  );
  assert.equal(
    publicOpenApiDocument.components.schemas.JsonRpcRequest.properties
      .jsonrpc.const,
    "2.0",
  );
  assert.equal(
    publicOpenApiDocument.components.schemas.JsonRpcRequestPayload.oneOf[1]
      .maxItems,
    20,
  );
  assert.deepEqual(
    publicOpenApiDocument.components.schemas.JsonRpcErrorDetail.required,
    ["code", "message"],
  );
  assert.ok(
    publicOpenApiDocument.components.schemas.JsonRpcGatewayErrorData
      .properties.code.enum.includes("rpc_parse_error"),
  );
  assert.ok(
    publicOpenApiDocument.components.schemas.JsonRpcGatewayErrorData
      .properties.code.enum.includes("rpc_upstream_timeout"),
  );
  assert.deepEqual(
    publicOpenApiDocument.components.schemas.JsonRpcResponse.oneOf.map(
      (schema) => schema.$ref,
    ),
    [
      "#/components/schemas/JsonRpcSuccessResponse",
      "#/components/schemas/JsonRpcErrorResponse",
    ],
  );
  for (const status of [
    "200",
    "204",
    "400",
    "401",
    "403",
    "404",
    "413",
    "415",
    "429",
    "502",
    "503",
    "504",
  ]) {
    assert.ok(
      paths["/api/v1/rpc/{serviceId}"].post.responses[status],
      `RPC OpenAPI should document ${status}`,
    );
  }
  assert.ok(
    publicApiEndpoints.some(
      (endpoint) =>
        endpoint.method === "POST" &&
        endpoint.path === "/api/v1/rpc/{serviceId}" &&
        endpoint.maturity === "beta",
    ),
  );
  assert.deepEqual(
    publicOpenApiDocument.components.schemas.HealthEnvelope.properties.data
      .properties.ethereumRpc.required,
    ["configured", "upstreamCount", "scope"],
  );
  assert.deepEqual(
    publicOpenApiDocument.components.schemas.HealthEnvelope.properties.data
      .properties.rpcNetworks.required,
    ["ethereum", "base", "solana"],
  );
  assert.deepEqual(
    publicOpenApiDocument.components.schemas.HealthEnvelope.properties.data
      .properties.nativeGrpc.required,
    [
      "configured",
      "endpointConfigured",
      "authenticationConfigured",
      "scope",
    ],
  );
  assert.equal(
    paths["/api/v1/status"].get.responses["200"].content[
      "application/json"
    ].schema.$ref,
    "#/components/schemas/PublicStatusEnvelope",
  );
  assert.match(
    publicOpenApiDocument.components.schemas.PublicStatusService.properties
      .slug.description,
    /rpc-ethereum.*rpc-base.*rpc-solana.*grpc-ethereum/,
  );
  assert.deepEqual(
    publicOpenApiDocument.components.schemas.DeveloperServiceInput.allOf[0]
      .then.properties.network.enum,
    ["ethereum", "base", "solana"],
  );
});

test("gas estimates use bounded integer math", () => {
  const result = calculateGasEstimate(
    { gasUnits: "21000", gwei: "2.5", assetPrice: "3500" },
    new Date("2026-07-17T00:00:00.000Z"),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.wei, "52500000000000");
  assert.equal(result.value.totalGwei, "52500");
  assert.equal(result.value.nativeAsset, "0.0000525");
  assert.equal(result.value.fiatUsd, "0.18375");

  const unsafe = calculateGasEstimate({
    gasUnits: "9999999999",
    gwei: "-1",
    assetPrice: "NaN",
  });
  assert.equal(unsafe.ok, false);

  const inclusiveBoundary = calculateGasEstimate({
    gasUnits: "1",
    gwei: "1000000",
    assetPrice: "100000000",
  });
  assert.equal(inclusiveBoundary.ok, true);

  const overBoundary = calculateGasEstimate({
    gasUnits: "1",
    gwei: "1000000.000000001",
    assetPrice: "100000000.000001",
  });
  assert.equal(overBoundary.ok, false);
});

test("request guards enforce origin, media type, size, and idempotency", async () => {
  const sameOrigin = new Request("https://nodezuno.com/api/v1/submissions", {
    method: "POST",
    headers: {
      Origin: "https://nodezuno.com",
      "Content-Type": "application/json",
      "Idempotency-Key": "backend-contract-test-0001",
    },
    body: "{}",
  });
  assert.doesNotThrow(() => assertSameOrigin(sameOrigin));
  assert.equal(readIdempotencyKey(sameOrigin), "backend-contract-test-0001");
  assert.deepEqual(await readJsonBody(sameOrigin), {});

  const crossOrigin = new Request(
    "https://nodezuno.com/api/v1/submissions",
    { headers: { Origin: "https://evil.example" } },
  );
  assert.throws(
    () => assertSameOrigin(crossOrigin),
    (error) => error instanceof HttpProblem && error.status === 403,
  );
  assert.throws(
    () =>
      assertSameOrigin(
        new Request("https://nodezuno.com/api/v1/submissions", {
          method: "POST",
        }),
      ),
    (error) =>
      error instanceof HttpProblem &&
      error.status === 403 &&
      error.code === "origin_required",
  );

  await assert.rejects(
    () =>
      readJsonBody(
        new Request("https://nodezuno.com/api", {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: "{}",
        }),
      ),
    (error) => error instanceof HttpProblem && error.status === 415,
  );

  await assert.rejects(
    () =>
      readJsonBody(
        new Request("https://nodezuno.com/api", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": String(40 * 1024),
          },
          body: "{}",
        }),
      ),
    (error) => error instanceof HttpProblem && error.status === 413,
  );

  const oversizedStreamingRequest = new Request(
    "https://nodezuno.com/api",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(20 * 1024));
          controller.enqueue(new Uint8Array(20 * 1024));
          controller.close();
        },
      }),
      duplex: "half",
    },
  );
  assert.equal(
    oversizedStreamingRequest.headers.has("content-length"),
    false,
  );
  await assert.rejects(
    () => readJsonBody(oversizedStreamingRequest),
    (error) =>
      error instanceof HttpProblem &&
      error.status === 413 &&
      error.code === "request_too_large",
  );

  const boundedText = new Request("https://nodezuno.com/api", {
    method: "POST",
    body: "token=small",
  });
  assert.equal(await readTextBody(boundedText, 64), "token=small");
});

test("identity parsing and admin allowlists are server normalized", () => {
  const request = new Request("https://nodezuno.com/account", {
    headers: {
      "oai-authenticated-user-email": "OWNER@EXAMPLE.COM",
      "oai-authenticated-user-full-name": "Sanjay%20Sudagani",
      "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
    },
  });
  assert.deepEqual(userFromRequest(request), {
    email: "owner@example.com",
    fullName: "Sanjay Sudagani",
    displayName: "Sanjay Sudagani",
  });
  assert.deepEqual(
    [...parseAdminAllowlist("OWNER@example.com, ops@example.com")],
    ["owner@example.com", "ops@example.com"],
  );
});

test("ChatGPT sign-in return paths cannot become open redirects", () => {
  assert.match(chatGPTSignInPath("/account"), /return_to=%2Faccount$/);
  assert.match(chatGPTSignInPath("//evil.example"), /return_to=%2F$/);
  assert.match(chatGPTSignInPath("/\\evil.example"), /return_to=%2F$/);
  assert.match(
    chatGPTSignInPath("/signin-with-chatgpt"),
    /return_to=%2F$/,
  );
  assert.match(
    chatGPTSignOutPath("https://evil.example"),
    /return_to=%2F$/,
  );
});

test("overall status never understates incidents or service outages", () => {
  assert.equal(
    deriveOverallStatus([{ state: "major_outage" }], []),
    "incident",
  );
  assert.equal(
    deriveOverallStatus(
      [{ state: "preview" }],
      [{ state: "investigating", severity: "minor" }],
    ),
    "degraded",
  );
  assert.equal(
    deriveOverallStatus([{ state: "maintenance" }], []),
    "maintenance",
  );
  assert.equal(
    deriveOverallStatus(
      [{ state: "preview" }, { state: "operational" }],
      [],
    ),
    "mixed",
  );
});

test("browser challenge difficulty counts leading SHA-256 bits exactly", () => {
  assert.equal(hasLeadingZeroBits(new Uint8Array([0, 0b00001111]), 12), true);
  assert.equal(hasLeadingZeroBits(new Uint8Array([0, 0b00011111]), 12), false);
  assert.equal(hasLeadingZeroBits(new Uint8Array([1]), 1), true);
  assert.equal(hasLeadingZeroBits(new Uint8Array([128]), 1), false);
});

function createNewsletterRaceDatabase(row, outbox) {
  return {
    prepare(query) {
      return {
        query,
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
      };
    },
    async batch(statements) {
      const [update, enqueue, verify] = statements;
      const [unsubscribedAt, updatedAt, updateTokenHash] = update.values;
      if (row.tokenHash === updateTokenHash) {
        row.state = "unsubscribed";
        row.updatedAt = updatedAt;
        row.unsubscribedAt = unsubscribedAt;
      }

      const [
        outboxId,
        availableAt,
        createdAt,
        outboxUpdatedAt,
        enqueueTokenHash,
        requiredUpdatedAt,
      ] = enqueue.values;
      if (
        row.tokenHash === enqueueTokenHash &&
        row.state === "unsubscribed" &&
        row.updatedAt === requiredUpdatedAt
      ) {
        outbox.push({
          id: outboxId,
          entityId: row.id,
          availableAt,
          createdAt,
          updatedAt: outboxUpdatedAt,
        });
      }

      const [verifyTokenHash, verifyUpdatedAt] = verify.values;
      const matched =
        row.tokenHash === verifyTokenHash &&
        row.state === "unsubscribed" &&
        row.updatedAt === verifyUpdatedAt;
      return [
        { success: true, results: [], meta: {} },
        { success: true, results: [], meta: {} },
        {
          success: true,
          results: matched ? [{ id: row.id }] : [],
          meta: {},
        },
      ];
    },
  };
}
