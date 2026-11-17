import { requireAdminRequest } from "@/lib/server/admin";
import {
  consumeRateLimit,
} from "@/lib/server/database";
import { privateHash } from "@/lib/server/crypto";
import {
  loadEthereumRpcRuntimeConfiguration,
  pulseRpcRoutingSnapshot,
  rpcNetworks,
  rpcNetworkLabel,
  rpcProvisioningSnapshots,
} from "@/lib/server/ethereum-rpc";
import {
  grpcProvisioningSnapshot,
  loadGrpcRuntimeConfiguration,
} from "@/lib/server/grpc";
import {
  apiJson,
  requestIdFor,
  responseFromError,
} from "@/lib/server/http";

const expectedNetworkIdentity = {
  ethereum: "eth_chainId = 0x1",
  base: "eth_chainId = 0x2105",
  solana:
    "mainnet-beta genesis plus getHealth = ok",
} as const;

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  try {
    const admin = await requireAdminRequest(request);
    await consumeRateLimit({
      scope: "admin-node-attachments:read:identity",
      subjectHash: await privateHash(
        "admin-node-attachments",
        admin.email,
      ),
      limit: 120,
      windowMs: 60 * 60 * 1000,
    });
    const [
      rpcConfiguration,
      rpcProvisioning,
      grpcConfiguration,
      grpcProvisioning,
    ] = await Promise.all([
      loadEthereumRpcRuntimeConfiguration(),
      rpcProvisioningSnapshots(),
      loadGrpcRuntimeConfiguration(),
      grpcProvisioningSnapshot(),
    ]);
    const pulseSnapshots = await Promise.all(
      rpcNetworks.map((network) =>
        pulseRpcRoutingSnapshot({
          network,
          upstreams:
            rpcConfiguration.configurationValid
              ? rpcConfiguration.upstreamsByNetwork[network]
              : [],
        }),
      ),
    );
    const rpc = rpcNetworks.map((network, index) => {
      const configuredUpstreams =
        rpcConfiguration.configurationValid
          ? rpcConfiguration.upstreamsByNetwork[network].length
          : 0;
      const verifiedUpstreams =
        rpcProvisioning[network].upstreamCount;
      return {
        network,
        name: rpcNetworkLabel(network),
        configuredUpstreams,
        verifiedUpstreams,
        ready:
          rpcProvisioning[network].available &&
          verifiedUpstreams > 0,
        state:
          !rpcConfiguration.configurationValid
            ? "invalid_configuration"
            : configuredUpstreams === 0
              ? "not_configured"
              : verifiedUpstreams === 0
                ? "verification_failed"
                : "ready",
        expectedIdentity: expectedNetworkIdentity[network],
        safeReads:
          "Pulse verified-latency adaptive failover, at most two attempts",
        writes: "Configured primary, exactly one attempt",
        pulse: {
          scope: "process-local",
          upstreams: pulseSnapshots[index].map((upstream) => ({
            ...upstream,
            lastObservedAt:
              upstream.lastObservedAt === null
                ? null
                : new Date(upstream.lastObservedAt).toISOString(),
          })),
        },
      };
    });
    return apiJson(
      {
        data: {
          rpc,
          nativeGrpc: {
            configured: grpcConfiguration.configurationValid,
            endpointConfigured:
              grpcConfiguration.endpoint !== null,
            authenticationConfigured:
              grpcConfiguration.authenticationConfigured,
            ready: grpcProvisioning.available,
            state: !grpcConfiguration.configurationValid
              ? "not_configured"
              : grpcProvisioning.available
                ? "ready"
                : "verification_failed",
            serviceName:
              "nodezuno.ethereum.v1.EthereumProxy",
          },
          checkedAt: new Date().toISOString(),
        },
        requestId,
      },
      {
        requestId,
        cacheControl: "no-store, max-age=0",
        headers: { Vary: "Cookie" },
      },
    );
  } catch (error) {
    return responseFromError(error, requestId);
  }
}
