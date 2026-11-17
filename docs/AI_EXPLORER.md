# Nodezuno AI Explorer contract

**Status:** Product architecture and interactive website prototype
**Audience:** Chain teams, ecosystem foundations, operators, and reviewers

## Purpose

Nodezuno AI Explorer is intended to explain what happened on a chain and what
the infrastructure observed at the same time. It joins conventional explorer
data with node, consensus, indexing, upgrade, and incident evidence.

The first release targets operators and developers. It is not a trading agent,
wallet, signer, or autonomous chain administrator.

## Evidence model

Every factual answer must cite one or more typed records:

- block header and canonicality observation;
- transaction, receipt, decoded log, or execution trace;
- contract code digest and verified source version;
- validator, sequencer, proposer, or consensus observation;
- RPC probe and node synchronization sample;
- indexer cursor and lag measurement;
- deployment manifest and release digest;
- approved network change or upgrade record;
- alert, incident, and operator timeline entry; or
- signed snapshot manifest and restore evidence.

An answer that cannot retrieve sufficient evidence must say that the result is
unknown or incomplete. It must not fill missing fields with a likely story.

## Query pipeline

```text
question
  -> tenant, chain, environment, and time scope
  -> intent and entity classification
  -> typed retrieval plan
  -> permission-filtered evidence queries
  -> deterministic calculations
  -> language explanation
  -> evidence citations and confidence label
```

The language model receives bounded evidence objects, not unrestricted
database credentials. Query planning and answer generation are separate. Every
retrieval tool enforces workspace, chain, environment, field, time, and row
limits on the server.

## Initial operator questions

1. Explain this failed transaction from call to receipt.
2. Was the chain producing blocks during this incident window?
3. Which nodes disagreed with the canonical head?
4. Which validators missed or delayed the affected blocks?
5. How far behind was the explorer when this transaction was submitted?
6. What changed between the previous and current network release?
7. Which contracts and addresses were active during the incident?
8. Is this an application failure, node failure, consensus issue, or indexing
   delay?

## Confidence labels

- **Verified:** All material claims are supported by canonical chain records
  and independent operational evidence.
- **Supported:** Evidence is internally consistent but lacks one independent
  source or finality condition.
- **Partial:** The answer is useful but one or more required records are
  missing, stale, or outside retention.
- **Unknown:** Available evidence cannot answer the question safely.

The model may never upgrade its own confidence label.

## Security boundaries

- Read-only by default.
- No private keys, seed phrases, RPC provider credentials, auth cookies, raw
  API-key secrets, or unredacted customer payloads enter prompts.
- Tenant filtering happens before retrieval.
- Prompt text is untrusted input and cannot change tool policy.
- Retrieved contract metadata and logs are also untrusted content.
- Tool calls have fixed schemas, allowlists, timeouts, and result limits.
- No transaction signing, validator action, upgrade, restart, or rollback can
  be triggered from an explorer answer.
- Operational actions require a separate change workflow, explicit approval,
  idempotency, audit, and rollback boundary.

## Evaluation

The beta cannot ship on aesthetic demos alone. It needs fixtures covering:

- successful and reverted transactions;
- proxy and delegate-call traces;
- chain reorganization;
- stale RPC head;
- indexer lag;
- validator misses;
- sequencer interruption;
- partial network partition;
- release mismatch;
- snapshot corruption; and
- insufficient evidence.

For each fixture, tests must assert retrieved evidence, deterministic
calculations, prohibited claims, citation completeness, and confidence label.

## Product boundary today

The website includes an interactive synthetic-data prototype to communicate
the intended workflow. It does not call a language model or represent live
chain indexing. The implemented local Ethereum light-client path remains a
separate verified RPC lab.

The first real AI Explorer milestone begins only after Nodezuno operates an
indexed local devnet with recorded node and consensus telemetry.
