# Nodezuno content governance

> **Status: superseded historical policy.** Do not use this file to make
> current public claims. The canonical product and document status is in
> [README.md](README.md); current public copy must describe Upgrade Assurance
> as the sole offer.

**Applies to:** Nodezuno.com pages, catalogs, API documentation, whitepaper,
press materials, downloadable assets, and public announcements
**Policy version:** 1.1
**Effective:** 18 July 2026

## Purpose

Nodezuno is presenting a future infrastructure platform while implementing a
website application, self-service identity control plane, and bounded
Ethereum, Base, and Solana JSON-RPC beta. Content must distinguish source
implementation, operator configuration, private deployment, public release,
and broader blockchain product availability.

This policy prevents an architecture concept, interface illustration, roadmap
item, seeded catalog row, or successful website deployment from being
misrepresented as a live blockchain product. It also defines the evidence and
approval required for customer, performance, security, legal, and commercial
claims.

## Non-negotiable truth boundary

### Live now

The following may be described as live when the current production checks pass:

- the Nodezuno.com frontend;
- the website health API;
- Better Auth customer accounts and durable database-backed sessions;
- supported EVM and Solana wallet authentication;
- self-service developer workspace provisioning;
- durable service records, with `platform-api` active, a validly configured
  Ethereum, Base, or Solana `rpc-api` active at beta maturity, and other
  blockchain products explicitly configuration-only;
- one-time API-key issue, metadata listing, and revocation;
- the `platform:identity` key-authentication probe;
- the bounded Ethereum, Base, and Solana JSON-RPC route at
  `POST /api/v1/rpc/{serviceId}` when a real operator upstream is configured,
  with `rpc:invoke`, same-workspace authorization, an exact least-privilege
  service binding, two hourly quota tiers, strict payload limits, and
  aggregate telemetry;
- database-backed public request intake;
- account-ID-bound request history;
- restricted, audited website administration;
- newsletter consent storage and token-based unsubscribe suppression;
- the deterministic gas calculator;
- the status route that reconciles current developer-control-plane and bounded
  per-network RPC readiness plus native gRPC serving health with planned
  catalog entries;
- the database-backed prelaunch chain catalog; and
- the website API documentation and OpenAPI contract.

The bounded product may be described as a free beta only with its complete
commercial boundary: Ethereum, Base, and Solana mainnet HTTP JSON-RPC, no
payment card, default limits of 1,000 weighted quota units per API key and
service per hour and 10,000 units per workspace per hour, and no paid billing
or automatic overage. Sales is not an admission step. It is reserved for
future dedicated capacity, SSO, contractual SLAs, migration assistance, or
premium support. Whenever a published quota is stated, disclose the applicable
network-specific method weights.

Planned status entries and chain data remain prelaunch. This distinction must
appear near catalog output even though the status route also carries bounded
current readiness.

### Not established by this repository

The following are proposed product-plane capabilities until separately
deployed and evidenced:

- a Nodezuno-owned multi-chain node fleet and WebSocket endpoints beyond the
  bounded attached-upstream gateway;
- a live native gRPC deployment. The source target is separately deployable
  and uses website workspaces and database key lifecycle in `control-plane` mode,
  but source integration is not deployment evidence;
- transaction simulation, orchestration, replacement, and finality tracking;
- webhooks and onchain event delivery;
- NFT, token, transfer, portfolio, trace, stream, and indexed-data APIs;
- ERC-4337 bundling and paymaster/gas sponsorship;
- signer policy, approvals, HSM/MPC integrations, and key isolation;
- rollup launch or day-two operations;
- public faucets and downloadable snapshots;
- paid product entitlements, billing, invoices, automatic overage, contractual
  support SLAs, or service credits;
- public uptime history, latency/throughput results, certifications, audit
  outcomes, or recovery objectives; and
- named customers, logos, quotations, or measured outcomes.

No visual polish, route completeness, seed data, demo console, whitepaper text,
or investor presentation changes this maturity boundary.

## Content classes and required labels

