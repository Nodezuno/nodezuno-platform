import type { DeveloperServiceRecord } from "./developer-platform.ts";
import {
  rpcNetworkLabel,
  type RpcNetwork,
  type RpcProvisioningSnapshot,
} from "./ethereum-rpc.ts";
import type { GrpcProvisioningSnapshot } from "./grpc.ts";

export function reconcileDeveloperServiceProvisioning(
  service: DeveloperServiceRecord,
  rpcProvisioning: Partial<
    Record<RpcNetwork, RpcProvisioningSnapshot>
  >,
  grpcProvisioning: GrpcProvisioningSnapshot,
): DeveloperServiceRecord {
  return reconcileGrpcProvisioning(
    reconcileRpcProvisioning(
      service,
      rpcProvisioning[service.network as RpcNetwork],
    ),
    grpcProvisioning,
  );
}

function reconcileGrpcProvisioning(
  service: DeveloperServiceRecord,
  provisioning: GrpcProvisioningSnapshot,
): DeveloperServiceRecord {
  if (
    service.product !== "grpc-api" ||
    service.network !== "ethereum" ||
    service.archivedAt !== null
  ) {
    return service;
  }
  const active =
    provisioning.available && provisioning.endpoint !== null;
  return {
    ...service,
    status: active ? "active" : "configuration_saved",
    endpointPath: active ? provisioning.endpoint : null,
    configuration: {
      ...service.configuration,
      maturity: active ? "beta" : "configuration",
      provisioning: active
        ? "available"
        : "awaiting_gateway_readiness",
      protocol: "grpc",
      transport: "http2",
      serviceName: "nodezuno.ethereum.v1.EthereumProxy",
      authentication: {
        scheme: "bearer",
        requiredScope: "grpc:invoke",
        serviceIdMetadata: "x-nodezuno-service-id",
      },
    },
  };
}

function reconcileRpcProvisioning(
  service: DeveloperServiceRecord,
  provisioning: RpcProvisioningSnapshot | undefined,
): DeveloperServiceRecord {
  if (
    service.product !== "rpc-api" ||
    !["ethereum", "base", "solana"].includes(service.network) ||
    provisioning === undefined ||
    service.archivedAt !== null
  ) {
    return service;
  }
  const active = provisioning.available && provisioning.upstreamCount > 0;
  const network = service.network as RpcNetwork;
  return {
    ...service,
    status: active ? "active" : "configuration_saved",
    endpointPath: active ? `/api/v1/rpc/${service.id}` : null,
    configuration: {
      ...service.configuration,
      maturity: active ? "beta" : "configuration",
      provisioning: active
        ? "available"
        : "awaiting_upstream_configuration",
      protocol:
        network === "solana"
          ? "solana-json-rpc-2.0"
          : "evm-json-rpc-2.0",
      network: {
        id: network,
        name: rpcNetworkLabel(network),
      },
      authentication: {
        scheme: "bearer",
        requiredScope: "rpc:invoke",
      },
      routing: {
        strategy: "pulse_adaptive_failover",
        safeReads:
          "verified_latency_ewma_with_circuit_breaker",
        writes: "configured_primary_single_attempt",
        configuredUpstreams: active ? provisioning.upstreamCount : 0,
      },
    },
  };
}
