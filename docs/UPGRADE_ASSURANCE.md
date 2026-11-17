# Nodezuno Standard EVM Upgrade Review

This document defines the published standard EVM method. Nodezuno also accepts
selected non-EVM upgrade review requests. Every accepted review has the same
$7,500 price and $3,750 plus $3,750 payment structure. Non-EVM work uses a
chain-specific scope, reviewer match, methodology, preparation list, and
schedule.

The overall offer and direct-order process are defined in
[the canonical scope contract](product/SCOPE_AND_PRICING.md). This document
describes the standard EVM method, not an EVM-only business or a manual sales
approval process.

## The decision

Upgrade Assurance answers one question:

> Does this exact proposed EVM upgrade preserve the reviewed security and
> operating assumptions well enough to proceed?

The service is for teams changing an already audited EVM system. It is a
bounded, independent release review, not a replacement for the original audit
or a new audit of an unaudited protocol.

## Initial customer

The first offer is designed for DeFi protocols, stablecoin issuers, RWA
platforms, and other teams that meet all of these conditions:

- a material EVM contract is already deployed or ready for deployment;
- a credible audit exists for the current baseline;
- an implementation, proxy, storage, permission, or execution change is
  proposed;
- governance, a multisig, or another accountable release owner needs evidence
  before execution; and
- the artifacts can be frozen long enough for a five-business-day review.

The standard EVM package is not a fit for greenfield unaudited contracts,
active incident response, private-key recovery, bridge or consensus audits, or
a broad protocol review with no exact release artifact. Non-EVM programs are
outside this standard EVM method, but selected requests can be accepted at the
same $7,500 price under a chain-specific review plan.

## Fixed-price offer

Every accepted EVM or selected non-EVM review has the same fixed $7,500 price,
paid as a $3,750 scheduling deposit and a $3,750 final balance. The price covers
one target chain, one audited or reviewed baseline, one proposed release, one
agreed bounded scope, and one consolidated remediation pass.

The five-business-day clock starts after all of these are complete:

1. The customer accepts the generated fixed service order and applicable terms.
2. Any required private-artifact access arrangements are complete.
3. After launch approval and manual payment activation in the Cloudflare deployment, Sanjay checks and records the Ethereum Mainnet scheduling deposit. Automatic payment verification is off.
4. Every required artifact is accessible and pinned.
5. Customer reviewers and release owners are named.

The form enforces the published target and size limits before creating the
order. No manual review is required before payment. After the customer sends
the transfer, they submit the transaction hash and mandatory Telegram username.
Sanjay checks the official token, network, transaction status, recipient, and
amount manually, then contacts the customer. A submitted hash is not proof of
payment. Missing or changed private inputs can pause the start of work after
payment under the accepted terms.

## Required inputs

### Audited baseline

- audit report and any accepted-risk register;
- exact repository commit reviewed by the auditor;
- compiler, optimizer, dependency, and build settings;
- deployed proxy and implementation addresses, where applicable;
- verified ABI, storage layout, role map, and initialization state; and
- documented invariants and operational assumptions.

### Proposed release

- exact proposed repository commit;
- reproducible build instructions;
- proposed implementation bytecode;
- governance or multisig transaction payload;
- initializer or migration calldata;
- target chain and a recent block reference;
- expected storage and role changes; and
- expected post-upgrade behavior and rollback plan.

### Access boundary

Nodezuno asks for read-only access. Never provide seed phrases, private keys,
signing shares, administrator sessions, production deployment credentials, or
customer personal data. The public website form is only for high-level intake.
Restricted artifacts move through a separately agreed channel.

## Review workflow

### 1. Freeze

Nodezuno hashes and records every in-scope artifact, tool version, chain ID,
and fork block. Any change after freeze becomes a new candidate and must be
reconciled before the review can continue.

### 2. Map

The reviewer converts the audit's findings, exclusions, assumptions, accepted
risks, and tested invariants into a baseline matrix. This prevents the review
from treating the audit PDF as a vague trust badge.

