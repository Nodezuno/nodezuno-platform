# Nodezuno AI Operations Copilot

Status: prelaunch product specification
Revision: 0.1
Date: 2026-08-06

## Purpose

The AI Operations Copilot is intended to help an operator answer four questions:

1. What changed?
2. What evidence describes the current network state?
3. Which explanations are supported or contradicted?
4. What is the next safe, approved check?

The product is not intended to replace protocol consensus, a signer, change
authority, an incident commander, or an experienced infrastructure operator.

## Initial operating boundary

The first version is read-only. It may:

- retrieve normalized evidence;
- build a time-ordered incident view;
- identify correlated changes;
- rank hypotheses;
- identify missing or stale data;
- cite every material statement;
- select an approved diagnostic runbook; and
- propose the next diagnostic step.

It may not:

- access private signing keys;
- sign validator, sequencer, treasury, or governance messages;
- deploy or upgrade software;
- alter validator membership or weight;
- change routing, autoscaling, firewall, or cloud configuration;
- restore or replace a node;
- replay or advance indexed state;
- broadcast a transaction;
- close an incident; or
- describe a recommendation as a guaranteed fix.

## Evidence model

Every evidence item should include:

- `network_id`
- `environment`
- `stack_adapter`
- `source_type`
- `source_identity`
- `observed_at`
- `ingested_at`
- `freshness_state`
- `canonicality_state` when relevant
- `schema_version`
- `adapter_version`
- `payload_reference`
- `integrity_reference`
- `access_class`
- `retention_class`

### Evidence families

#### Protocol evidence

- chain identity and genesis hash;
- block and checkpoint progression;
- finalized, safe, and latest state where defined;
- validator or sequencer participation;
- peer and validator-set changes;
- bridge, settlement, proof, or data-availability state; and
- protocol-defined safety thresholds.

#### Node evidence

- role, client, version, and configuration fingerprint;
- sync state and canonical tip comparison;
- peer count and peer diversity where observable;
- CPU, memory, disk, I/O, and network saturation;
- process lifecycle and restart history; and
- role-specific duty results.

#### Access evidence

- RPC method class, status, latency, and bounded error samples;
- pool membership and routing decision;
- quota or access-policy outcome;
- cross-endpoint block and chain-identity comparison; and
- WebSocket or gRPC delivery state.

#### Data evidence

- indexer cursor and canonical tip distance;
- reorg and replay activity;
- schema and migration version;
- explorer freshness; and
- snapshot identity, age, verification, and restore result.

#### Change evidence

- approved manifest revision;
- release and configuration change;
- actor, reviewer, and approval reference;
- rollout wave and failure domain;
- pre-change and post-change checks; and
- pause, rollback, and exception record.

## Investigation pipeline

### 1. Establish scope

Pin the network identity, environment, incident window, adapter version, current
operator, and accessible evidence classes. Reject ambiguous chain identity.

### 2. Verify source health

Check source freshness, missing intervals, parser errors, clock skew, duplicate
records, reorg state, and permission boundaries before drawing conclusions.

### 3. Construct the timeline

Order relevant protocol, node, access, data, and change observations. Preserve
the difference between event time and ingestion time.

### 4. Retrieve adapter knowledge

Retrieve only runbooks, compatibility rules, failure modes, and protocol
semantics that match the verified stack, versions, roles, and environment.

### 5. Generate bounded hypotheses

For each hypothesis, produce:

- supporting evidence;
- contradicting evidence;
- required missing evidence;
- affected scope;
- confidence category;
- safety implications; and
- the next reversible diagnostic check.

### 6. Apply policy

Remove recommendations outside the user's authority, the incident scope, the
approved runbook, or the product's current action tier.

### 7. Present for review

Show observation, inference, uncertainty, citations, freshness, and the proposed
next step as separate interface elements.

### 8. Record the outcome

Record what the operator approved, rejected, or changed and what the network
showed afterward. A later evaluation can use this record only under the agreed
customer data policy.

## Confidence is not probability by default

The interface should use simple categories such as `insufficient`, `low`,
`medium`, and `high` until calibration against real, reviewed incidents exists.

A high-confidence label must not imply:

- protocol finality;
- consensus safety;
- security assurance;
- legal or audit correctness;
- a guaranteed remediation; or
- permission to act.

## Action maturity

### Tier 0: explain

Read evidence and produce a cited investigation. This is the first product tier.

### Tier 1: propose

Select a diagnostic step from an approved runbook and present prerequisites,
risk, reversibility, and expected observations.

### Tier 2: prepare

Create a change plan or machine-readable request without executing it. Require
an authenticated reviewer and fresh preconditions.

### Tier 3: bounded execution

Potential future work for reversible, non-signing infrastructure actions only.
It requires policy authorization, two-person approval where appropriate,
idempotency, dry-run support, blast-radius limits, rollback, and independent
post-change verification.

### Permanently separate authority

Validator signing, treasury signing, governance authority, protocol upgrades,
and other high-impact cryptographic actions remain outside the model boundary.

## Evaluation contract

The copilot should not graduate from prototype based on a compelling demo. A
design-partner evaluation set should include normal operations, known incidents,
ambiguous cases, stale sources, conflicting sources, reorgs, partial outages,
bad configuration changes, and adversarial text in logs or metadata.

Measure at least:

- correct incident scope;
- citation precision and coverage;
- unsupported material claims;
- useful missing-evidence requests;
- hypothesis ranking against operator review;
- unsafe recommendation rate;
- time to first useful evidence;
- operator acceptance and rejection reasons;
- cross-tenant isolation; and
- reproducibility from the same evidence snapshot.

Promotion gates should be defined before evaluation. Failed gates remain visible
and block higher action tiers.

## Threats specific to an AI operations product

- prompt injection inside logs, contract metadata, transaction input, or docs;
- malicious or compromised telemetry sources;
- cross-network or cross-tenant evidence leakage;
- stale evidence presented as current state;
- forked data presented as canonical;
- incorrect adapter selection;
- fluent but unsupported root-cause claims;
- unsafe runbook selection;
- authority escalation through tool calls;
- hidden changes to model, prompt, retrieval, or policy versions; and
- evaluation contamination from customer incidents.

Controls include typed ingestion, untrusted-content labeling, retrieval access
checks, canonicality and freshness gates, deterministic policy outside the
model, tool allowlists, immutable audit references, model and prompt versioning,
and an emergency disable path.

## First design-partner deliverable

The smallest credible pilot is:

1. one Avalanche L1 on Fuji or a public testnet;
2. one verified Avalanche L1 stack adapter in a customer-owned cloud;
3. consensus, node, RPC, indexer, change, and canonical-chain evidence;
4. three operator-reviewed historical or rehearsed incidents;
5. a read-only investigation interface;
6. an approved diagnostic runbook library;
7. an evaluation report with failures included; and
8. no autonomous action.

The pilot is successful only if the customer verifies that it improves a real
operating workflow and is willing to fund continued testnet or mainnet
operations. A successful prototype without a funded operating need is not
product-market fit.
