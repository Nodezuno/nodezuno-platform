# Nodezuno Chain Launch Cloud roadmap

**Decision date:** 6 August 2026
**Status:** Superseded strategy research
**Primary customer:** Teams launching a new L1, L2, L3, rollup, or appchain

## 1. Decision

This historical direction is not the current Nodezuno roadmap or public
product promise. Upgrade Assurance is the sole current offer. See
[README.md](README.md) for the canonical status map.

Nodezuno will focus on launch and day-two infrastructure for emerging
blockchains. The company will not compete as another broad RPC catalog and will
not launch a proprietary blockchain or token in the first product cycle.

The product promise is:

> Give a new chain one accountable operating layer for nodes, consensus, RPC,
> indexing, exploration, testnet services, upgrades, and incidents.

The existing Ethereum, Base, and Solana gateway remains useful as a verified
request-path lab. It becomes one component of the new platform, not the company
category.

## 2. Why this wedge

Launching chain software is becoming easier. Operating a credible network is
still fragmented. A chain team must normally assemble validators or sequencers,
bootnodes, public and private RPC, archive capacity, indexing, a block explorer,
a faucet, snapshots, monitoring, status communication, upgrade procedures, and
incident response.

The problem is visible in current ecosystem documentation:

- Avalanche's own deployment guide describes validators, archive and pruned
  RPC nodes, monitoring, and a load balancer as a production L1 baseline. Its
  add-on guide separately covers Blockscout, faucets, The Graph, relayers, Safe,
  and monitoring.
- Conduit bundles chain hosting, RPC, upgrades, explorers, metrics, and
  integrations, validating that chain operations command recurring revenue.
- Blockscout sells Explorer as a Service specifically to new L1s and rollups.
- Arbitrum reported grants and strategic partnerships in both Orbit and
  infrastructure categories, showing that ecosystems fund chain-enablement
  work when it has measurable adoption value.

Primary references:

- [Avalanche production L1 deployment](https://build.avax.network/docs/tooling/avalanche-deploy/deploy-l1)
- [Avalanche L1 add-ons](https://build.avax.network/docs/tooling/avalanche-deploy/add-ons)
- [Conduit chain platform](https://www.conduit.xyz/platform)
- [Conduit pricing](https://www.conduit.xyz/pricing)
- [Blockscout Explorer as a Service](https://eaas.blockscout.com/)
- [Arbitrum Foundation H1 2025 report](https://docs.arbitrum.foundation/assets/files/ArbitrumFoundationBiannualReport2025H1-a212b78c3f14904307067a78e7a17065.pdf)

## 3. Initial ideal customer profile

The first customer is an EVM-compatible chain team that:

- has a working codebase or rollup configuration;
- is three to nine months from a public testnet or mainnet;
- has protocol engineers but no mature infrastructure team;
- needs a credible explorer, RPC, monitoring, and incident surface for an
  ecosystem or grant milestone;
- expects wallets, applications, indexers, or exchanges to integrate; and
- can pay a setup fee, recurring operations fee, or ecosystem-funded milestone.

The first stacks to qualify are:

1. OP Stack
2. Arbitrum Orbit
3. Avalanche L1
4. Polygon CDK
5. Cosmos EVM

Nodezuno should implement one stack deeply before advertising broad production
coverage. OP Stack is the recommended first production adapter because the EVM
request, explorer, and indexing paths overlap most with the existing codebase.
Avalanche L1 is a strong second adapter because its documented operational
bundle closely matches the product.

## 4. The first sellable offer

### Testnet Launch Pack

A milestone-scoped engagement that produces:

- reviewed chain manifest and threat boundaries;
- supervised validator, sequencer, or consensus-node topology;
- bootnodes and private peer policy;
- protected public RPC and operator RPC;
- archive or trace capacity where the explorer needs it;
- branded explorer and contract verification;
- faucet with bounded issuance policy;
- indexed block, transaction, address, and contract data;
- snapshots with signed manifests and restore rehearsal;
- metrics, alerts, public status, and incident templates;
- upgrade, rollback, key rotation, and disaster-recovery runbooks; and
- a handoff evidence pack for the chain team and funding ecosystem.

The customer should leave the engagement with a running testnet and an explicit
mainnet gap list, not a slide deck.

## 5. Product architecture

### Plane A: Launch

The launch plane stores desired chain state as a versioned manifest:

- stack and pinned release;
- chain and network identifiers;
- genesis digest;
- settlement and data-availability choices;
- validator, sequencer, RPC, archive, and indexer topology;
- regions and failure domains;
- upgrade policy; and
- requested ecosystem services.

Every apply or upgrade operation produces a plan, approval record, execution
record, observed state, and rollback boundary.

### Plane B: Operate

The operations plane reconciles desired and observed state across:

- node process and host health;
- peer count and synchronization;
- head and finalized height;
- validator participation or sequencer production;
- RPC correctness, latency, and method support;
- archive depth and trace readiness;
- indexer lag;
- snapshot age and verification;
- release drift; and
- customer-visible incidents.

### Plane C: Explore

The data plane ingests blocks, transactions, receipts, logs, traces, contracts,
addresses, tokens, validator observations, and operational telemetry. It powers
both a conventional explorer and the Nodezuno AI Explorer.

The AI layer must retrieve typed facts and cite the underlying block,
transaction, log, trace, node observation, or runbook. It may summarize or
connect evidence. It must not invent chain state, hide uncertainty, sign a
transaction, or execute an operational change without an explicit approved
workflow.

## 6. AI Explorer wedge

Generic transaction summaries already exist. Nodezuno must go further by
joining onchain and operational evidence.

High-value questions include:

- Why did this transaction fail, and was it an application, RPC, sequencer, or
  consensus problem?
- Which validators missed the affected blocks?
- Is the explorer behind the chain head or is the RPC node stale?
- What changed after the last network upgrade?
- Which contracts and customers were affected by an incident window?
- Can this answer cite the exact blocks, traces, metrics, and release digest?

Blockscout already exposes blockchain data to AI agents through MCP and ships
AI transaction summaries. That validates demand while showing why a basic AI
summary is not sufficient differentiation.

- [Blockscout MCP server](https://docs.blockscout.com/devs/mcp-server)
- [Blockscout AI transaction summaries](https://www.blog.blockscout.com/block-explorer-ai/)

See [AI_EXPLORER.md](AI_EXPLORER.md) for the safety and implementation
contract.

## 7. Revenue model

Grants are customer-acquisition and integration capital, not the company
revenue foundation.

### Commercial revenue

1. **Launch fee:** architecture, automation, deployment, and evidence pack.
2. **Monthly operations:** supervised node fleet, explorer, indexing,
   monitoring, upgrades, support, and incident response.
3. **Usage:** RPC, archive, trace, indexing, export, and retained-history units.
4. **Validator or sequencer operations:** fixed fee plus an optional disclosed
   performance or revenue component where legally and technically appropriate.
5. **Premium reliability:** multiple regions, independent providers, recovery
   objectives, and contractual support.

### Ecosystem funding

Ask foundations to fund reusable public goods that make their stack easier to
adopt:

- a new stack adapter;
- open health probes and upgrade checks;
- explorer and verifier integration;
- reproducible testnet templates;
- snapshot verification tools;
- public chain onboarding documentation; and
- an evidence dashboard for funded chains.

Each proposal needs a named chain design partner, milestones, public artifacts,
adoption metrics, a maintenance period, and a commercial continuation plan.
Do not request a grant for a vague platform build.

Current funding directories and programs must be reverified before every
application:

- [Ethereum ecosystem grant programs](https://ethereum.org/community/grants/)
- [Solana funding programs](https://solana.org/grants-funding)
- [Arbitrum grants forum](https://forum.arbitrum.foundation/)
- [Filecoin public-goods funding](https://www.filecoin.io/blog/Announcing-Filecoin-ProPGF-Batch-3-General-Track)

## 8. Commercial targets

These are internal validation targets, not published prices or existing
contracts:

| Offer | Validation target | Revenue shape |
| --- | --- | --- |
| Architecture and chain-readiness review | First 2 weeks | Fixed milestone |
| Managed devnet | Month 1 | Setup plus monthly fee |
| Public testnet launch pack | Months 2 to 3 | Milestone plus cloud cost |
| Mainnet operations | After recovery and security gates | Monthly minimum plus usage |
| Ecosystem adapter | When a foundation and design partner align | Grant milestones plus maintenance |

The first commercial objective is one paid or ecosystem-funded testnet, not a
large number of free RPC users.

## 9. Roadmap

### Phase 0: Pivot foundation, now

- change the website category and navigation;
- preserve the working account, workspace, API-key, audit, and deployment
  controls;
- let a signed-in team create a durable Chain Launch Cloud project;
- publish the product, security, AI Explorer, and grant boundaries; and
- keep fixed-chain RPC available as an internal capability.

Exit evidence: production build, database migration check, local deployment,
and a working chain-project creation flow.

### Phase 1: One local EVM devnet

- define the chain manifest schema;
- build a local fleet agent with signed desired-state polling;
- deploy one multi-node devnet on the Mac or local virtual machines;
- attach RPC, Blockscout, faucet, Prometheus, and snapshot storage;
- show desired versus observed state in the control plane; and
- rehearse stop, restart, upgrade, rollback, and restore.

Exit evidence: repeatable build from an empty runtime and recorded recovery
exercise.

### Phase 2: First cloud testnet

- move the fleet to one cloud VPC;
- isolate validator, public RPC, archive, and monitoring roles;
- add encrypted state, secrets, logs, off-host backups, alerts, and runbooks;
- publish the chain explorer and developer endpoints; and
- complete a foundation or design-partner milestone.

Exit evidence: 30 days of monitored testnet operation, successful upgrade,
restore rehearsal, and transparent cost report.

### Phase 3: AI Explorer beta

- index blocks, transactions, receipts, logs, traces, contracts, and validator
  observations;
- create a typed evidence retrieval layer;
- add transaction explanation, incident correlation, and upgrade-diff tools;
- require citations and confidence labels; and
- evaluate answers against deterministic incident fixtures.

Exit evidence: published evaluation set with no uncited factual assertions.

### Phase 4: Mainnet readiness

- independent regions and providers;
- validator and signer key isolation;
- multi-party change approval;
- capacity and fault testing;
- customer support and incident ownership;
- external security review; and
- contractual service boundaries.

## 10. Metrics

North-star metric:

> Number of chain environments operated for 30 consecutive days with current
> explorer data, verified backups, and no unresolved critical drift.

Supporting metrics:

- time from signed manifest to healthy devnet;
- time from chain head to explorer visibility;
- RPC correctness and error rate by method;
- validator participation and missed-block rate;
- upgrade success and rollback time;
- snapshot restore success;
- incident detection and explanation time;
- monthly gross margin by chain; and
- grant milestones converted into paid maintenance.

Avoid vanity metrics such as configured chains, generated projects, AI queries,
or endpoint counts without active usage and operating evidence.

## 11. What Nodezuno will not claim

- A saved chain project is not a deployed chain.
- A healthy RPC probe is not a production service-level agreement.
- A block explorer is not proof that its index is current.
- An AI explanation is not canonical chain truth without cited evidence.
- A grant application is not revenue.
- A testnet success is not mainnet readiness.
- A customer logo or ecosystem name will not be published without permission.

This honesty is part of the product. New chains need infrastructure partners
who can distinguish configured, deployed, synchronized, validated, and
production-ready states.
