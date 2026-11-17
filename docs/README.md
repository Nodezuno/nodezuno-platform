# Nodezuno documentation map

This page is the canonical status map for repository documents. If another
document conflicts with this page, this page and the current product guide
control public positioning.

## Current public product

Nodezuno offers one service: a security review for one planned smart contract
or protocol release against an audited or reviewed baseline. Both supported
EVM and non-EVM orders use the same USD 7,500 price. Cloudflare production
defaults keep payment instructions disabled until the launch approval gate is
explicitly enabled. Once approved, the supported payment flow is manual
Ethereum Mainnet USDC/USDT intake. The customer submits a transaction hash and
Telegram username; Nodezuno checks the transfer manually. The hash alone does
not confirm payment, and automatic verification is off. A valid form creates
the order immediately; there is no manual proposal approval before checkout.

- [Canonical product, scope, and pricing](product/SCOPE_AND_PRICING.md)
- [Standard EVM technical method](UPGRADE_ASSURANCE.md)
- [Commercial workflow](UPGRADE_ASSURANCE_COMMERCE.md)
- [Ethereum stablecoin settlement](ETHEREUM_STABLECOIN_PAYMENTS.md)
- [Technical whitepaper](WHITEPAPER.md)
- [Security model](SECURITY.md)
- [API audiences and boundaries](api/README.md)
- [Public and private API reference](API.md)
- [Payment state and customer language](payments/STATE_MACHINE.md)

## Production operations

- [Cloudflare Free-Tier deployment profile](CLOUDFLARE_FREE_TIER.md)
- [Cloudflare production release gates and evidence](CLOUDFLARE_PRODUCTION_RELEASE.md)
- [Deep research remediation record](DEEP_RESEARCH_REMEDIATION.md)
- [Production improvement plan progress](PRODUCTION_IMPROVEMENTS.md)
- [October launch-hardening record](operations/LAUNCH_HARDENING_2026_10_06.md)
- [Privacy-safe customer API diagnostics](API_OBSERVABILITY.md)
- [Rendering and module boundaries](architecture/RENDERING_AND_BOUNDARIES.md)
- [Capacity and runtime configuration](operations/CAPACITY_AND_CONFIGURATION.md)
- [Database migration policy](MIGRATIONS.md)
- [Legacy AWS deployment](AWS_DEPLOYMENT.md)
- [AWS architecture](AWS_ARCHITECTURE.md)
- [AWS cost model](AWS_COST_MODEL.md)
- [Release procedure](RELEASE.md)
- [Legacy AWS production release evidence template](PRODUCTION_RELEASE_EVIDENCE.md)
- [Operations](OPERATIONS.md)
- [Disaster recovery](DISASTER_RECOVERY.md)
- [Incident response](INCIDENT_RESPONSE.md)
- [Container deployment](CONTAINER_DEPLOYMENT.md)
- [Native macOS deployment](LOCAL_MAC_DEPLOYMENT.md)
- [Data model](DATA_MODEL.md)
- [Authentication](AUTHENTICATION.md)

## Retained engineering foundations

The account, workspace, API-key, RPC, gRPC, node-attachment, and service-control
code remains in the repository as internal foundation. It is not a current
public Nodezuno product and must not be marketed as deployed infrastructure.

- [Self-service engineering reference](SELF_SERVICE.md)
- [Node attachment reference](NODE_ATTACHMENT.md)
- [Ethereum light-client runbook](ETHEREUM_LIGHT_NODE.md)
- [AI Explorer architecture prototype](AI_EXPLORER.md)
- [AI Operations Copilot prelaunch specification](AI_OPERATIONS_COPILOT.md)
- [Backend implementation](BACKEND.md)

## Archived strategy research

These files preserve earlier research and decisions for historical context.
They are not the current company roadmap, product promise, or investor claim.

- [Chain Launch Cloud research](CHAIN_LAUNCH_CLOUD.md)
- [Superseded pivot roadmap](PIVOT_ROADMAP.md)
- [Superseded investor product thesis](INVESTOR_PRODUCT_THESIS.md)
- [Superseded content policy](CONTENT_GOVERNANCE.md)
- [Earlier partnerships and grants model](PARTNERSHIPS_AND_GRANTS.md)
- [Earlier self-service RPC benchmark](PRODUCT_BENCHMARK.md)

## Canonical customer terminology

The customer journey is:

```text
Contact
  -> Fixed service order
  -> Accepted terms
  -> Payment instruction
  -> Payment claim
  -> Confirmation
  -> Active work
  -> Deliverable
```

`qualification_pending` remains a legacy machine identifier in the database
and API. New valid bounded orders start with a generated fixed service order.
Use Contact before terms acceptance and Customer after the buyer accepts the
service order.

## Launch boundary

A form submission creates the fixed service order but does not prove payment,
create a confidentiality agreement, or reserve work. Ethereum Mainnet USDC or
USDT instructions appear inside the private portal after the buyer accepts the
order and service terms. The buyer submits the transaction hash and mandatory
Telegram username. An operator checks the transaction and records a manual
decision before the service order advances. Automatic stablecoin verification
is off in the Cloudflare Free profile. Resolve the applicable legal, tax, and
disclosure requirements before accepting real payments. The production Worker
defaults to payment mode `disabled`; both explicit launch approval and manual
payment mode are required before payment instructions can be created.
