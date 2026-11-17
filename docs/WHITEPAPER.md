# Nodezuno Upgrade Assurance Whitepaper

- **Document:** NZ-UA-001
- **Version:** Draft 1.0
- **Published:** 10 August 2026
**Scope:** Independent assurance for audited EVM contract upgrades

## Scope notice

This paper specifies a review method and a product direction. It does not claim
customers, revenue, certifications, perfect vulnerability detection, or an
autonomous security model. A public intake request is not an accepted review.
Every paid engagement requires a separate signed scope.

This paper describes the standard EVM method only. It is not presented as a
universal method for non-EVM systems. Any selected non-EVM engagement requires
a chain-specific method, reviewer, scope, and schedule, but uses the same
$7,500 price and $3,750 plus $3,750 payment structure.

## Abstract

Smart-contract audits are usually point-in-time assessments. A protocol can be
audited correctly and later change its implementation, storage, initialization,
permissions, dependencies, build system, or governance payload. The release
team then has to determine whether the assumptions behind the original audit
still hold for the exact proposed upgrade.

Nodezuno Upgrade Assurance is an evidence system for that decision. It binds an
audited baseline, a proposed artifact set, a target chain state, deterministic
checks, AI-assisted investigation, human validation, and a final release
decision into one traceable bundle. The initial service targets audited EVM
systems and produces `Proceed`, `Remediate`, or `Hold` for one frozen release
candidate.

The thesis is simple: an audit should remain useful after publication because
its assumptions can be mapped to every material upgrade.

## 1. Problem

### 1.1 Point-in-time trust

An audit report names a repository state, compiler configuration, scope,
assumptions, exclusions, tests, findings, and accepted risks. Teams and users
often remember the auditor's name but lose the precise technical boundary. A
later upgrade may preserve the product's name while changing that boundary.

### 1.2 Release evidence is fragmented

Evidence commonly lives across source-control diffs, CI logs, deployment
scripts, storage-layout reports, governance proposals, simulation dashboards,
spreadsheets, and chat messages. This makes it difficult to answer:

1. Which exact artifact did the audit cover?
2. What changed between that artifact and the proposed release?
3. Which audit assumptions and protocol invariants are affected?
4. Does the governance payload deploy the reviewed bytecode?
5. What happened when the exact payload ran against relevant chain state?
6. Which facts are deterministic, which are interpretations, and who approved
   the decision?

### 1.3 AI creates both leverage and risk

Models can inspect large diffs, propose attack paths, connect dispersed
evidence, and explain findings quickly. They can also hallucinate, overlook
context, rely on stale knowledge, and produce plausible conclusions without
reproducible support. A model must not become an invisible release authority.

## 2. Goals and non-goals

### Goals

- preserve the exact audited baseline as a machine-readable evidence set;
- bind every proposed release to immutable source, build, bytecode, payload,
  chain, and state references;
- identify changes that affect security or operating assumptions;
- reproduce the candidate on a pinned fork when technically feasible;
- evaluate explicit invariants with deterministic tools;
- use AI to expand investigation while preserving evidence provenance;
- require human validation for every material finding and final decision; and
- produce a concise decision that remains inspectable by technical and
  nontechnical stakeholders.

### Non-goals

- replacing a full audit of unaudited or substantially redesigned code;
- proving that no vulnerability exists;
- formal verification of arbitrary protocol behavior;
- signing, broadcasting, or executing production transactions;
- holding keys, controlling governance, or moving funds;
- providing legal, regulatory, investment, or insurance advice; or
- allowing a probabilistic model to approve a release.

## 3. Threat model

The initial method considers failures introduced by accident, process drift,
tooling error, and malicious change. Representative threats include:

- audited source and deployed bytecode diverge;
- build or dependency changes alter behavior outside the visible source diff;
- a proxy points to an unexpected implementation;
- storage variables collide, reorder, or change type unsafely;
- an initializer is omitted, replayable, misordered, or attacker-accessible;
- roles, owners, guardians, pausers, or upgrade authorities change unexpectedly;
- transaction batches contain hidden calls, delegate calls, approvals, or
  transfers;
- limits, fees, accounting, minting, redemption, liquidation, or solvency
  invariants no longer hold;
- external integrations behave differently at the selected chain state;
- the candidate changes after tests complete;
- evidence is incomplete, stale, or generated with different tool versions;
- an AI system invents or overstates a finding; and
- a reviewer approves under time pressure without resolving uncertainty.

Out of scope by default are compromised customer keys, corrupted consensus,
malicious RPC responses that survive independent verification, future economic
conditions absent from the model, undisclosed offchain dependencies, and
changes outside the frozen artifact set. An engagement may add explicit tests
for some of these conditions.

## 4. Evidence model

