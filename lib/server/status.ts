import {
  rpcNetworkLabel,
  rpcNetworks,
  type RpcNetwork,
} from "./ethereum-rpc.ts";

export type OverallStatus =
  | "unknown"
  | "preview"
  | "operational"
  | "mixed"
  | "maintenance"
  | "degraded"
  | "incident";

type StatusService = {
  state: string;
};

type StatusIncident = {
  severity: string;
  state: string;
};

export type PublicStatusServiceRecord = {
  slug: string;
  name: string;
  description: string;
  state:
    | "preview"
    | "operational"
    | "degraded"
    | "partial_outage"
    | "major_outage"
    | "maintenance";
  updatedAt: number;
};

export type RpcNetworkStatusSnapshot = {
  configured: boolean;
  available: boolean;
};

export type GrpcStatusSnapshot = {
  configured: boolean;
  available: boolean;
};

export function reconcilePublicStatusServices(options: {
  services: PublicStatusServiceRecord[];
  rpc: Record<RpcNetwork, RpcNetworkStatusSnapshot>;
  grpc: GrpcStatusSnapshot;
  checkedAt?: number;
}): PublicStatusServiceRecord[] {
  const checkedAt = options.checkedAt ?? Date.now();
  let workspaceFound = false;
  let rpcInsertionIndex = options.services.findIndex(
    (service) =>
      service.slug === "rpc-mesh" ||
      rpcNetworks.some(
        (network) => service.slug === `rpc-${network}`,
      ),
  );
  const services = options.services
    .filter(
      (service) =>
        service.slug !== "rpc-mesh" &&
        service.slug !== "grpc-ethereum" &&
        !rpcNetworks.some(
          (network) => service.slug === `rpc-${network}`,
        ),
    )
    .map((service) => {
      if (service.slug === "developer-workspace") {
        workspaceFound = true;
        return {
          ...service,
          description:
            "Self-service accounts, workspaces, services, and scoped API keys are available.",
          state: "operational" as const,
          updatedAt: checkedAt,
        };
      }
      return service;
    });

  if (rpcInsertionIndex < 0) rpcInsertionIndex = Math.min(1, services.length);
  rpcInsertionIndex = Math.min(rpcInsertionIndex, services.length);
  services.splice(
    rpcInsertionIndex,
    0,
    ...rpcNetworks.map((network) =>
      rpcNetworkStatusService(
        network,
        options.rpc[network],
        checkedAt,
      ),
    ),
  );
  services.splice(
    rpcInsertionIndex + rpcNetworks.length,
    0,
    grpcStatusService(options.grpc, checkedAt),
  );
  if (!workspaceFound) {
    services.push({
      slug: "developer-workspace",
      name: "Developer workspace",
      description:
        "Self-service accounts, workspaces, services, and scoped API keys are available.",
      state: "operational",
      updatedAt: checkedAt,
    });
  }

  return services;
}

function grpcStatusService(
  snapshot: GrpcStatusSnapshot,
  checkedAt: number,
): PublicStatusServiceRecord {
  const state: PublicStatusServiceRecord["state"] = snapshot.available
    ? "operational"
    : snapshot.configured
      ? "degraded"
      : "preview";
  return {
    slug: "grpc-ethereum",
    name: "Ethereum native gRPC beta",
    description: snapshot.available
      ? "The native Ethereum HTTP/2 gateway passed its current gRPC serving-health verification."
      : snapshot.configured
        ? "Native Ethereum gRPC is configured, but the gateway did not pass its current serving-health verification."
        : "Native Ethereum gRPC is not configured in this deployment.",
    state,
    updatedAt: checkedAt,
  };
}

function rpcNetworkStatusService(
  network: RpcNetwork,
  snapshot: RpcNetworkStatusSnapshot,
  checkedAt: number,
): PublicStatusServiceRecord {
  const label = rpcNetworkLabel(network);
  const state: PublicStatusServiceRecord["state"] = snapshot.available
    ? "operational"
    : snapshot.configured
      ? "degraded"
      : "preview";
  const verification =
    network === "solana"
      ? "mainnet genesis and bounded health verification"
      : "mainnet chain identity verification";
  const description = snapshot.available
    ? `The bounded ${label} HTTP JSON-RPC gateway passed its current ${verification}.`
    : snapshot.configured
      ? `${label} RPC is configured, but no upstream passed its current ${verification}.`
      : `${label} RPC is not configured in this deployment.`;
  return {
    slug: `rpc-${network}`,
    name: `${label} RPC beta`,
    description,
    state,
    updatedAt: checkedAt,
  };
}

export function deriveOverallStatus(
  services: StatusService[],
  incidents: StatusIncident[],
): OverallStatus {
  const activeIncidents = incidents.filter(
    (incident) => incident.state !== "resolved",
  );
  if (
    services.some((service) => service.state === "major_outage") ||
    activeIncidents.some(
      (incident) =>
        incident.severity === "critical" || incident.severity === "major",
    )
  ) {
    return "incident";
  }
  if (
    services.some(
      (service) =>
        service.state === "degraded" ||
        service.state === "partial_outage",
    ) ||
    activeIncidents.some((incident) => incident.severity === "minor")
  ) {
    return "degraded";
  }
  if (
    services.some((service) => service.state === "maintenance") ||
    activeIncidents.length > 0
  ) {
    return "maintenance";
  }
  if (services.length === 0) return "unknown";
  if (services.every((service) => service.state === "operational")) {
    return "operational";
  }
  if (services.every((service) => service.state === "preview")) {
    return "preview";
  }
  return "mixed";
}
