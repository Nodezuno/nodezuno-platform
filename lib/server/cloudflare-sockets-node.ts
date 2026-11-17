/**
 * The standalone Node build replaces the Cloudflare socket module with this
 * unreachable stand-in. Container mode uses the native Node SMTP transport.
 */
export function connect(): never {
  throw new Error("cloudflare_sockets_unavailable_in_node_runtime");
}
