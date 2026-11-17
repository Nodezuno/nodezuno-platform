export type ConsoleServiceReadiness =
  | "callable"
  | "endpoint-missing"
  | "configuration-saved"
  | "archived";

export function resolveConsoleServiceReadiness(
  status: "active" | "configuration_saved" | "archived",
  endpoint: string | null,
): ConsoleServiceReadiness {
  if (status === "archived") return "archived";
  if (status !== "active") return "configuration-saved";
  return endpoint && endpoint.trim() ? "callable" : "endpoint-missing";
}

export function copyStatusMessage(
  state: "idle" | "copied" | "error" | undefined,
  subject: string,
): string {
  if (state === "copied") return `${subject} copied.`;
  if (state === "error") {
    return `${subject} was not copied. Select it and copy it manually.`;
  }
  return "";
}
