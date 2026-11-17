/**
 * The standalone build replaces the Cloudflare runtime module with this
 * unreachable stand-in. Container mode reads its own verified configuration
 * before any Sites binding is requested.
 */
export const env: Record<string, never> = {};
