export const NATIVE_GRPC_SERVICE_NAME =
  "nodezuno.ethereum.v1.EthereumProxy";
export const NATIVE_GRPC_METHOD = `${NATIVE_GRPC_SERVICE_NAME}/Call`;
export const NATIVE_GRPC_METADATA_NAME = "x-nodezuno-service-id";
export const NATIVE_GRPC_PROTO_PATH =
  "/proto/nodezuno/ethereum/v1/ethereum_proxy.proto";

export type NativeGrpcDescriptor = {
  endpoint: string;
  target: string;
  serviceName: typeof NATIVE_GRPC_SERVICE_NAME;
  metadataName: typeof NATIVE_GRPC_METADATA_NAME;
};

type GrpcServiceSnapshot = {
  status: string;
  endpointPath: string | null;
  configuration: Record<string, unknown>;
};

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export function nativeGrpcDescriptor(
  service: GrpcServiceSnapshot | null,
): NativeGrpcDescriptor | null {
  if (!service || service.status !== "active" || !service.endpointPath) {
    return null;
  }
  const authentication = recordValue(
    service.configuration.authentication,
  );
  if (
    service.configuration.provisioning !== "available" ||
    service.configuration.protocol !== "grpc" ||
    service.configuration.transport !== "http2" ||
    service.configuration.serviceName !== NATIVE_GRPC_SERVICE_NAME ||
    authentication?.scheme !== "bearer" ||
    authentication.requiredScope !== "grpc:invoke" ||
    authentication.serviceIdMetadata !== NATIVE_GRPC_METADATA_NAME
  ) {
    return null;
  }

  try {
    const url = new URL(service.endpointPath);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      (url.port !== "" && url.port !== "443")
    ) {
      return null;
    }
    return {
      endpoint: url.origin,
      target: url.port ? url.host : `${url.hostname}:443`,
      serviceName: NATIVE_GRPC_SERVICE_NAME,
      metadataName: NATIVE_GRPC_METADATA_NAME,
    };
  } catch {
    return null;
  }
}

export function nativeGrpcContractDownload(
  origin: string,
): string {
  const normalizedOrigin = origin.replace(/\/+$/, "");
  return [
    'mkdir -p "./proto/nodezuno/ethereum/v1"',
    `curl --fail --location "${normalizedOrigin}${NATIVE_GRPC_PROTO_PATH}" \\`,
    '  --output "./proto/nodezuno/ethereum/v1/ethereum_proxy.proto"',
  ].join("\n");
}

export function nativeGrpcurlExample({
  descriptor,
  serviceId,
}: {
  descriptor: NativeGrpcDescriptor;
  serviceId: string;
}): string {
  return [
    "grpcurl \\",
    '  -H "authorization: Bearer ${NODEZUNO_API_KEY}" \\',
    `  -H "${descriptor.metadataName}: ${serviceId}" \\`,
    '  -import-path "./proto" \\',
    '  -proto "nodezuno/ethereum/v1/ethereum_proxy.proto" \\',
    `  -d '{"method":"eth_blockNumber","params":[],"request_id":"quickstart"}' \\`,
    `  "${descriptor.target}" \\`,
    `  "${descriptor.serviceName}/Call"`,
  ].join("\n");
}
