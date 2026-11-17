# Nodezuno Chain Launch Cloud

**Status:** Proposed product architecture

**Current classification:** Archived strategy research, not the current
Nodezuno roadmap or public product. See [README.md](README.md).

**Document version:** 0.1

**Published:** 6 August 2026

## Truth boundary

This document defines a product direction and a partner-delivery contract. It
does not establish a live managed-node service, consensus operation, explorer,
indexer, grant, customer, production deployment, or service-level agreement.

The repository currently provides reusable control-plane foundations:

- customer accounts and durable sessions;
- workspaces, memberships, service records, and scoped API keys;
- audited workspace and administrative changes;
- bounded Ethereum, Base, and Solana attached-upstream RPC adapters;
- chain-specific upstream activation checks;
- method, parameter, body, batch, quota, and failover policy;
- aggregate usage telemetry without raw RPC parameter retention;
- current readiness and prelaunch catalog surfaces;
- local deployment and backup tooling; and
- a small Ethereum light-client laboratory profile.

Those components do not provision a new partner chain or operate its nodes.

## Product definition

Nodezuno Chain Launch Cloud is intended to help emerging L1s, L2s, rollups,
and appchains move from a protocol repository to an operational developer
network.

The proposed product joins:

- a versioned network manifest;
- managed node roles;
- consensus operations and visibility;
- chain-branded RPC and developer access;
- deterministic indexing and block exploration;
- evidence-grounded AI explanations;
- bootnodes, faucets, snapshots, and documentation;
- testnet and mainnet readiness gates; and
- recurring day-two operations.

## Intended customer

The primary buyer is an authorized organization responsible for a network:

- protocol foundation;
- core protocol team;
- rollup or L2 team;
- appchain or sovereign-chain operator;
- ecosystem fund procuring public infrastructure; or
- network team planning a testnet, mainnet, major upgrade, or migration.

Nodezuno should not accept an infrastructure scope from an unaffiliated party
that cannot authorize the network, artifacts, public claims, or operating
responsibilities.

## Product promise

The proposed promise is:

> Give Nodezuno an authorized network specification and launch target.
> Nodezuno will return a scoped infrastructure plan, responsibility map,
> evidence gates, and, only under a separate executed agreement, the declared
> operating surfaces.

The promise is not:

- guaranteed mainnet launch;
- custody of validator keys;
- compatibility with every protocol stack;
- unlimited RPC or storage;
- automatic decentralization;
- protocol security certification;
- 24-hour support without a staffed and contracted service; or
- a claim that Nodezuno owns network governance.

## Network manifest

Every environment should have one approved manifest containing at least:

### Identity

- network name and slug;
- environment name;
- chain or network identifier;
- genesis artifact and hash;
- protocol family and consensus mechanism;
- fork, upgrade, or feature activation state; and
- authoritative partner source.

### Software

- client role;
- implementation and repository;
- version, commit, artifact, and checksum;
- build provenance where available;
- configuration profile;
- compatible data or snapshot versions; and
- upgrade and recovery notes.

### Topology

- bootnode, sentry, validator, RPC, archive, snapshot, and indexer roles;
- desired count and placement;
- public and private network paths;
- peer policy;
- storage and expected growth;
- failure independence assumptions; and
- capacity and replacement plan.

### Interfaces

- public RPC transports and method policy;
- authentication, limits, quotas, and abuse controls;
- write and retry policy;
- explorer entity and schema coverage;
- index freshness and replay contract;
- faucet eligibility and limits;
- snapshot generation, signature, checksum, and restore policy; and
- status and incident scope.

### Ownership

- partner-owned responsibilities;
- Nodezuno-owned responsibilities under the proposed scope;
- third-party dependencies;
- validator and signing key ownership;
- approval and emergency authority; and
- support and escalation boundaries.

### Gates

- chain identity;
- client compatibility;
- security boundary;
- capacity and state growth;
- data correctness and canonicality;
- upgrade rehearsal;
- snapshot restore;
- node and regional recovery;
- status and incident readiness;
- partner acceptance; and
- unresolved-risk record.

## Proposed operating surfaces

### Managed node fleet

Candidate roles include bootnodes, sentries, public or private RPC nodes,
archive nodes, snapshot producers, and indexers. Validator operation requires a
separate key, governance, staffing, security, and commercial decision.

Every role must declare:

- exact chain identity;
- client and artifact;
- resource envelope;
- exposed and denied interfaces;
- health and readiness probes;
- storage and recovery behavior;
- upgrade procedure;
- logs, metrics, alerts, and retention; and
- named operator owner.

### Consensus operations

Candidate scope includes:

- genesis planning and artifact evidence;
- sentry and validator topology review;
- execution and consensus view separation;
- participation, liveness, finality, and fork observations;
- client and version visibility;
- upgrade rehearsal and coordination;
- incident runbooks; and
- post-incident evidence.

Nodezuno should not claim consensus health from RPC responsiveness alone.

### RPC gateway

The existing gateway concepts can be adapted only after the partner network
defines:

- exact identity probes;
- protocol transport;
- method and parameter policy;
- read retry safety;
- write uncertainty behavior;
- body, batch, timeout, and response limits;
- quota weights;
- upstream and node eligibility; and
- current capacity evidence.

