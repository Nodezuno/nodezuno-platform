import {
  checkDatabase,
  checkRuntimeConfiguration,
} from "@/lib/server/database";
import {
  apiJson,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";
import {
  loadEthereumRpcRuntimeConfiguration,
  rpcNetworks,
} from "@/lib/server/ethereum-rpc";
import { loadGrpcRuntimeConfiguration } from "@/lib/server/grpc";

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  try {
    const [
      database,
      configuration,
      ethereumRpcConfiguration,
      grpcConfiguration,
    ] = await Promise.all([
      checkDatabase(),
      checkRuntimeConfiguration(),
      loadEthereumRpcRuntimeConfiguration(),
      loadGrpcRuntimeConfiguration(),
    ]);
    const healthy = database && configuration;
    const ethereumRpcConfigured =
      ethereumRpcConfiguration.configurationValid &&
      ethereumRpcConfiguration.upstreams.length > 0;
    const rpcNetworksConfiguration = Object.fromEntries(
      rpcNetworks.map((network) => {
        const upstreamCount =
          ethereumRpcConfiguration.configurationValid
            ? ethereumRpcConfiguration.upstreamsByNetwork[network].length
            : 0;
        return [
          network,
          {
            configured: upstreamCount > 0,
            upstreamCount,
            scope:
              "Validated gateway configuration only. No upstream request or chain verification is performed.",
          },
        ];
      }),
    );
    return apiJson(
      {
        data: {
          service: "nodezuno-web-control-plane",
          status: healthy ? "healthy" : "unavailable",
          database,
          configuration,
          ethereumRpc: {
            configured: ethereumRpcConfigured,
            upstreamCount: ethereumRpcConfigured
              ? ethereumRpcConfiguration.upstreams.length
              : 0,
            scope:
              "Validated gateway configuration only. No upstream request, chain ID check, or chain-head health probe is performed.",
          },
          rpcNetworks: rpcNetworksConfiguration,
          nativeGrpc: {
            configured: grpcConfiguration.configurationValid,
            endpointConfigured: grpcConfiguration.endpoint !== null,
            authenticationConfigured:
              grpcConfiguration.authenticationConfigured,
            scope:
              "Validated native gateway configuration only. No serving-health request is performed.",
          },
          checkedAt: new Date().toISOString(),
          scope:
            "Website control-plane readiness plus Ethereum, Base, Solana RPC, and native Ethereum gRPC configuration. This is not blockchain network health.",
        },
        requestId,
      },
      {
        requestId,
        status: healthy ? 200 : 503,
        cacheControl: "no-store, max-age=0",
      },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
