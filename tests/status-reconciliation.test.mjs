import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveOverallStatus,
  reconcilePublicStatusServices,
} from "../lib/server/status.ts";

const catalog = [
  {
    slug: "edge-regions",
    name: "Edge regions",
    description: "Planned.",
    state: "preview",
    updatedAt: 1,
  },
  {
    slug: "rpc-mesh",
    name: "RPC mesh",
    description: "Legacy seed.",
    state: "preview",
    updatedAt: 1,
  },
  {
    slug: "developer-workspace",
    name: "Developer workspace",
    description: "Preview.",
    state: "preview",
    updatedAt: 1,
  },
];

const rpc = (overrides = {}) => ({
  ethereum: { configured: false, available: false },
  base: { configured: false, available: false },
  solana: { configured: false, available: false },
  ...overrides,
});
const grpc = (overrides = {}) => ({
  configured: false,
  available: false,
  ...overrides,
});

test("status reconciliation publishes independent chain readiness and removes the legacy aggregate", () => {
  const services = reconcilePublicStatusServices({
    services: catalog,
    rpc: rpc({
      ethereum: { configured: true, available: true },
      base: { configured: true, available: false },
    }),
    grpc: grpc({ configured: true, available: true }),
    checkedAt: 100,
  });

  assert.deepEqual(
    services.map(({ slug, state }) => ({ slug, state })),
    [
      { slug: "edge-regions", state: "preview" },
      { slug: "rpc-ethereum", state: "operational" },
      { slug: "rpc-base", state: "degraded" },
      { slug: "rpc-solana", state: "preview" },
      { slug: "grpc-ethereum", state: "operational" },
      { slug: "developer-workspace", state: "operational" },
    ],
  );
  assert.equal(
    services.some(({ slug }) => slug === "rpc-mesh"),
    false,
  );
  assert.equal(
    services.find(({ slug }) => slug === "rpc-ethereum")?.name,
    "Ethereum RPC beta",
  );
  assert.match(
    services.find(({ slug }) => slug === "rpc-solana")?.description ?? "",
    /Solana RPC is not configured/,
  );
  assert.equal(
    services.find(({ slug }) => slug === "rpc-base")?.updatedAt,
    100,
  );
  assert.match(
    services.find(({ slug }) => slug === "grpc-ethereum")
      ?.description ?? "",
    /passed its current gRPC serving-health verification/,
  );
  assert.equal(deriveOverallStatus(services, []), "degraded");
});

test("status reconciliation does not duplicate already materialized per-network records", () => {
  const services = reconcilePublicStatusServices({
    services: [
      catalog[0],
      {
        slug: "rpc-base",
        name: "Old Base",
        description: "Old.",
        state: "major_outage",
        updatedAt: 2,
      },
      {
        slug: "grpc-ethereum",
        name: "Old gRPC",
        description: "Old.",
        state: "major_outage",
        updatedAt: 2,
      },
      catalog[1],
      catalog[2],
    ],
    rpc: rpc({
      ethereum: { configured: true, available: true },
      base: { configured: true, available: true },
      solana: { configured: true, available: true },
    }),
    grpc: grpc({ configured: true, available: false }),
    checkedAt: 200,
  });

  assert.deepEqual(
    services
      .filter(({ slug }) => slug.startsWith("rpc-"))
      .map(({ slug }) => slug),
    ["rpc-ethereum", "rpc-base", "rpc-solana"],
  );
  assert.equal(
    services
      .filter(({ slug }) => slug === "developer-workspace")
      .length,
    1,
  );
  assert.equal(
    services.filter(({ slug }) => slug === "grpc-ethereum").length,
    1,
  );
  assert.equal(
    services.find(({ slug }) => slug === "grpc-ethereum")?.state,
    "degraded",
  );
});

test("status reconciliation emits all RPC networks in preview when none are configured", () => {
  const services = reconcilePublicStatusServices({
    services: [],
    rpc: rpc(),
    grpc: grpc(),
    checkedAt: 300,
  });

  assert.deepEqual(
    services.map(({ slug, state }) => ({ slug, state })),
    [
      { slug: "rpc-ethereum", state: "preview" },
      { slug: "rpc-base", state: "preview" },
      { slug: "rpc-solana", state: "preview" },
      { slug: "grpc-ethereum", state: "preview" },
      { slug: "developer-workspace", state: "operational" },
    ],
  );
  assert.equal(deriveOverallStatus(services, []), "mixed");
});