### 4.1 Baseline manifest

The baseline manifest contains:

- audit report identifier and hash;
- audited repository and commit;
- compiler, optimizer, target EVM, build flags, and dependency locks;
- audited source and resulting bytecode hashes where reproducible;
- deployed chain, proxy, implementation, and relevant contract addresses;
- ABI, storage layout, roles, initialization, and configuration;
- findings, accepted risks, exclusions, assumptions, and recommended controls;
- documented protocol invariants; and
- provenance for each value.

### 4.2 Candidate manifest

The candidate manifest contains the same comparable fields plus:

- proposed commit and dependency lock;
- proposed implementation bytecode;
- governance or multisig transaction payload;
- initializer or migration calldata;
- expected implementation, storage, role, and configuration deltas;
- target chain and fork block;
- expected execution window; and
- rollback or contingency plan.

### 4.3 Check record

Every check produces a record with:

- stable check identifier;
- input artifact hashes;
- tool and version;
- command or reproducible procedure;
- execution environment;
- start and completion time;
- result state: pass, fail, inconclusive, or not run;
- raw evidence reference;
- reviewer interpretation; and
- limitations.

### 4.4 Finding record

A finding links one or more failed or suspicious checks to an affected
invariant or baseline assumption. It records severity, confidence, impact,
reproduction, recommendation, customer response, reviewer validation, and
resolution state. AI-generated hypotheses remain visibly distinct until a
human verifies them with evidence.

## 5. Review pipeline

### Gate 0: Scope acceptance

The reviewer confirms that the target is an audited EVM release, the change is
bounded, required access is read-only, artifacts can be frozen, timing is
feasible, and conflicts are disclosed. An unsuitable candidate is declined.

### Gate 1: Artifact freeze

Every baseline and candidate artifact is identified and hashed. The chain ID,
fork block, RPC source, toolchain, and environment are pinned. Material changes
after this point invalidate affected downstream evidence.

### Gate 2: Baseline extraction

Audit scope, findings, assumptions, exclusions, accepted risks, and invariant
statements are converted into a review matrix. Ambiguous or missing facts are
marked unresolved rather than guessed.

### Gate 3: Structural comparison

The pipeline compares:

- source and dependency changes;
- compiler and build configuration;
- bytecode and metadata;
- ABI and selector changes;
- storage layout and inheritance order;
- proxy topology and upgrade mechanism;
- role and permission surfaces;
- initializer behavior;
- transaction and batch calldata; and
- expected balance, event, and configuration effects.

### Gate 4: State rehearsal

When feasible, the exact proposed payload is run against a pinned fork. The
pipeline captures call traces, reverts, logs, balance changes, storage changes,
role changes, implementation slots, gas use, external calls, and postconditions.
If the fork cannot represent material production state, the limitation can
force `HOLD`.

### Gate 5: Invariant evaluation

Existing reproducible tests are run first. Targeted checks are then added for
the changed surface. Typical categories include:

- storage compatibility;
- initialization and replay protection;
- authorization and role separation;
- upgrade and rollback authority;
- supply, reserve, solvency, and accounting conservation;
- mint, burn, deposit, withdrawal, liquidation, pause, and recovery paths;
- price, decimal, rounding, and limit behavior;
- reentrancy and unexpected external interaction;
- event and integration compatibility; and
- governance-payload equivalence.

The engagement scope decides the exact catalog. A generic checklist cannot
replace protocol-specific invariants.

### Gate 6: Human validation

A reviewer inspects material diffs, failed checks, suspicious traces, AI
hypotheses, tool limitations, and remediation evidence. Findings without
reproducible support are rejected or marked unresolved. The reviewer records
why each decision rule applies.

### Gate 7: Release decision

- `Proceed` means no release blocker was found within the frozen scope and
  evidence set.
- `Remediate` means a demonstrated condition needs correction and the agreed
  fix needs verification.
- `Hold` means evidence demonstrates a material release blocker or is missing,
  inconsistent, changed, or inconclusive for a required gate.

The customer owns the final execution decision. `Proceed` is not a warranty or
statement that the protocol is safe under every condition.

## 6. AI boundary

AI is an investigation instrument, not an authorization principal.

Allowed uses include:

- suggesting which baseline assumptions a diff may affect;
- proposing additional tests and attack hypotheses;
- grouping related source, trace, and state changes;
- finding contradictions across reports and artifacts;
- drafting explanations from cited evidence; and
- helping reviewers search large evidence sets.

AI cannot:

- create the authoritative artifact hash;
- silently choose the fork state or scope;
- convert an unsupported hypothesis into a finding;
- override a deterministic failed gate;
- sign or broadcast a transaction;
- mark its own output as human-reviewed; or
- assign the final release decision.