Every substantive public claim must belong to one class.

| Class | Meaning | Required language |
| --- | --- | --- |
| **Live website** | Implemented Nodezuno.com behavior verified in production | “Live website API”, “stored request”, or equally scoped language |
| **Live identity control plane** | Implemented account/session, workspace/key/service lifecycle, and identity probe verified in production | Name the exact route, scope, limits, and service maturity; state that no blockchain product entitlement is implied |
| **Bounded product beta** | Implemented product route with a narrow contract and verified operator dependency | Name the route, chain, transport, free/no-card terms, maturity, auth scope, quotas, upstream dependency, deployment evidence, sales boundary, and explicit exclusions |
| **Current readiness status** | A current control-plane check or bounded upstream verification, without historical uptime meaning | Name the checked component, observation time, verification limit, planned entries, and explicit denial of historical uptime and chain-wide telemetry |
| **Prelaunch catalog** | Working publication surface containing non-operational product plan data | “Prelaunch”, plus a disclaimer that it is not live platform telemetry/availability |
| **Planned** | Intended capability with no availability claim | “Planned”, “will require”, or “release contract” |
| **Preview** | Private design/build or constrained validation; not general availability | “Private preview” or “in private build”; never “production-ready” by itself |
| **Proposed architecture** | Technical model not proven by deployment | “Proposed”, “designed to”, or “architecture target” |
| **Draft research** | Versioned analysis open to correction | Draft version and publication date |
| **Verified product capability** | Separately deployed capability with current evidence | Exact scope, environment, region/chain, evidence date, limitations, and owner |
| **Binding commitment** | Legal, commercial, security, or service obligation | Counsel/authorized commercial approval and the controlling document |

If a sentence combines classes, split it. For example:

> The website request API is live. Nodezuno's transaction orchestration plane
> remains a proposed design-partner capability.

Do not write:

> Nodezuno is live with transaction orchestration.

## Status-service maturity

The `status_services.state` field accepts the following labels. These values
control a public truth surface and require conservative use.

| State | Publication rule |
| --- | --- |
| `preview` | Component is a private build/catalog item; no live uptime claim |
| `operational` | The scoped production component exists, is monitored, and current evidence shows normal operation |
| `degraded` | The scoped component operates below its defined customer-impact threshold |
| `partial_outage` | A material subset of the scoped component is unavailable |
| `major_outage` | The component or customer operation is broadly unavailable |
| `maintenance` | A communicated maintenance window affects the scoped component |

The migration seeds all services as `preview`. Public reads then reconcile
implemented entries. Developer workspace becomes `operational` as current
control-plane readiness. RPC becomes `operational` only after the release
contract's bounded configured-network verification, `degraded` when configured
but unverified, and `preview` when unconfigured. Planned catalog entries retain
their curated preview state. Status copy must identify whether it is an
aggregate multi-chain signal or a per-network signal.

This reconciliation is not historical monitoring. An administrator can change
other rows and the change is audited, but code does not verify the evidence
behind a manual state. Before manually publishing another `operational` state,
the accountable platform owner must document:

- the production component and environment;
- what the public component name includes and excludes;
- monitored signals and customer-impact thresholds;
- update and escalation ownership;
- incident publication procedure;
- test evidence for data freshness and failure behavior; and
- the review date and evidence location.

Never use `operational` to mean “the page exists”, “engineering is working on
it”, “a demo succeeded”, or “a seed row is present”. Never infer uptime history
from the runtime-reconciled current status.

## Chain maturity

The `chains.support_stage` field accepts:

| Stage | Meaning |
| --- | --- |
| `planned` | Chain appears in the plan; no endpoint or data availability |
| `preview` | Private/constrained validation; availability and support commitments are not public |
| `data_only` | A named, separately deployed data capability is verified for the stated chain; execution/RPC is not implied |
| `full` | Every specifically published capability for the chain is verified; unspecified capabilities remain out of scope |

The application prevents promotion to `data_only` or `full` while
`capabilities_json` is empty. This is a minimum schema guard, not evidence.

