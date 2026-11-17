export type PublicSearchParams = Record<
  string,
  string | string[] | undefined
>;

export const legacyPublicAliases: Readonly<Record<string, string>> = {
  "how-it-works": "/methodology",
  "resources/docs": "/docs",
  "resources/faq": "/faq",
  "resources/status": "/status",
  "products/chain-cloud": "/product",
  "products/ai-operations": "/product",
  "products/ai-explorer": "/product#deliverables",
  "products/node-fleet": "/product",
  "products/consensus-ops": "/methodology",
  "products/testnet-kit": "/methodology",
  "products/snapshots": "/methodology#evidence",
  "products/observability": "/methodology#evidence",
  "products/one": "/product",
  "products/pulse": "/product",
  "products/rpc-api": "/product",
  "products/rollups": "/product",
  "products/nft-api": "/product",
  "products/webhooks": "/product",
  "products/websockets": "/product",
  "products/transfers-api": "/product",
  "products/token-api": "/product",
  "products/bundler-api": "/product",
  "products/gas-manager-api": "/product",
  "products/vault": "/product",
  "products/atlas": "/product",
  "solutions/wallets": "/product",
  "solutions/exchanges": "/product",
  "solutions/trading": "/product",
  "solutions/chains": "/product",
  "solutions/rollups": "/product",
  "solutions/ecosystems": "/product",
  "solutions/gaming": "/product",
  "solutions/protocol-teams": "/product",
  "solutions/stablecoin-rails": "/product",
  "solutions/fintech": "/product",
  "developers/support": "/company/contact",
  "developers/faucets": "/docs",
  "developers/gwei-calculator": "/docs",
  "developers/chain-directory": "/docs",
  "developers/benchmarks": "/resources/research",
  "developers/snapshots": "/docs",
  "community/academy": "/resources/research",
  "community/blog": "/resources/research",
  "community/customer-stories": "/company/newsroom",
  "community/overviews": "/methodology",
  "community/app-store": "/product",
  "community/events": "/company/contact",
  "community/offchain-bounties": "/security/responsible-disclosure",
  "community/onchain-bounties": "/security/responsible-disclosure",
  "community/discord": "/company/contact",
  "partners/grants": "/company/contact",
};

export const permanentPublicRedirects: Readonly<Record<string, string>> = {
  ...legacyPublicAliases,
  "product/coverage": "/product#coverage",
  "product/deliverables": "/product#deliverables",
  "how-it-works/engagement": "/methodology#process",
  "how-it-works/evidence": "/methodology#evidence",
  "how-it-works/scope": "/pricing#scope",
  "security/trust": "/security#ai-and-human-review",
  company: "/company/about",
  community: "/resources/research",
  "community/startup-program": "/review/start",
  console: "/account",
  contact: "/company/contact",
  "contact/sales": "/review/start",
  "contact/chain-launch": "/review/start",
  "contact/upgrade-assurance": "/review/start",
  developers: "/docs",
  "developers/docs": "/docs",
  "developers/signup": "/signup",
  "developers/status": "/status",
  products: "/product",
  resources: "/docs",
  solutions: "/methodology",
  start: "/review/start",
};

export function permanentPublicRedirectTarget(
  pathname: string,
): string | undefined {
  const normalized = pathname.replace(/^\/+|\/+$/g, "");
  return permanentPublicRedirects[normalized];
}

export function withSearchParams(
  pathname: string,
  values: PublicSearchParams,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      value.forEach((item) => search.append(key, item));
    } else if (value !== undefined) {
      search.append(key, value);
    }
  }

  const query = search.toString();
  if (!query) return pathname;

  const hashIndex = pathname.indexOf("#");
  if (hashIndex === -1) return pathname + "?" + query;

  const base = pathname.slice(0, hashIndex);
  const fragment = pathname.slice(hashIndex);
  return base + "?" + query + fragment;
}
