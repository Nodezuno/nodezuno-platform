#!/usr/bin/env node

import {
  MINIMUM_PAYMENT_RPC_ENDPOINTS,
  STABLECOIN_ASSETS,
  stablecoinPaymentConfiguration,
} from "../lib/server/stablecoin-payment-config.ts";

const configuration = await stablecoinPaymentConfiguration();
if (configuration.mode === "disabled") {
  process.stdout.write(`${JSON.stringify({
    service: "nodezuno-stablecoin-payment-preflight",
    status: "disabled",
    recipient: configuration.recipient,
  })}\n`);
  process.exit(0);
}
if (
  configuration.mode !== "ethereum_mainnet" ||
  !configuration.ready ||
  configuration.endpoints.length < MINIMUM_PAYMENT_RPC_ENDPOINTS
) {
  throw new Error(
    "Ethereum mainnet stablecoin payments require the legal launch gate and at least two independent RPC endpoints.",
  );
}

const results = [];
for (const endpoint of configuration.endpoints) {
  const requests = [
    ["eth_chainId", []],
    ["eth_getBlockByNumber", ["latest", false]],
    ["eth_getBlockByNumber", ["finalized", false]],
    ["eth_getCode", [STABLECOIN_ASSETS.USDC.contract, "latest"]],
    ["eth_getCode", [STABLECOIN_ASSETS.USDT.contract, "latest"]],
    ["eth_call", [{ to: STABLECOIN_ASSETS.USDC.contract, data: "0x313ce567" }, "latest"]],
    ["eth_call", [{ to: STABLECOIN_ASSETS.USDT.contract, data: "0x313ce567" }, "latest"]],
    ["eth_getTransactionReceipt", [`0x${"0".repeat(64)}`]],
  ];
  const [chainId, latest, finalized, usdcCode, usdtCode, usdcDecimals, usdtDecimals, emptyReceipt] =
    await Promise.all(requests.map(([method, params]) => rpcCall(endpoint, method, params)));
  if (chainId !== "0x1") throw new Error(`Payment RPC ${endpoint.name} is not Ethereum mainnet.`);
  if (!blockRecord(latest) || !blockRecord(finalized)) {
    throw new Error(`Payment RPC ${endpoint.name} does not expose latest and finalized blocks.`);
  }
  const latestNumber = BigInt(latest.number);
  const finalizedNumber = BigInt(finalized.number);
  const latestTimestamp = Number(BigInt(latest.timestamp) * 1_000n);
  if (finalizedNumber > latestNumber || Math.abs(Date.now() - latestTimestamp) > 5 * 60_000) {
    throw new Error(`Payment RPC ${endpoint.name} is stale or reports invalid finality.`);
  }
  if (!hasContractCode(usdcCode) || !hasContractCode(usdtCode)) {
    throw new Error(`Payment RPC ${endpoint.name} cannot read the official stablecoin contracts.`);
  }
  if (hexValue(usdcDecimals) !== 6n || hexValue(usdtDecimals) !== 6n) {
    throw new Error(`Payment RPC ${endpoint.name} returned unexpected stablecoin decimals.`);
  }
  if (emptyReceipt !== null) {
    throw new Error(`Payment RPC ${endpoint.name} returned an invalid receipt probe.`);
  }
  results.push({
    name: endpoint.name,
    chainId: 1,
    latestBlock: latestNumber.toString(),
    finalizedBlock: finalizedNumber.toString(),
    healthy: true,
  });
}

process.stdout.write(`${JSON.stringify({
  service: "nodezuno-stablecoin-payment-preflight",
  recipient: configuration.recipient,
  confirmationsRequired: configuration.confirmationsRequired,
  endpoints: results,
})}\n`);

async function rpcCall(endpoint, method, params) {
  const response = await fetch(endpoint.url, {
    method: "POST",
    headers: { ...endpoint.headers, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
    redirect: "error",
    signal: AbortSignal.timeout(endpoint.timeoutMs),
  });
  if (!response.ok) throw new Error(`Payment RPC ${endpoint.name} preflight failed.`);
  const entry = await response.json();
  if (!record(entry) || entry.id !== 1 || entry.error !== undefined || !("result" in entry)) {
    throw new Error(`Payment RPC ${endpoint.name} returned an invalid response.`);
  }
  return entry.result;
}

function blockRecord(value) {
  return record(value) && hexQuantity(value.number) && hexQuantity(value.timestamp);
}

function hasContractCode(value) {
  return typeof value === "string" && /^0x[0-9a-f]+$/i.test(value) && !/^0x0*$/i.test(value);
}

function hexValue(value) {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) return null;
  return BigInt(value);
}

function hexQuantity(value) {
  return typeof value === "string" && /^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value);
}

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