Before a strong promotion, retain:

- chain and network identifier;
- environment and regions;
- exact capabilities and exclusions;
- endpoint/data contract version;
- finality and reorg assumptions;
- test method, date, sample, and result;
- failure, recovery, and support behavior;
- security and dependency review;
- accountable owner and independent reviewer; and
- planned revalidation date.

`verified_at` records the authorized promotion time. It does not prove the
underlying test and must not be cited without the evidence record.

## Claim evidence record

Every high-impact claim must have an internal evidence record before
publication.

Minimum fields:

```text
claim_id
public_statement
content_class
scope_and_exclusions
source_artifacts
measurement_or_verification_method
environment
captured_at
evidence_owner
independent_reviewer
approval_status
approved_at
review_or_expiry_at
public_destinations
correction_or_withdrawal_history
```

A link, ticket, dashboard, or document name is not enough by itself. The record
must preserve the exact result used to support the exact public wording.

## Evidence hierarchy

Prefer evidence in this order:

1. reproducible production measurements with raw results and methodology;
2. controlled acceptance or recovery tests with immutable output;
3. deployed configuration and versioned API/schema artifacts;
4. independent security, compliance, or financial reports within their exact
   scope;
5. signed customer approval and source data for customer claims;
6. primary protocol specifications for protocol behavior; and
7. reviewed engineering analysis for proposed architecture.

The following are context, not sufficient proof of a strong claim:

- a screenshot without environment, date, and source;
- a single successful request;
- a design mockup;
- local or synthetic benchmark output presented as production;
- an internal plan, issue, or roadmap;
- a customer conversation without written publication consent;
- a certification logo without a current scoped certificate;
- an administrator setting a catalog state; or
- an AI-generated summary without primary-source review.

## Ownership and approval matrix

Use accountable roles until named owners are formally assigned. The author
cannot be the only approver for a high-impact claim.

| Claim type | Evidence owner | Required reviewer/approver |
| --- | --- | --- |
| Website/API behavior | Website engineering | Release owner |
| Product availability or capability | Platform engineering | Product operations + security where relevant |
| Chain support/finality/capability | Chain operations | Platform reliability |
| Status/incident impact | Service owner | Incident commander or operations lead |
| Performance/uptime/freshness | Reliability engineering | Independent technical reviewer |
| Security control or bounty scope | Security | Legal for safe harbor/reward terms |
| Certification/audit result | Security/compliance | Legal; preserve exact report scope |
| Customer name/logo/quote/outcome | Customer owner | Customer's written approver + communications |
| Pricing, credits, discounts, service level | Commercial owner | Finance + legal |
| Legal entity, privacy, terms, acceptable use | Legal | Authorized company signatory |
| Hiring role, compensation, location, benefit | People owner | Finance/legal as applicable |
| Newsroom or press fact | Communications | Source-domain owner |
| Whitepaper architecture | Technical author | Security + platform architecture |

Administrator access is authorization to make a database change. It is not
automatic approval for the claim represented by that change.

## Publication workflow

### 1. Draft

- Assign a content class.
- State scope and exclusions.
- Use proposed or prelaunch language by default when evidence is incomplete.
- Link the claim to its evidence record.

### 2. Substantiate

- Capture the primary artifact.
- Record environment, time, version, and method.
- Reproduce results where the claim is measurable.
- Record limitations and counterexamples.

### 3. Review

- Domain owner verifies technical accuracy.
- Independent reviewer challenges scope and wording.
- Security, legal, finance, customer, or people approval is added when the
  matrix requires it.

### 4. Publish

- Use the approved exact wording.
- Include maturity, date, scope, and limitations near the claim.
- Update every destination in the evidence record.
- For database-backed status or chain changes, use the restricted admin
  control so the public state change is audited.

### 5. Monitor

- Revalidate on evidence expiry, product release, dependency change, incident,
  contract change, or customer withdrawal.
- Compare related pages to prevent contradictory maturity labels.

