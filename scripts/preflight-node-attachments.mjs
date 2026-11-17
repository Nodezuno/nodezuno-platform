#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";
import { rpcNetworks } from "../lib/server/ethereum-rpc.ts";
import { preflightRpcNodeAttachments } from "../lib/server/rpc-node-preflight.ts";

export function requestedNetworksFromArguments(argumentsList) {
  if (argumentsList.length === 0) return undefined;
  const supported = new Set(rpcNetworks);
  if (
    argumentsList.some((network) => !supported.has(network)) ||
    new Set(argumentsList).size !== argumentsList.length
  ) {
    throw new TypeError(
      "Choose each required network once from ethereum, base, or solana.",
    );
  }
  return argumentsList;
}

export async function runNodeAttachmentPreflight(options = {}) {
  const environment = options.environment ?? process.env;
  const requiredNetworks = requestedNetworksFromArguments(
    options.argumentsList ?? [],
  );
  const result = await preflightRpcNodeAttachments({
    rawConfiguration: environment.NODEZUNO_RPC_UPSTREAMS_JSON,
    requiredNetworks,
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        event: "nodezuno_rpc_node_preflight",
        configurationValid: result.configurationValid,
        ready: result.ready,
        networks: result.networks,
      },
      null,
      2,
    )}\n`,
  );

  return result;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  try {
    const result = await runNodeAttachmentPreflight({
      argumentsList: process.argv.slice(2),
    });
    if (!result.ready) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Node preflight failed."}\n`,
    );
    process.exitCode = 2;
  }
}
