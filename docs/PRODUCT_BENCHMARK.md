# Nodezuno self-service product benchmark

**Audience:** Internal product, engineering, design, security, and operations
**Evidence date:** 18 July 2026
**Status:** Implementation benchmark, not public marketing material

## Purpose

This document compares the public self-service RPC paths of QuickNode and
Alchemy with the current Nodezuno source boundary. It converts verified
competitor behavior into testable Nodezuno requirements.

It does not establish that a proposed Nodezuno feature exists. A requirement
becomes an availability claim only after implementation, deployment, and the
release evidence in [RELEASE.md](RELEASE.md).

## Research method and limits

- Sources are current public pages, documentation, and support articles
  published by QuickNode or Alchemy.
- No competitor account was created. No form was filled or submitted.
- A numbered documentation stage is not treated as a literal browser click.
- Direct browser observations were made on 18 July 2026. QuickNode's signup
  destination at `https://dashboard.quicknode.com/?prompt=signup` visibly
  offered Google, SSO, full name, organization, work email, password, terms
  acceptance, and CAPTCHA controls. Alchemy's signup destination at
  `https://auth.alchemy.com/` visibly offered Google, first name, last name,
  email, and password controls.
- These observations describe the controls visible on that date only. They do
  not establish successful provider authentication, eligibility, or a durable
  product contract.
- Prices, limits, and product packaging can change. Recheck every linked source
  before using this document for a product or pricing decision.

## Source index

### QuickNode