### 6. Correct or withdraw

- Remove a materially false, unsafe, expired, or unauthorized claim
  immediately.
- Preserve what changed, why, when, and who approved the correction.
- Publish a visible correction when the original claim was material or widely
  distributed.

## Content-specific rules

### Product and solution pages

- Present architecture and intended outcomes as proposed until the capability
  has a separate verified product release.
- A product page may link directly to the released self-service console. It
  must not imply that a workspace or key activates a prelaunch product.
- Do not show fake blockchain endpoints, regions, transaction hashes, status
  lights, or customer activity in a way that could be read as live data.
- API-key examples must use unmistakable placeholders and must never contain a
  complete issued secret.
- Label interface diagrams and consoles as conceptual when they are not backed
  by a deployed product.
- Do not convert an aspiration such as “policy before signature” into an
  absolute security guarantee.

### Developer documentation

- Keep live website and identity-control-plane API documentation separate from
  blockchain product-plane preview material.
- Examples must match executable schemas and exact validation bounds.
- Every example must avoid real credentials and personal data.
- Document failure behavior, rate limits, idempotency, cache policy, and
  maturity, not only the happy path.
- The OpenAPI document covers implemented public routes only.
- Do not publish a product SDK package, install command, or endpoint hostname
  until the package and service are actually released.

### Status

- Status scope must say whether it covers Nodezuno.com or separately deployed
  product infrastructure.
- Never infer historical uptime from a current state.
- Describe developer workspace as current control-plane readiness only.
- Describe RPC as current bounded configured-network upstream verification
  only. State the included networks. Configured but unverified is `degraded`;
  unconfigured is `preview`.
- Do not publish “all systems operational” while planned catalog entries
  remain `preview`.
- Incident wording must identify affected capability, environment, known
  impact, start time, update time, and uncertainty.
- A resolution update must distinguish service recovery from root-cause
  completion.

### Benchmarks

No performance result may be published without:

- test date and duration;
- environment, region, chain/network, client and version;
- workload, payloads, concurrency, warm/cold state, and sample size;
- p50, p95, p99, errors, timeouts, exclusions, and retry treatment;
- independent timing source and comparison method;
- raw-result access or durable evidence location;
- reproducible harness/version; and
- limitations and material dependencies.

Do not publish a best run as typical performance, combine unlike providers, or
turn a laboratory result into an uptime or production-capacity claim.

### Customers and customer stories

Before publishing a customer identity, logo, quotation, architecture, or
outcome:

- obtain written approval for the exact asset and wording;
- define the relationship and time period;
- verify measurements and baseline;
- state workload and material limitations;
- remove confidential architecture and personal data;
- retain the customer's approver and withdrawal path; and
- set a review date.

Design-partner interest, a submitted form, a meeting, or an evaluation is not a
customer deployment. Anonymous stories must still be factual and approved; do
not composite multiple customers into a fictional narrative.

### Security

- Do not claim “secure”, “zero trust”, “non-custodial”, “tamper-proof”, or
  “enterprise-grade” without a defined architecture and scoped evidence.
- Name the control, boundary, environment, and residual risk.
- Publish certifications and audits only with current scope, period, issuer,
  and limitations.
- Never invent bounty rewards, safe harbor, deployed contract addresses, or
  authorization to test.
- Public vulnerability intake must request only a high-level summary. Sensitive
  evidence moves only after a restricted channel is established.
- Security-sensitive corrections take priority over visual consistency or
  launch timing.

### Legal, privacy, and commercial content

- Current legal pages are operational prelaunch summaries, not substitutes for
  counsel-approved binding public terms.
- Verify legal entity name, jurisdiction, controller/contact details, transfer
  mechanisms, subprocessors, retention, and user-right procedures before a
  public commercial launch.
- Do not promise deletion, response time, residency, encryption standard,
  recovery objective, service credit, indemnity, or liability position unless
  the operating process and binding terms support it.
- Pricing must state currency, unit, period, taxes, included usage, overage,
  availability, and effective date.