### 3. Diff

Source, build configuration, dependency, bytecode, storage layout, proxy,
initializer, access-control, and governance-payload changes are compared.
Material changes are traced to affected baseline assumptions.

### 4. Rehearse

The exact candidate payload is executed on a pinned fork when technically
feasible. The review captures preconditions, decoded effects, traces, events,
state deltas, role changes, failures, gas behavior, and postconditions.

### 5. Test invariants

Existing protocol tests are run where reproducible. Nodezuno adds targeted
checks around affected invariants, storage compatibility, initialization,
permissions, accounting, pause paths, upgrade authority, and unexpected
external calls. The test set is specific to the agreed release.

### 6. Investigate

AI may identify suspicious patterns, connect diffs to baseline assumptions,
suggest tests, cluster traces, and draft explanations. Every material AI output
must be verified against deterministic evidence or rejected. AI cannot approve
the release.

### 7. Decide

A human reviewer assigns one recommendation:

- `Proceed`: no release blocker was found within the exact scope and evidence.
- `Remediate`: one or more demonstrated conditions must be corrected and the
  agreed fix must be verified before proceeding.
- `Hold`: evidence shows a material violation or unsafe execution, or required
  evidence is missing, inconsistent, changed, or leaves an important question
  unresolved.

`Proceed` does not mean safe under every condition. It means the bounded
review found no blocker against the stated baseline, candidate, state, and
checks. The customer retains release authority.

## Evidence bundle

The customer receives:

- scope and artifact manifest with cryptographic hashes;
- audited-baseline assumption and invariant matrix;
- source, dependency, build, bytecode, storage, role, and payload diff;
- fork configuration and replay commands;
- check catalog with pass, fail, not-run, and limitation states;
- finding register with severity, evidence, impact, and recommended action;
- remediation reconciliation, when included;
- Proceed, Remediate, or Hold recommendation with explicit rationale;
- known limitations and residual risks; and
- executive summary plus technical review call.

The bundle is designed to be reviewed by engineers, security teams, auditors,
governance delegates, and operational decision-makers.

In the AWS production profile, the final report, optional evidence archive,
and manifest are released through the private engagement page. An
administrator seals each file's type, size, and SHA-256 before a short-lived
upload to the versioned, KMS-encrypted S3 bucket. Completion requires the final
report and manifest to pass storage verification. Buyer downloads expire after
five minutes and are pinned to the verified S3 version. This output channel
does not replace the separately approved restricted channel for customer input
artifacts.

## Severity and decision rules

Severity describes potential impact. Decision describes release readiness.
They are related but not identical. For example, one missing critical artifact
may create a `HOLD` even before a vulnerability is proven.

Default rules are:

| Evidence state | Default decision |
| --- | --- |
| Critical or high-impact invariant violation | Hold |
| Payload does not match reviewed implementation | Hold |
| Unsafe storage collision or initializer behavior | Hold |
| Correctable demonstrated condition remains open | Remediate |
| Material artifact missing or changed | Hold |
| Fork rehearsal cannot represent required state | Hold |
| Material AI hypothesis lacks deterministic confirmation | Not a finding |
| All required gates pass with limitations documented | Proceed |

Every engagement can tighten these rules in the signed scope. Rules cannot be
weakened silently after evidence is observed.

## Limitations

Upgrade Assurance cannot prove the absence of all vulnerabilities. It may miss
unknown attack classes, incorrect customer assumptions, compromised toolchains,
offchain failures, governance compromise, adversarial future state, or behavior
outside the frozen scope. Forks do not perfectly reproduce every mainnet
condition. Third-party tools can fail. A late code or payload change invalidates
the affected evidence.

Nodezuno does not sign, broadcast, deploy, hold keys, control governance, move
funds, recover assets, or make the customer's release decision.

## Requesting a review

Use `/contact/upgrade-assurance` with a high-level description of the audited
baseline, proposed change, target chain, expected execution date, and known
constraints. Do not attach sensitive artifacts to the public form.
