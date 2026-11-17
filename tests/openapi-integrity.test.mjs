import assert from "node:assert/strict";
import test from "node:test";
import {
  publicApiEndpoints,
  publicOpenApiDocument,
} from "../lib/public-api.ts";
import { internalOpenApiDocument } from "../lib/api/internal.ts";

const httpMethods = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
  "trace",
]);

test("every local OpenAPI reference resolves", () => {
  for (const document of [publicOpenApiDocument, internalOpenApiDocument]) {
    const references = collectReferences(document);
    assert.ok(references.size > 0);
    for (const reference of references) {
      assert.match(reference, /^#\//);
      assert.notEqual(resolveJsonPointer(document, reference), undefined);
    }
  }
});

test("OpenAPI operation identifiers and inventory keys are unique", () => {
  const operationIds = new Set();
  const documentedOperations = new Set();
  for (const [pathname, pathItem] of Object.entries(
    publicOpenApiDocument.paths,
  )) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!httpMethods.has(method)) continue;
      assert.equal(
        typeof operation.operationId,
        "string",
        `${method.toUpperCase()} ${pathname} needs operationId`,
      );
      assert.equal(
        operationIds.has(operation.operationId),
        false,
        `duplicate operationId ${operation.operationId}`,
      );
      operationIds.add(operation.operationId);
      documentedOperations.add(`${method.toUpperCase()} ${pathname}`);
      const responseCodes = Object.keys(operation.responses);
      const successResponse = responseCodes.some((status) => /^2\d\d$/.test(status));
      const explicitRetirement = operation.deprecated === true && responseCodes.includes("410");
      assert.ok(
        successResponse || explicitRetirement,
        `${method.toUpperCase()} ${pathname} needs a success or explicit retirement response`,
      );
    }
  }

  const inventoryKeys = new Set();
  for (const endpoint of publicApiEndpoints) {
    const key = `${endpoint.method} ${endpoint.path}`;
    assert.equal(
      inventoryKeys.has(key),
      false,
      `duplicate public inventory entry ${key}`,
    );
    inventoryKeys.add(key);
    assert.ok(
      documentedOperations.has(key),
      `${key} is missing from OpenAPI`,
    );
  }
});

test("path-template variables are declared exactly once per operation", () => {
  for (const [pathname, pathItem] of Object.entries(
    publicOpenApiDocument.paths,
  )) {
    const expected = [
      ...pathname.matchAll(/\{([A-Za-z0-9_]+)\}/g),
    ].map((match) => match[1]);
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!httpMethods.has(method)) continue;
      const declared = (operation.parameters ?? [])
        .filter((parameter) => parameter.in === "path")
        .map((parameter) => parameter.name);
      assert.deepEqual(
        [...declared].sort(),
        [...expected].sort(),
        `${method.toUpperCase()} ${pathname} path parameters differ`,
      );
      assert.equal(
        new Set(declared).size,
        declared.length,
        `${method.toUpperCase()} ${pathname} repeats a path parameter`,
      );
    }
  }
});

test("stablecoin API contract distinguishes manual payment claims from proof", () => {
  const intent =
    publicOpenApiDocument.paths[
      "/api/v1/review-orders/{id}/payment-intents"
    ].post;
  const claim =
    publicOpenApiDocument.paths[
      "/api/v1/review-orders/{id}/payment-intents/{intentId}/claims"
    ].post;
  const configuration =
    publicOpenApiDocument.components.schemas.StablecoinPaymentConfiguration;

  assert.match(intent.description, /current Cloudflare profile is manual/i);
  assert.match(claim.description, /not proof of payment/i);
  assert.ok(configuration.required.includes("paymentExperience"));
  assert.deepEqual(
    configuration.properties.paymentExperience.enum,
    ["disabled", "manual_ethereum", "ethereum_mainnet"],
  );
  assert.equal(
    configuration.properties.automaticVerification.type,
    "boolean",
  );
});

test("private gRPC admission contract is exact, bounded, and credential-safe", () => {
  const operation =
    internalOpenApiDocument.paths[
      "/api/v1/internal/grpc/authorize"
    ].post;
  const input =
    internalOpenApiDocument.components.schemas.GrpcAuthorizationInput;

  assert.equal(input.additionalProperties, false);
  assert.deepEqual([...input.required].sort(), [
    "apiKey",
    "quotaUnits",
    "serviceId",
  ]);
  assert.deepEqual(Object.keys(input.properties).sort(), [
    "apiKey",
    "quotaUnits",
    "serviceId",
  ]);
  assert.equal(input.properties.apiKey.writeOnly, true);
  assert.equal(input.properties.apiKey.example, undefined);
  assert.deepEqual(input.properties.quotaUnits, {
    type: "integer",
    minimum: 1,
    maximum: 10,
    description:
      "Bounded unary admission weight derived by the native gateway: eth_getLogs is 10, eth_getProof is 5, eth_call and eth_feeHistory are 3, and every other or malformed method is 1.",
  });
  assert.match(operation.description, /atomically consumes/);
  assert.match(operation.description, /without consuming quota/);
  assert.match(operation.responses["429"].description, /hourly RPC quota/);
  assert.equal(
    operation.responses["429"].content["application/problem+json"]
      .schema.$ref,
    "#/components/schemas/Problem",
  );

  const responseContract = JSON.stringify(operation.responses);
  assert.doesNotMatch(responseContract, /nzu_live_/);
  assert.doesNotMatch(responseContract, /"apiKey"/);
  assert.equal(
    collectExamples(operation.responses).some((example) =>
      typeof example === "string"
        ? example.includes("nzu_live_")
        : JSON.stringify(example).includes("nzu_live_"),
    ),
    false,
  );
});

function collectReferences(value, references = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectReferences(item, references);
    return references;
  }
  if (!value || typeof value !== "object") return references;
  for (const [key, item] of Object.entries(value)) {
    if (key === "$ref" && typeof item === "string") {
      references.add(item);
    } else {
      collectReferences(item, references);
    }
  }
  return references;
}

function collectExamples(value, examples = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectExamples(item, examples);
    return examples;
  }
  if (!value || typeof value !== "object") return examples;
  for (const [key, item] of Object.entries(value)) {
    if (key === "example" || key === "examples") {
      examples.push(item);
    } else {
      collectExamples(item, examples);
    }
  }
  return examples;
}

function resolveJsonPointer(document, reference) {
  return reference
    .slice(2)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce(
      (value, part) =>
        value && typeof value === "object" ? value[part] : undefined,
      document,
    );
}
