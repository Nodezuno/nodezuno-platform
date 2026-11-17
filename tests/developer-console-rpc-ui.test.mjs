import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  normalizedRpcNetwork,
  rpcConsolePath,
  rpcProbePayload,
  rpcRequestExamples,
  verifyRpcProbe,
} from "../lib/client/rpc-networks.ts";

const consoleSourceUrl = new URL(
  "../components/developer-console.tsx",
  import.meta.url,
);
const authSourceUrl = new URL(
  "../components/auth-experience.tsx",
  import.meta.url,
);
const consolePageUrl = new URL("../app/console/page.tsx", import.meta.url);
const signupPageUrl = new URL("../app/signup/page.tsx", import.meta.url);
const startPageUrl = new URL("../app/start/page.tsx", import.meta.url);
const stylesUrl = new URL("../app/globals.css", import.meta.url);
const rpcNetworksUrl = new URL(
  "../lib/client/rpc-networks.ts",
  import.meta.url,
);

test("multi-chain RPC console exposes only verified, self-service access", async () => {
  const [
    source,
    authSource,
    consolePage,
    signupPage,
    startPage,
    styles,
    rpcNetworks,
  ] =
    await Promise.all([
      readFile(consoleSourceUrl, "utf8"),
      readFile(authSourceUrl, "utf8"),
      readFile(consolePageUrl, "utf8"),
      readFile(signupPageUrl, "utf8"),
      readFile(startPageUrl, "utf8"),
      readFile(stylesUrl, "utf8"),
      readFile(rpcNetworksUrl, "utf8"),
    ]);

  assert.match(source, /selfServiceRpcNetworks\.map/);
  assert.match(source, /selectedRpcNetwork/);
  assert.match(source, /isSelfServiceRpcNetwork\(serviceNetwork\)/);
  assert.match(source, /Ethereum,[\s\S]+Base,[\s\S]+and Solana/);
  assert.match(
    source,
    /service\.status === "active"[\s\S]+Boolean\(endpoint\)/,
  );
  assert.match(source, /Authorization: Bearer/);
  assert.match(source, /\$NODEZUNO_API_KEY/);
  assert.match(source, /rpc:invoke/);
  assert.match(source, /service\.configuration\.authentication/);
  assert.match(
    source,
    /\{apiKey\.prefix\}••••\{apiKey\.lastFour\}/,
  );
  assert.match(source, /Replace older keys for RPC access/);
  assert.match(rpcNetworks, /method: "eth_chainId"/);
  assert.match(rpcNetworks, /method: "getHealth"/);
  assert.match(rpcNetworks, /method: "getLatestBlockhash"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /\{telemetry \? \(/);
  assert.match(
    source,
    /No measured request, error, or latency[\s\S]+telemetry has been returned/,
  );
  assert.match(source, /configuration saved/);
  assert.match(source, /telemetry\.windowStartedAt/);
  assert.match(source, /id="rpc-launchpad"/);
  assert.match(
    source,
    /aria-label=\{`\$\{selectedRpcDescriptor\.label\} RPC setup progress`\}/,
  );
  assert.match(source, /Create workspace, gateway, and key/);
  assert.match(source, /launchRpcSetup/);
  assert.match(source, /copyRpcEndpoint/);
  assert.match(source, /Copy first request/);
  assert.match(source, /No sales gate/);
  assert.match(source, /One-time API key/);
  assert.match(source, /runRpcProbe/);
  assert.match(source, /rpcProbePayload\(selectedRpcNetwork\)/);
  assert.match(source, /credentials: "omit"/);
  assert.match(source, /redirect: "error"/);
  assert.match(source, /referrerPolicy: "no-referrer"/);
  assert.match(source, /selectedRpcDescriptor\.probeButtonLabel/);
  assert.match(source, /One-click verification/);
  assert.match(source, /role="status"/);
  assert.match(source, /role="alert"/);
  assert.match(source, /selectedRpcDescriptor\.mainnetLabel/);
  assert.match(source, /latencyMs/);
  assert.match(source, /rpcProbeReady/);
  assert.match(source, /readEthereumRpcQuota\(response\.headers\)/);
  assert.match(source, /hourly key units remaining/);
  assert.match(
    source,
    /serviceId: nextService\.id/,
  );
  assert.match(
    source,
    /The copyable curl request remains available below/,
  );
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
  assert.match(source, /Chain Launch Cloud/);
  assert.match(source, /OP Stack/);
  assert.match(source, /Arbitrum Orbit/);
  assert.match(source, /Avalanche L1/);
  assert.match(source, /Polygon CDK/);
  assert.match(source, /Cosmos EVM/);
  assert.match(source, /Save chain launch project brief/);
  assert.match(
    source,
    /This is a design-partner project brief, not a deployment/,
  );
  assert.match(authSource, /Signing in to your review portal/);
  assert.match(authSource, /Create account and continue/);
  assert.match(signupPage, /firstSearchParam\(requestedReturnTo\) \?\? "\/account"/);
  assert.match(startPage, /permanentRedirect\(withSearchParams\("\/review\/start", values\)\)/);
  assert.match(consolePage, /permanentRedirect\(withSearchParams\("\/account", values\)\)/);
  assert.doesNotMatch(authSource, /RPC quickstart|gateway, and API key/);
  assert.doesNotMatch(source, /p95LatencyMs|P95 latency/);
  assert.doesNotMatch(source, /\u2014/);
  assert.doesNotMatch(authSource, /\u2014/);

  assert.match(styles, /\.rpc-curl-example pre[\s\S]+overflow-x: auto/);
  assert.match(styles, /@media \(max-width: 620px\)[\s\S]+\.rpc-service-facts/);
  assert.match(styles, /\.rpc-launchpad[\s\S]+\.rpc-launch-progress/);
  assert.match(styles, /\.rpc-network-picker/);
  assert.match(styles, /\.rpc-network-picker a[\s\S]+min-height: 44px/);
  assert.match(styles, /\.rpc-launch-request pre[\s\S]+overflow: auto/);
  assert.match(styles, /\.rpc-launch-probe[\s\S]+\.rpc-probe-success/);
  assert.match(
    styles,
    /@media \(max-width: 620px\)[\s\S]+\.rpc-launch-probe-heading/,
  );
  assert.match(
    styles,
    /@media \(forced-colors: active\)[\s\S]+\.rpc-network-picker a/,
  );
});

test("operator console exposes lifecycle, access boundaries, recovery, and honest beta state", async () => {
  const [source, styles] = await Promise.all([
    readFile(consoleSourceUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);

  assert.match(
    source,
    /apiKey\.serviceId === selectedRpcService\.id/,
  );
  assert.match(source, /Service-bound/);
  assert.match(source, /Unbound identity key/);
  assert.match(source, /Platform identity only/);
  assert.match(source, /Not accepted by RPC or native gRPC services/);
  assert.match(source, /Bound service unavailable/);
  assert.match(source, /Service-bound active keys/);
  assert.match(
    source,
    /apiKey\.serviceId === service\.id/,
  );
  assert.doesNotMatch(source, /Workspace-wide/);
  assert.doesNotMatch(source, /Accepted by compatible services/);
  assert.doesNotMatch(source, /workspace-wide compatibility key/);
  assert.match(source, /Hourly quota visibility/);
  assert.match(source, /X-RateLimit-Remaining/);
  assert.match(source, /RPC calls/);
  assert.match(source, /Upstream failures/);
  assert.match(source, /Active beta gateway/);
  assert.match(source, /No\s+production SLA is claimed/);
  assert.match(source, /Refresh data/);
  assert.match(source, /existing console data is still visible/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /aria-describedby=\{`archive-warning-/);
  assert.match(source, /aria-describedby=\{`revoke-warning-/);
  assert.match(source, /restoreActionFocus/);
  assert.match(source, /cannot be reassigned to another service/);
  assert.doesNotMatch(source, /\u2014/);

  assert.match(styles, /\.service-lifecycle-legend/);
  assert.match(styles, /\.api-key-binding/);
  assert.match(styles, /\.rpc-quota-guidance/);
  assert.match(
    styles,
    /@media \(max-width: 620px\)[\s\S]+\.service-list-head/,
  );
});

test("RPC network contracts produce exact paths, probes, and first requests", () => {
  assert.equal(normalizedRpcNetwork("ethereum"), "ethereum");
  assert.equal(normalizedRpcNetwork("base"), "base");
  assert.equal(normalizedRpcNetwork("solana"), "solana");
  assert.equal(normalizedRpcNetwork("unknown"), "ethereum");
  assert.equal(
    rpcConsolePath("base"),
    "/console?product=rpc-api&network=base",
  );

  assert.deepEqual(rpcProbePayload("base"), {
    jsonrpc: "2.0",
    method: "eth_chainId",
    params: [],
    id: 1,
  });
  assert.deepEqual(rpcProbePayload("solana"), {
    jsonrpc: "2.0",
    method: "getHealth",
    params: [],
    id: 1,
  });
  assert.deepEqual(
    verifyRpcProbe("ethereum", {
      jsonrpc: "2.0",
      id: 1,
      result: "0x1",
    }),
    {
      ok: true,
      label: "Ethereum mainnet verified",
      detail: "Chain ID 1",
    },
  );
  assert.deepEqual(
    verifyRpcProbe("base", {
      jsonrpc: "2.0",
      id: 1,
      result: "0x2105",
    }),
    {
      ok: true,
      label: "Base mainnet verified",
      detail: "Chain ID 8453",
    },
  );
  assert.deepEqual(
    verifyRpcProbe("solana", {
      jsonrpc: "2.0",
      id: 1,
      result: "ok",
    }),
    {
      ok: true,
      label: "Solana RPC health verified",
      detail: "getHealth returned ok",
    },
  );
  assert.equal(
    verifyRpcProbe("base", {
      jsonrpc: "2.0",
      id: 1,
      result: "0x1",
    }).ok,
    false,
  );

  const ethereum = rpcRequestExamples("ethereum", "https://rpc.example/eth");
  assert.equal(ethereum.length, 1);
  assert.match(ethereum[0].curl, /"method":"eth_chainId"/);
  assert.match(ethereum[0].curl, /https:\/\/rpc\.example\/eth/);

  const base = rpcRequestExamples("base", "https://rpc.example/base");
  assert.equal(base.length, 1);
  assert.match(base[0].curl, /"method":"eth_chainId"/);

  const solana = rpcRequestExamples("solana", "https://rpc.example/sol");
  assert.equal(solana.length, 2);
  assert.deepEqual(
    solana.map((example) => example.method),
    ["getHealth", "getLatestBlockhash"],
  );
  assert.match(
    solana[1].curl,
    /"method":"getLatestBlockhash".*"commitment":"finalized"/,
  );
});
