import {
  parseRpcUpstreamsJson,
  rpcNetworks,
  type RpcNetwork,
  verifiedRpcUpstreams,
} from "./ethereum-rpc.ts";

export type RpcNodePreflightNetworkResult = {
  network: RpcNetwork;
  configuredUpstreams: number;
  verifiedUpstreams: number;
  ready: boolean;
};

export type RpcNodePreflightResult = {
  configurationValid: boolean;
  ready: boolean;
  networks: RpcNodePreflightNetworkResult[];
};

type VerifyUpstreams = typeof verifiedRpcUpstreams;

export async function preflightRpcNodeAttachments(options: {
  rawConfiguration: string | undefined;
  requiredNetworks?: RpcNetwork[];
  verifier?: VerifyUpstreams;
}): Promise<RpcNodePreflightResult> {
  const requiredNetworks = options.requiredNetworks ?? [...rpcNetworks];
  if (
    requiredNetworks.length < 1 ||
    new Set(requiredNetworks).size !== requiredNetworks.length ||
    requiredNetworks.some((network) => !rpcNetworks.includes(network))
  ) {
    throw new TypeError(
      "Preflight requires a unique, supported RPC network list.",
    );
  }

  const configuration = parseRpcUpstreamsJson(
    options.rawConfiguration,
  );
  if (!configuration.configurationValid) {
    return {
      configurationValid: false,
      ready: false,
      networks: requiredNetworks.map((network) => ({
        network,
        configuredUpstreams: 0,
        verifiedUpstreams: 0,
        ready: false,
      })),
    };
  }

  const verifier = options.verifier ?? verifiedRpcUpstreams;
  const networks = await Promise.all(
    requiredNetworks.map(async (network) => {
      const upstreams = configuration.upstreamsByNetwork[network];
      const verified =
        upstreams.length > 0
          ? await verifier({ network, upstreams })
          : [];
      return {
        network,
        configuredUpstreams: upstreams.length,
        verifiedUpstreams: verified.length,
        ready: verified.length > 0,
      };
    }),
  );

  return {
    configurationValid: true,
    ready: networks.every((network) => network.ready),
    networks,
  };
}