### Newsroom and press kit

- Every item requires publication date, accountable source, factual scope, and
  correction history.
- Product releases link to availability, maturity, documentation, security,
  limits, migration, and support.
- Use only approved boilerplate and downloadable assets.
- Do not fabricate leadership biographies, legal entity facts, investment,
  office locations, media coverage, awards, partnerships, or launch dates.
- Keep proposed product facts separate from the live website fact sheet.

### Careers, community, events, and programs

- Publish a role only when title, employment type, location, hiring owner,
  application path, and approved terms are real.
- An open introduction form is not an open job.
- Publish an event only with a real date, venue/link, organizer, agenda,
  accessibility information, recording policy, and cancellation path.
- Interest collection is not registration confirmation.
- Startup credits, eligibility, selection dates, program duration, and support
  are not commitments until an authorized offer states them.
- Do not publish a Discord invite, app-store integration, course, certificate,
  faucet, snapshot, or reward program until the destination or artifact works.

### Whitepaper and research

- Show draft/version status and publication date prominently.
- Separate implemented evidence from proposed architecture.
- Include assumptions, threat model, limitations, maturity gates, and primary
  normative references.
- Preserve superseded versions and publish a change log.
- A whitepaper is not evidence of product availability, performance, customer
  adoption, certification, or commercial commitment.
- Material corrections must update both the document and every page that cites
  the affected conclusion.

## Repository sources and change control

Current content is primarily controlled by:

- `lib/site-data.ts` for navigation, page definitions, maturity notes, legal
  summaries, and route content;
- `components/auth-experience.tsx`, `lib/server/auth.ts`, and
  `lib/server/account-identity.ts` for customer authentication truth;
- `db/schema.ts` and `app/api/v1/developer/services/**` for stable account
  ownership and service lifecycle truth;
- `components/documentation-experience.tsx` for the developer guide;
- `components/whitepaper-experience.tsx` for the current draft research;
- `components/press-kit-experience.tsx` for approved media material;
- `lib/public-api.ts` and `app/api/v1/**` for the executable website contract;
- selected-database `status_services` and `chains` for
  administrator-managed truth surfaces;
  and
- `public/` for downloadable brand assets.

Rules:

1. A code review must identify any new live, customer, security, performance,
   availability, legal, or commercial claim.
2. Evidence review must occur before merge, not after deployment.
3. Database truth-surface changes use the restricted admin application and
   retain the audit event.
4. Static copy must not contradict database-backed maturity.
5. Removing a disclaimer requires stronger review than adding one.
6. Generated content receives the same evidence review as human-authored
   content.
7. Release checks must render every public route and search for placeholders,
   empty sections, invented links, stale dates, and contradictory labels.

## Required release review

Before publishing a website release:

- [ ] Every route has complete, non-placeholder content.
- [ ] Every form has a working success, validation, rate-limit, and failure
      state.
- [ ] The live website/product-plane boundary is explicit.
- [ ] Status matches database incidents plus runtime workspace, per-network
      RPC, and native gRPC serving-health reconciliation, and chain maturity
      matches the selected database.
- [ ] No unnamed customer, fake logo, fabricated quotation, or adoption metric
      appears.
- [ ] No unsupported uptime, performance, certification, audit, or security
      claim appears.
- [ ] Developer examples match the current executable contract.
- [ ] RPC claims name the beta route, operator-upstream dependency, supported
      networks, key service-binding rule, limits, quotas, and deployment
      evidence.
- [ ] Free-beta claims state no card, both default hourly quotas, no paid
      billing, and the exact future-only sales boundary.
- [ ] Native gRPC is labeled source-ready, separately deployable, integrated
      with the database workspace/key lifecycle in control-plane mode, and not
      live without deployment evidence.
- [ ] `NODEZUNO_PUBLIC_INDEXING` remains false until public domain, access,
      canonical, robots, sitemap, legal, content, and security checks pass.
- [ ] Email, configured Google, EVM, and Solana availability labels match
      deployed credentials and tested behavior.