- [Landing page](https://www.quicknode.com/)
- [Signup entry](https://www.quicknode.com/signup)
- [Pricing](https://www.quicknode.com/pricing)
- [One-month trial policy](https://support.quicknode.com/articles/5387074982-1-month-free-trial)
- [Account password and Google Sign-in support](https://support.quicknode.com/articles/2437902161-how-do-i-reset-the-password-on-my-account)
- [Ethereum RPC quickstart](https://www.quicknode.com/docs/ethereum/quickstart)
- [Endpoint security practices](https://www.quicknode.com/guides/quicknode-products/endpoint-security/endpoint-security-best-practices)
- [Admin API access](https://www.quicknode.com/docs/admin-api)
- [SDK quickstart](https://www.quicknode.com/docs/sdk/quick-start)
- [CLI](https://www.quicknode.com/docs/cli)

### Alchemy

- [Landing page](https://www.alchemy.com/)
- [Signup](https://auth.alchemy.com/)
- [Login](https://auth.alchemy.com/login/)
- [Pricing](https://www.alchemy.com/pricing)
- [Current no-card statement](https://www.alchemy.com/overviews/web3-stack)
- [Create an API key](https://www.alchemy.com/docs/create-an-api-key)
- [Make a first request](https://www.alchemy.com/docs/make-your-first-request)
- [Support guide for creating an app](https://www.alchemy.com/support/how-to-create-a-new-alchemy-api-key)
- [Admin API quickstart](https://www.alchemy.com/docs/reference/admin-api/quickstart)

## Verified competitor benchmark

| Dimension | QuickNode | Alchemy |
| --- | --- | --- |
| Primary landing action | “Start Building for Free,” with “Contact Us” as a separate path | “Access APIs,” with “Talk to sales” as a separate path |
| Product posture | One account across RPC, streams, indexed data, and developer tooling | One platform across node, data, wallet, transaction, webhook, and dedicated infrastructure products |
| Direct signup observation, 18 July 2026 | “Continue with Google,” an SSO path, full name, organization, work email, password, terms acceptance, and CAPTCHA | “Continue with Google,” first name, last name, email, and password |
| Entry offer | One-month free trial, $0, 10M API credits, 15 RPS, one endpoint, Streams, Webhooks, and community support | Ongoing Free plan, 30M CU/month, 25 RPS, five apps, five webhooks, all mainnets and testnets, and standard support |
| Card requirement | No card is required to activate the one-month trial | Current official material states no card, waitlist, or contract for the free API key |
| End of free access | Services are disabled after 30 days unless the account upgrades | Free capacity renews monthly within the published plan limits |
| Standard paid access | Build through Business plans use self-service “Get started” actions | Pay As You Go uses the dashboard and supports direct Free-to-PAYG upgrades |
| Sales boundary | Enterprise, custom RPS, dedicated clusters, SSO, committed SLAs, and high-volume requirements | Enterprise custom pricing, advanced security, SLAs, and premium support |
| Programmatic management | Dashboard endpoint management plus CLI, SDK, MCP, and Admin API; the Admin API covers endpoints, usage, billing, keys, and security and requires a paid plan | Dashboard app/key and per-network endpoint management plus a documented App Management Admin API |

## Verified path to a first RPC credential

### QuickNode

The official Ethereum quickstart publishes four stages from no account to a
provider URL:

1. Create a QuickNode account.
2. Open the Endpoints dashboard.
3. Select “Create an Endpoint,” Ethereum, and the desired network.
4. Copy the HTTP provider URL.

The user can then send `eth_blockNumber` to that URL. This is four documented
stages from no account, or three after account creation. It is not an exact
click count because selecting the chain and network can involve multiple UI
interactions.

QuickNode advises treating the endpoint URL as sensitive API-key material.
Endpoint security and token rotation follow after creation.

### Alchemy

Alchemy documents that a recently created account already has a default app
and API key. This removes app creation from the minimum first-credential path.
The user must still open the app, copy the key, and use its endpoint.

The documented path for an additional app is:

1. Open Team Overview.
2. Open Apps.
3. Select “Create new app.”
4. Choose the app name, optional description, chains, and services.
5. Select “Create App.”
6. Copy the API key.
7. Open Endpoints to obtain the HTTP or WebSocket URL.

Alchemy’s first-request guide then exports the key and sends `eth_gasPrice` to
Ethereum mainnet.

## Current Nodezuno source boundary

The current source implements the following pieces:

- account, session, workspace, service-record, and one-time API-key paths;
- product-intent routing through `/start`, `/signup`, and `/console`;
- an explicit Ethereum, Base, or Solana selection in the RPC launchpad;
- one deliberate guided action that creates only a missing workspace, selected
  mainnet development service, and service-bound key, without a sales approval
  route;
- resumable onboarding that reuses the persisted workspace, service, or key
  records already present when the console reloads;
- a bounded Ethereum, Base, and Solana JSON-RPC beta at
  `POST /api/v1/rpc/{serviceId}`;
- `rpc:invoke`, same-workspace authorization, two hourly quota tiers, and
  aggregate usage telemetry;
- fail-closed RPC activation that requires a real HTTPS upstream verified as
  the selected mainnet;
- a published free-beta boundary with no payment card, default limits of 1,000
  weighted quota units per API key and service per hour and 10,000 units per
  workspace per hour, and no paid billing; and
- a sales boundary reserved for future dedicated capacity, SSO, contractual
  SLAs, migration assistance, or premium support.

The guided path asks a first-time user for a company or workspace name, then
uses the selected mainnet with fixed safe defaults for the development
environment, global routing, and a key bound to the created service. It is a
deliberate console action, not background provisioning at account creation.
Advanced forms remain available for additional services, exact service-bound
product keys, and separate unbound identity or service-management keys.
Billing, payment collection, self-service paid upgrades, spend alerts,
invoices, and enterprise contracts are not implemented.

The source assumes Nodezuno attaches operator-managed nodes through a cloud
provider. It does not download nodes to a developer laptop and does not claim
that any cloud node is already attached. Ethereum requires `eth_chainId`
`0x1`, Base requires `0x2105`, and Solana requires the canonical mainnet genesis
hash followed by `getHealth: "ok"`. See
[NODE_ATTACHMENT.md](NODE_ATTACHMENT.md) for the provider-neutral operating
contract.

See [SELF_SERVICE.md](SELF_SERVICE.md), [API.md](API.md), and
[BACKEND.md](BACKEND.md) for the executable boundary.

## Product requirements

The priority labels below describe implementation order. They do not describe
current availability.

### P0: required before a public self-service RPC claim

| Requirement | Acceptance condition |
| --- | --- |
| One dominant product action | Every available RPC product page routes to `/start?product=rpc-api`; product intent survives signup and lands in the correct console flow |
| No manual approval | A normal customer can complete account, workspace, service, and key setup without sales or administrator action |
| Default first-run context | After authentication, the customer sees a guided onboarding state instead of an empty console; its create-only-missing behavior must remain retry-safe and auditable |
| Short credential path | From a valid authenticated session, the customer needs no more than two deliberate UI actions to issue and copy a usable RPC credential |
| Immediate verification | One additional action can run the selected network probe, `eth_chainId` for Ethereum/Base or `getHealth` for Solana, and display the real response, request ID, and quota state |
| Fail-closed product truth | Missing, invalid, unreachable, or wrong-chain upstream configuration never produces an active endpoint or success demo |
| Explicit free-entry contract | The public plan states duration, card requirement, service count, request/call limits, reset period, support level, and exhaustion behavior |
| Honest product availability | Prelaunch products cannot present a working endpoint, usable credential, or active state |
| Secure default credential use | Examples use `Authorization: Bearer` and environment variables; the raw key is disclosed once, is never placed in analytics, and can be revoked |
| Complete first-call guide | The console shows endpoint path, service ID, copy controls, a complete cURL request, expected response shape, and relevant errors |

### P1: required for repeatable team adoption

| Requirement | Acceptance condition |
| --- | --- |
| Environment separation | Customers can intentionally distinguish development, staging, and production services without ambiguous defaults |
| Credential operations | Key list, one-time issue, revocation, expiry, last-used state, and replacement guidance are visible and tested |
| Usage visibility | The console explains both quota tiers, method weights, actual call count, weighted consumption, reset time, and the reason for a `429` response |
| Alerts and budgets | Usage alerts and spend controls are implemented before any automatic paid overage is enabled |
| Self-service commercial lifecycle | Upgrade, downgrade, payment method, invoice, plan limit, and cancellation behavior work without sales for standard plans |
| Contextual documentation | Examples contain the customer’s actual service ID and endpoint path while never embedding the complete key in persistent page source or logs |
| Operational evidence | Request logs and status views expose safe metadata and request IDs without persisting JSON-RPC parameters, bodies, or responses |
| Security controls | Method restrictions, key rotation, and appropriate IP or origin controls have clear defaults, tests, and recovery guidance |

### P2: differentiation after the browser path is reliable

| Requirement | Acceptance condition |
| --- | --- |
| Management API and CLI | Customers can create, inspect, and archive services and keys programmatically with scoped credentials and confirmation-safe writes |
| Agent onboarding | Agent-native signup or payment is released only after identity isolation, quotas, credential rotation, abuse controls, and commercial rules are verified |
| Enterprise branch | Contact sales is reserved for dedicated infrastructure, custom capacity, SSO, contractual SLAs, migration, and premium support |
| Multi-product workspace | Additional live products reuse the same workspace, identity, audit, and usage model without implying that prelaunch products are available |
| Safer credential ergonomics | Header-based examples remain the default, with secret scanning and copy-time warnings that improve on credential-bearing endpoint URLs |

## Measurable funnel

### Event definitions

| Event | Definition |
| --- | --- |
| `start_viewed` | `/start?product=rpc-api` renders with recognized product intent |
| `signup_started` | The customer selects an enabled account method |
| `session_ready` | A valid application session is established |
| `workspace_ready` | An active workspace and owner membership are available |
| `rpc_service_ready` | An active same-workspace RPC service for the selected network has a non-null endpoint path |
| `rpc_key_issued` | A scoped key is created and its raw secret is shown once |
| `rpc_key_copied` | The customer explicitly copies the disclosed key |
| `first_rpc_succeeded` | The service returns the expected selected-network probe result through the Nodezuno route |

Event payloads must use internal IDs and coarse timing only. They must not
contain passwords, wallet signatures, raw API keys, upstream URLs, RPC request
parameters, bodies, or responses.

### Funnel target

- Post-auth interaction budget: at most two deliberate UI actions from
  `session_ready` to `rpc_key_copied`.
- First-test interaction budget: at most one additional action from
  `rpc_key_copied` to `first_rpc_succeeded`.
- Time to credential: p90 at or below 120 seconds from `session_ready` to
  `rpc_key_copied`.
- Time to first RPC: p90 at or below 180 seconds from `session_ready` to
  `first_rpc_succeeded`.
- Clean-run completion: at least 9 of 10 consecutive isolated acceptance runs
  reach `first_rpc_succeeded` without sales, administrator action, or manual
  database changes.
- Truth requirement: zero runs may report `rpc_service_ready` when the selected
  upstream is missing, invalid, unreachable, on the wrong EVM chain, or on the
  wrong/unhealthy Solana cluster.

Email delivery time is measured separately from the post-auth product funnel.
Wallet, Google, and verified email paths should each report their own
`signup_started` to `session_ready` conversion and latency.

## Acceptance criteria: account to first successful RPC

Run these criteria in an approved isolated environment with the required
selected-database migrations and reviewed Ethereum, Base, and Solana mainnet
upstreams. Run the happy path once per network. Passing proves only the tested
environment. It does not establish public production availability.

### Happy path

1. Open `/start?product=rpc-api` while signed out.
2. Confirm the page describes the Ethereum, Base, and Solana RPC beta and does
   not require a sales contact.
3. Continue to signup and confirm the safe same-origin return path preserves
   `product=rpc-api`.
4. Complete one enabled account method using an isolated test identity.
5. Confirm a valid session exists and synthetic wallet email is not displayed
   or used for workspace authorization.
6. Confirm an active workspace and owner membership are available exactly once
   after retries or refreshes.
7. Select the network and confirm its `rpc-api` service becomes active only
   after the upstream passes the bounded activation probe: Ethereum
   `eth_chainId: 0x1`, Base `eth_chainId: 0x2105`, or the Solana mainnet genesis
   hash followed by `getHealth: "ok"`.
8. Issue a key with `rpc:invoke`; confirm the complete key appears only in the
   creation response and one-time disclosure state. Confirm its `serviceId`
   matches the created service.
9. Copy the key and confirm the console provides a complete request using the
   network's probe method. The Ethereum example is:

```http
POST /api/v1/rpc/<service-id>
Authorization: Bearer nzu_live_<key-id>_<secret>
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_chainId",
  "params": []
}
```

10. Run the request through the Nodezuno route.
11. Confirm HTTP `200`, JSON-RPC version `2.0`, matching ID `1`, and the expected
    result: `0x1` for Ethereum, `0x2105` for Base, or `"ok"` for Solana.
12. Confirm the response publishes key/service and workspace rate-limit
    metadata.
13. Confirm aggregate database usage increments while request parameters, bodies,
    customer headers, bearer credentials, and upstream responses are absent
    from database telemetry and structured logs. Confirm weighted
    `quota_units` and actual `rpc_call_count` remain distinguishable.
14. Confirm the complete path meets the interaction, latency, and completion
    targets above.

### Required denial and failure checks

- A missing, invalid, unreachable, wrong-chain EVM, wrong-cluster Solana, or
  unhealthy Solana upstream leaves the selected service at
  `configuration_saved`, returns no endpoint, and cannot run a success demo.
- A missing or malformed bearer key is rejected.
- A key without `rpc:invoke` is rejected.
- A service-bound key presented to a different service is rejected with HTTP
  `403`, JSON-RPC code `-32003`, and `api_key_service_denied`.
- A revoked or expired key is rejected.
- A valid key from another workspace cannot discover or invoke the service.
- A request over 256 KiB is rejected before forwarding.
- A batch over 20 calls is rejected before forwarding.
- Empty or malformed JSON returns `-32700` with a null ID.
- A structurally invalid request or empty batch returns `-32600`.
- A mixed batch executes valid members and returns per-item invalid-request
  errors in caller order.
- A bounded expensive-read parameter violation returns `-32602`.
- A blocked administrative, signer, filter, subscription, or unsafe method
  never reaches an upstream.
- EVM quota enforcement applies weights of one for ordinary methods, three for
  `eth_call` and `eth_feeHistory`, five for `eth_getProof`, and ten for
  `eth_getLogs`.
- Solana quota enforcement applies weights of one for ordinary methods, three
  for `getBlocks` and `getBlocksWithLimit`, five for `getBlock`,
  `getTransaction`, the token-account queries, and `simulateTransaction`, and
  ten for `getProgramAccounts`.
- Exhausting either hourly quota returns HTTP `429` and JSON-RPC code `-32005`.
- Upstream failure and timeout return the documented `502` and `504` behavior
  without fabricated results.
- Customer cookies, origin, forwarding headers, and Nodezuno bearer credentials
  are never forwarded upstream.
- Refreshing, retrying, or replaying onboarding does not create duplicate
  owner workspaces or disclose an earlier raw key.

### Experience and accessibility checks

- Keyboard-only users can complete signup, onboarding, key copy, and first test.
- Focus is moved to validation errors and the one-time key disclosure.
- Copy and test actions have visible success and failure states that do not rely
  on color alone.
- Mobile and narrow layouts preserve the endpoint, key warning, and request
  example without horizontal page overflow.
- No menu, modal, or onboarding panel traps focus or requires a pointer.

## Release evidence

The accountable release owner should retain:

- the exact commit and selected-database migration set;
- environment and upstream review record without the secret URL;
- ten clean-run funnel results with event timestamps and interaction counts;
- one successful request ID and redacted response evidence;
- denial evidence for scope, revocation, tenant isolation, limits, and quotas;
- log and selected-database inspection proving secret and payload exclusion;
- screenshots of desktop, mobile, keyboard focus, validation, one-time key, and
  first-request states; and
- the approved free-plan and sales-boundary copy.

Re-run the competitor source review and this acceptance suite before changing a
public self-service, pricing, or first-call claim.