Model name, version, prompt or task identifier, inputs, cited evidence, output,
and reviewer disposition should be recorded when AI materially contributes.
Sensitive customer material should use an agreed provider and retention mode.

## 7. Security architecture

The service is non-custodial and read-only by default. It must not receive
private keys, signing shares, seed phrases, deployer credentials, unrestricted
cloud access, or production administrator sessions.

Recommended controls include:

- customer-controlled, time-bounded read-only repository access;
- separate tenant workspaces and encryption keys;
- malware and secret scanning on intake;
- immutable artifact hashes and append-only decision history;
- short-lived service credentials and least privilege;
- restricted egress for analysis workers;
- isolated fork environments with no production signing capability;
- auditable reviewer access;
- deletion and retention terms per engagement;
- incident response and customer notification procedures; and
- an external assessment before accepting highly sensitive production code.

The public website accepts only high-level intake. Private source, exploit
details, credentials, and review evidence require a restricted channel defined
in the agreement.

## 8. Assurance levels

The initial product has one bounded review, but its evidence can be described
with levels to prevent vague claims:

| Level | Meaning |
| --- | --- |
| A0 | Intake only; no technical evidence reviewed |
| A1 | Artifacts frozen and structural comparisons complete |
| A2 | A1 plus reproducible state rehearsal and required invariant checks |
| A3 | A2 plus independent human validation and signed decision bundle |

The opening engagement targets A3 when every required gate is feasible. A
review that cannot reach its contracted level returns `HOLD`, not an inflated
label.

## 9. Output and verification

The final bundle includes the scope, baseline and candidate manifests,
artifact hashes, comparison results, check catalog, traces and state evidence,
finding register, remediation status, limitations, decision, reviewer identity,
and generation time.

The AWS launch profile releases the final report and manifest through the
private engagement page after SHA-256, size, content type, KMS key, metadata,
and S3 object version are verified. The buyer receives a short-lived download
pinned to that version. This protects delivery identity, but it does not make
the operational evidence itself independently correct.

A later verifier should be able to determine whether:

1. the artifacts still match their hashes;
2. the decision refers to the same chain and candidate;
3. required checks actually ran;
4. raw evidence supports material conclusions;
5. AI contributions were reviewed; and
6. a subsequent change invalidated the decision.

The long-term product direction is a machine-verifiable release manifest that
can be referenced by governance interfaces, multisigs, security teams, and
monitoring systems. Adoption of that format is a goal, not a current claim.

## 10. Commercial model

Every accepted EVM or selected non-EVM review has the same fixed $7,500 price,
paid as a $3,750 scheduling deposit and a $3,750 final balance. Each engagement
covers one target chain, one audited or reviewed baseline, one proposed release,
one agreed bounded scope, and one consolidated remediation pass. The published
five-business-day delivery target applies to the standard EVM scope after
readiness. Each non-EVM proposal states its chain-specific schedule.

The product should earn revenue from review value, not token incentives,
grants, fund custody, transaction basis points, or speculative network usage.
Future recurring monitoring is justified only after customers repeatedly pay
for the same checks and request continuous integration.

## 11. Limitations

No finite review can prove the absence of vulnerabilities. Source may not
reproduce bytecode. Fork state may omit relevant conditions. Tests may encode
incorrect assumptions. External systems can change. Governance or keys can be
compromised. A candidate can change after review. New attack techniques can
emerge. Human reviewers and tools can make mistakes.

These limits must be carried into the final decision. They cannot be hidden by
an AI confidence score, a badge, or a marketing claim.

## 12. Roadmap and validation gates

### Phase 1: paid manual proof

- complete five paid reviews in one narrow ICP;
- deliver first evidence within five business days after access;
- measure recurring checks, reviewer hours, false alarms, and buyer value;
- obtain permission before publishing any customer result.

### Phase 2: repeatable review engine

- productize only checks repeated across at least 80 percent of reviews;
- add immutable evidence manifests and customer verification tools;
- integrate common EVM build, proxy, storage, fork, and governance systems;
- preserve human release authority.

### Phase 3: continuous assurance

- trigger evidence pipelines from release candidates;
- detect when a changed artifact invalidates prior assurance;
- publish policy-controlled results to approved governance and multisig tools;
- support additional chains only after paid demand and a complete threat model.

The project should narrow, change, or stop if teams will not pay, required
artifacts are routinely unavailable, reviews remain mostly custom, results do
not affect release decisions, or liability and trust requirements exceed the
value created.

## Conclusion

Onchain systems need to change without discarding the security context they
already paid to create. Nodezuno binds the audit, exact upgrade, chain state,
deterministic evidence, AI-assisted investigation, and human judgment into one
release gate. Its value will be proven only when real teams pay for the result
and use it to make better upgrade decisions.
