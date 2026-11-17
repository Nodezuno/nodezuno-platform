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