- [ ] Wallet synthetic email is not displayed or used for authorization.
- [ ] Customer auth and developer paths have the intended public access while
      administrator paths remain separately protected.
- [ ] Administrator access accepts only a verified real-email application
      account or optional verified hosting identity, then requires
      `NODEZUNO_ADMIN_EMAILS`; wallet-only synthetic email is denied.
- [ ] Active and `configuration_saved` service states are never conflated.
- [ ] Legal and privacy copy carries the correct prelaunch qualification.
- [ ] Whitepaper version, date, limitations, and changelog are current.
- [ ] Press assets and boilerplate are approved.
- [ ] External links resolve to real destinations.
- [ ] Correction and contact paths are visible.
- [ ] Lint, type checks, contract tests, rendered-route tests, database
      migration checks, and production health probes pass.

## Review cadence

| Surface | Minimum trigger |
| --- | --- |
| API docs/OpenAPI | Every route or schema change |
| Status | Every observed material state change |
| Chain catalog | Every capability change and scheduled evidence revalidation |
| Security/privacy/legal | Every control, processor, jurisdiction, or policy change; also on evidence expiry |
| Benchmarks | Every harness, environment, dependency, or result change |
| Customer material | Before publication and whenever approval, scope, or result changes |
| Press kit | Every company/product fact change |
| Whitepaper | Every material architecture conclusion or evidence-gate change |
| General pages | Every release plus periodic stale-content review |

Review cadence does not create a promise that stale content may remain public
until the next scheduled review. Known material inaccuracies are corrected or
withdrawn immediately.

## Language examples

Approved:

- “The Nodezuno.com request backend is live and stores validated receipts in
  the configured durable database.”
- “The bounded Ethereum, Base, and Solana JSON-RPC beta routes through
  operator-configured upstreams and requires a same-workspace `rpc:invoke`
  key.”
- “A quickstart key is bound to one service and carries only its compatible
  invocation scope. An unbound `services:manage` key can automate service
  lifecycle but cannot invoke a product.”
- “The Ethereum, Base, and Solana mainnet HTTP JSON-RPC beta is free, requires
  no payment card, and defaults to 1,000 weighted units per key and service per
  hour and 10,000 units per workspace per hour.”
- “Quota enforcement is method-weighted and differs between EVM and Solana
  methods.”
- “Status shows current developer-control-plane readiness, bounded
  per-network verification, and native gRPC serving health beside planned
  catalog entries. It is not historical uptime or chain-wide telemetry.”
- “Paid billing is not available. Sales is reserved for future dedicated
  capacity, SSO, contractual SLAs, migration assistance, or premium support.”
- “The broader Nodezuno RPC mesh is proposed; a status row is not live
  endpoint telemetry.”
- “The native gRPC target is source-ready and separately deployable. Its
  control-plane mode uses website workspaces and database-backed credentials,
  consumes the shared method-weighted quotas, and permits only the safe
  read-only catalog, but a live deployment is not established by source.”
- “Nodezuno is designed to preserve policy and execution evidence across one
  operation.”
- “Ethereum is planned in the chain catalog; no public Nodezuno endpoint is
  implied.”
- “The current whitepaper draft proposes three isolated fault domains.”

Not approved:

- “Nodezuno runs the fastest global RPC.”
- “All systems operational” while planned entries remain preview or current
  readiness is the only evidence.
- “Trusted by leading exchanges” without named consented evidence.
- “SOC 2 compliant” without the exact current report and scope.
- “Supports eight chains” when eight rows are merely planned.
- “Guaranteed finality” based on a planning label.
- “24/7 support” without staffed operations and binding terms.
- “Production ready” based only on the website deployment.

## Escalation

When evidence, ownership, or scope is unclear:

1. keep the weaker maturity label;
2. retain the limitation near the claim;
3. stop publication of the disputed strong claim;
4. route the evidence to the accountable domain owner; and
5. record the final decision and its reviewer.

The burden is on the stronger claim. Uncertainty is not permission to publish.
