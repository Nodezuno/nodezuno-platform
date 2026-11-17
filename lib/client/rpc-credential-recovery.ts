export type OneTimeCredentialState =
  | "setup-incomplete"
  | "saved-key-required"
  | "credential-in-tab";

export type OneTimeCredentialAvailability =
  | "no-key"
  | "saved-key-required"
  | "credential-in-tab";

export function resolveOneTimeCredentialAvailability({
  activeKeyExists,
  rawSecretAvailable,
}: {
  activeKeyExists: boolean;
  rawSecretAvailable: boolean;
}): OneTimeCredentialAvailability {
  if (!activeKeyExists) return "no-key";
  return rawSecretAvailable ? "credential-in-tab" : "saved-key-required";
}

export function resolveOneTimeCredentialState({
  activeKeyExists,
  gatewayReady,
  rawSecretAvailable,
}: {
  activeKeyExists: boolean;
  gatewayReady: boolean;
  rawSecretAvailable: boolean;
}): OneTimeCredentialState {
  const availability = resolveOneTimeCredentialAvailability({
    activeKeyExists,
    rawSecretAvailable,
  });
  return !gatewayReady || availability === "no-key"
    ? "setup-incomplete"
    : availability;
}

export function recoveryKeyPayload(name: string, serviceId: string) {
  return {
    name,
    serviceId,
  };
}

export const resolveRpcCredentialState = resolveOneTimeCredentialState;

export function rpcRecoveryKeyPayload(
  serviceId: string,
  name = "Ethereum recovery key",
) {
  return recoveryKeyPayload(name, serviceId);
}

export function grpcRecoveryKeyPayload(serviceId: string) {
  return recoveryKeyPayload("Ethereum gRPC recovery key", serviceId);
}
