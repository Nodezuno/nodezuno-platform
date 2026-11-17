export const selfServiceRpcNetworks = [
  "ethereum",
  "base",
  "solana",
] as const;

export type SelfServiceRpcNetwork =
  (typeof selfServiceRpcNetworks)[number];

export type RpcNetworkDescriptor = {
  network: SelfServiceRpcNetwork;
  label: string;
  mainnetLabel: string;
  protocolLabel: string;
  serviceName: string;
  quickstartKeyName: string;
  recoveryKeyName: string;
  probeMethod: "eth_chainId" | "getHealth";
  probeButtonLabel: string;
  expectedEvmChainId: string | null;
};

export type RpcRequestExample = {
  id: string;
  method: "eth_chainId" | "getHealth" | "getLatestBlockhash";
  title: string;
  curl: string;
};

export type RpcProbeVerification =
  | {
      ok: true;
      label: string;
      detail: string;
    }
  | {
      ok: false;
      message: string;
    };

const descriptors: Record<SelfServiceRpcNetwork, RpcNetworkDescriptor> = {
  ethereum: {
    network: "ethereum",
    label: "Ethereum",
    mainnetLabel: "Ethereum mainnet",
    protocolLabel: "Ethereum JSON-RPC",
    serviceName: "Ethereum mainnet",
    quickstartKeyName: "Ethereum quickstart",
    recoveryKeyName: "Ethereum recovery key",
    probeMethod: "eth_chainId",
    probeButtonLabel: "Run eth_chainId test",
    expectedEvmChainId: "0x1",
  },
  base: {
    network: "base",
    label: "Base",
    mainnetLabel: "Base mainnet",
    protocolLabel: "Base JSON-RPC",
    serviceName: "Base mainnet",
    quickstartKeyName: "Base quickstart",
    recoveryKeyName: "Base recovery key",
    probeMethod: "eth_chainId",
    probeButtonLabel: "Run eth_chainId test",
    expectedEvmChainId: "0x2105",
  },
  solana: {
    network: "solana",
    label: "Solana",
    mainnetLabel: "Solana mainnet",
    protocolLabel: "Solana JSON-RPC",
    serviceName: "Solana mainnet",
    quickstartKeyName: "Solana quickstart",
    recoveryKeyName: "Solana recovery key",
    probeMethod: "getHealth",
    probeButtonLabel: "Run getHealth test",
    expectedEvmChainId: null,
  },
};

export function isSelfServiceRpcNetwork(
  value: unknown,
): value is SelfServiceRpcNetwork {
  return (
    typeof value === "string" &&
    selfServiceRpcNetworks.includes(value as SelfServiceRpcNetwork)
  );
}

export function normalizedRpcNetwork(
  value: unknown,
): SelfServiceRpcNetwork {
  return isSelfServiceRpcNetwork(value) ? value : "ethereum";
}

export function rpcNetworkDescriptor(
  network: SelfServiceRpcNetwork,
): RpcNetworkDescriptor {
  return descriptors[network];
}

export function rpcConsolePath(
  network: SelfServiceRpcNetwork,
): string {
  return `/console?product=rpc-api&network=${encodeURIComponent(network)}`;
}

export function rpcProbePayload(
  network: SelfServiceRpcNetwork,
): Record<string, unknown> {
  const descriptor = rpcNetworkDescriptor(network);
  return {
    jsonrpc: "2.0",
    method: descriptor.probeMethod,
    params: [],
    id: 1,
  };
}

export function verifyRpcProbe(
  network: SelfServiceRpcNetwork,
  payload: unknown,
): RpcProbeVerification {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      ok: false,
      message: "The gateway returned an invalid JSON-RPC response.",
    };
  }

  const response = payload as Record<string, unknown>;
  if (response.jsonrpc !== "2.0" || response.id !== 1) {
    return {
      ok: false,
      message:
        "The gateway response did not match the verification request.",
    };
  }
  if (response.error) {
    return {
      ok: false,
      message: "The gateway returned a JSON-RPC error.",
    };
  }

  const descriptor = rpcNetworkDescriptor(network);
  if (network === "solana") {
    return response.result === "ok"
      ? {
          ok: true,
          label: "Solana RPC health verified",
          detail: "getHealth returned ok",
        }
      : {
          ok: false,
          message: "The Solana gateway did not return a healthy result.",
        };
  }

  const result =
    typeof response.result === "string"
      ? response.result.toLowerCase()
      : null;
  if (result !== descriptor.expectedEvmChainId) {
    return {
      ok: false,
      message: `The gateway returned chain ID ${result ?? "unknown"}, not ${descriptor.expectedEvmChainId}.`,
    };
  }

  return {
    ok: true,
    label: `${descriptor.mainnetLabel} verified`,
    detail: `Chain ID ${BigInt(descriptor.expectedEvmChainId!).toString()}`,
  };
}

export function rpcRequestExamples(
  network: SelfServiceRpcNetwork,
  endpoint: string,
): RpcRequestExample[] {
  if (network === "solana") {
    return [
      {
        id: "solana-health",
        method: "getHealth",
        title: "Check node health",
        curl: jsonRpcCurl(endpoint, "getHealth", []),
      },
      {
        id: "solana-latest-blockhash",
        method: "getLatestBlockhash",
        title: "Read the latest blockhash",
        curl: jsonRpcCurl(endpoint, "getLatestBlockhash", [
          { commitment: "finalized" },
        ]),
      },
    ];
  }

  return [
    {
      id: `${network}-chain-id`,
      method: "eth_chainId",
      title: `Verify ${rpcNetworkDescriptor(network).mainnetLabel}`,
      curl: jsonRpcCurl(endpoint, "eth_chainId", []),
    },
  ];
}

function jsonRpcCurl(
  endpoint: string,
  method: RpcRequestExample["method"],
  params: unknown[],
): string {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    method,
    params,
    id: 1,
  });
  return [
    `curl "${endpoint}" \\`,
    "  --request POST \\",
    '  --header "Authorization: Bearer $NODEZUNO_API_KEY" \\',
    '  --header "Content-Type: application/json" \\',
    `  --data '${body}'`,
  ].join("\n");
}