### Data and deterministic explorer

Candidate scope includes:

- raw blocks, transactions, receipts, events, and traces;
- protocol-specific consensus and validator entities;
- fork-aware canonical views;
- deterministic versioned transforms;
- replay and full rebuild;
- entity search and query APIs;
- source, schema, cursor, lag, and correction visibility; and
- a chain-branded explorer that works without AI.

### AI explorer

The proposed explanation layer sits after deterministic indexing. It may
answer questions only using bounded evidence for the selected network.

Required controls include:

- chain identity and canonicality checks;
- exact evidence citations;
- indexed height and lag display;
- claim and interpretation separation;
- prompt-injection and hostile-metadata defenses;
- no signing or infrastructure authority;
- deterministic fallback;
- refusal on missing or contradictory evidence; and
- evaluated citation and factual correctness.

No model or explorer implementation is selected by this document.

### Developer launch kit

Candidate outputs include:

- network overview and chain identity;
- client and peer instructions;
- authenticated and public endpoint documentation;
- method limits and error behavior;
- examples in standard protocol libraries;
- deterministic explorer;
- faucet and snapshot instructions;
- public-testnet or mainnet status; and
- support and incident contacts.

## Launch stages

### Stage 0: qualify

Deliver:

- authorized partner and network scope;
- launch dates and environments;
- existing infrastructure and dependencies;
- responsibility map;
- known constraints and risks; and
- proposed evidence and commercial path.

Exit only when authority and ownership are clear.

### Stage 1: specify

Deliver:

- approved network manifest;
- topology and interfaces;
- threat and failure boundaries;
- acceptance gates;
- migration or launch plan; and
- estimate tied to assumptions.

### Stage 2: private devnet

Exercise:

- genesis and identity;
- provisioning and bootstrapping;
- node replacement;
- chain-specific probes;
- RPC policy;
- minimal deterministic indexing;
- upgrade rehearsal; and
- recovery.

### Stage 3: public testnet

Candidate outputs:

- bounded RPC;
- deterministic explorer;
- faucet;
- signed snapshots;
- client and peer docs;
- separate execution, consensus, and data status; and
- support and incident paths.

### Stage 4: mainnet readiness

Require a new gate for:

- final production manifest;
- client and artifact approvals;
- capacity and storage growth;
- key and access boundary;
- upgrade and disaster rehearsal;
- recovery and replacement;
- limits and support;
- unresolved risks; and
- partner launch decision.

### Stage 5: day-two operations

Review continuously:

- drift from the manifest;
- client and dependency releases;
- execution and consensus health;
- peers and failure independence;
- capacity and state growth;
- index and explorer freshness;
- AI evaluation drift if that layer exists;
- snapshots and restores;
- upgrades and incidents; and
- evidence expiry.

## First partner MVP

The first complete partner scope should remain deliberately narrow. A
responsible candidate would include:

1. one authorized public-testnet environment;
2. one protocol stack with stable client documentation;
3. a versioned manifest;
4. bootnode and RPC roles without validator-key custody;
5. a bounded chain-specific RPC adapter;
6. deterministic blocks and transactions in an explorer;
7. one signed snapshot and verified restore path;
8. a faucet if the protocol supports safe test assets;
9. separate execution, consensus, and data status; and
10. an evidence-backed upgrade and recovery exercise.

The AI explorer should begin as a private, fixed-evidence evaluation after the
deterministic explorer is correct. It should not block the first testnet launch.

## Evidence record

For each promoted capability, retain:

- partner and network;
- environment and manifest version;
- exact capability and scope;
- test date and duration;
- clients, versions, artifacts, and regions;
- method, workload, and failure injection;
- result and raw evidence location;
- limitations and unresolved risks;
- owner and approver; and
- expiry or revalidation trigger.

## Commercial boundary

Chain Launch Cloud may eventually be sold through:

- a paid specification or launch engagement;
- milestone-based protocol or ecosystem grants;
- recurring managed-infrastructure contracts;
- usage-based RPC, data, or explorer APIs;
- dedicated node capacity; and
- a chain-branded explorer license.

No price, active billing, grant award, customer, or revenue is claimed by this
document. See [Partnerships and grants](PARTNERSHIPS_AND_GRANTS.md) for the
proposed funnel and evidence rules.

## Release gates before a public claim

- [ ] Authorized partner and approved network scope
- [ ] Versioned manifest and responsibility map
- [ ] Exact chain identity verification
- [ ] Pinned clients and verified artifacts
- [ ] Role and network-path isolation
- [ ] Capacity and storage evidence
- [ ] Upgrade rehearsal
- [ ] Restore and recovery exercise
- [ ] RPC method, limit, and retry contract
- [ ] Index canonicality, lag, replay, and rebuild evidence
- [ ] Explorer deterministic fallback
- [ ] AI evaluation and safety evidence if AI is exposed
- [ ] Status and incident process
- [ ] Security review and unresolved-risk record
- [ ] Partner acceptance
- [ ] Applicable commercial and legal agreement

Until a gate passes, use proposed, planned, private evaluation, or equivalent
scoped language.
