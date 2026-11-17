# Nodezuno security model

This document separates the security of the public website from the proposed
security boundary for paid Upgrade Assurance work. It does not claim an audit,
SOC 2 report, ISO certification, penetration test, insurance policy, bug-bounty
program, or completed customer engagement.

The current low-cost hosting target is Cloudflare Workers with D1 and private
R2. The AWS and SQLite architecture below is retained as an alternate legacy
deployment profile, not a description of the current Cloudflare runtime.
Cloudflare Free has a 10 ms Worker CPU limit per request and Cron invocation;
that limit can prevent some authenticated or dynamic routes from completing.
The checked-in Cloudflare production profile keeps payment instructions
disabled by default. After explicit launch approval, it can accept
customer-submitted Ethereum payment details for manual operator review. It does
not run the Ethereum payment verifier. A hash submission is not proof of
payment, and only an authenticated admin action after manual inspection
advances the order. See [CLOUDFLARE_FREE_TIER.md](CLOUDFLARE_FREE_TIER.md) and
[CLOUDFLARE_PRODUCTION_RELEASE.md](CLOUDFLARE_PRODUCTION_RELEASE.md) for the
platform boundaries and release gates.

## 1. Security objectives

Nodezuno is designed to:

1. accept high-level review requests without collecting private code or keys;
2. keep website accounts, sessions, submissions, and administrative actions
   tenant-bound and auditable;
3. perform future paid reviews with read-only, least-privilege access;
4. preserve the integrity and provenance of review evidence;
5. prevent AI or automation from authorizing a customer release;
6. verify incoming stablecoin transfers without holding a seller signing key;
7. release final deliverables through checksum-verified, private,
   version-pinned storage; and
8. fail closed when identity, scope, payment evidence, deliverable identity, or
   configuration is uncertain.

## 2. Product trust boundary

### Nodezuno may receive

- audit reports and accepted-risk context;
- read-only repository access;
- source, build, dependency, ABI, bytecode, and storage artifacts;
- public contract addresses and target chain information;
- proposed governance or multisig calldata;
- stated protocol invariants and release expectations;
- named technical contacts and decision owners; and
- an Ethereum transaction hash and Telegram username through the authorized
  payment-claim form.

### Nodezuno must not receive

- private keys, seed phrases, signing shares, or recovery secrets;
- production deployer credentials or administrator sessions;
- unilateral signing, governance, or custody authority;
- broad cloud or internal-network access;
- unnecessary customer personal data; or
- sensitive artifacts through the public intake form.

Nodezuno does not sign, broadcast, deploy, upgrade, pause, govern, or move
funds. The customer remains the sole production release authority.

The seller recipient is public, but its private key and recovery material must
remain completely outside the website, database, container, worker, logs, and
backup set. The website observes public-chain evidence only. It cannot issue a
refund or outgoing transfer.

## 3. AI boundary

AI output is untrusted analysis until it is verified. A model may propose
attack hypotheses, relate a change to an audit assumption, suggest a test,
cluster traces, or draft an explanation. It may not:

- define the authoritative scope or artifact identity;
- override a deterministic failed check;
- turn an unsupported hypothesis into a finding;
- assign the final recommendation;
- mark its own output as human-reviewed; or
- access private customer material without an approved provider, retention
  mode, data path, and engagement purpose.

Material AI use should record provider, model, task identifier, input evidence,
output, and reviewer disposition. The final Proceed, Remediate, or Hold
recommendation requires a named human reviewer.

## 4. Evidence integrity

Each review should pin:

- repository and commit;
- source and dependency lock hashes;
- compiler, optimizer, EVM target, and build tool versions;
- resulting bytecode;
- proxy, implementation, and relevant contract addresses;
- governance or multisig payload;
- chain ID, RPC source, and fork block;
- check tool and version; and
- reviewer identity and decision time.

A changed artifact invalidates the affected downstream checks. Results are
pass, fail, inconclusive, or not run. Missing evidence cannot be silently
treated as a pass.

## 5. Proposed engagement controls

These controls are required before Nodezuno accepts private production source.
Their presence must be verified for the actual environment rather than inferred
from this document.

- one isolated workspace and encryption context per engagement;
- customer-controlled, read-only, time-bounded repository credentials;
- named reviewer access with multifactor authentication;
- encrypted transport and storage;
- secret and malware scanning before analysis;
- isolated fork execution with no production signer or deployer access;
- dependency pinning and reproducible tool containers;
- restricted egress appropriate to customer-approved AI and tool providers;
- append-only access and decision events;
- tested backup, deletion, and incident procedures;
- written retention and deletion dates; and
- separate private channels for high-severity findings.

Until those controls and contractual terms are operating, the website must be
used only for non-confidential qualification.

## 6. Website architecture

### Current Cloudflare profile

```text
Browser
  -> Cloudflare Worker and static assets
       -> D1 binding DB for website state
       -> private R2 binding DELIVERABLES for released review files
       -> Zoho SMTP over TLS port 465 for email
  Cron Trigger -> at most one outbox item per minute
```

The Worker streams private review files through authenticated same-origin
routes. R2 uses Cloudflare-managed encryption at rest in this profile. There
is no AWS KMS key, public object URL, or direct bucket access. D1 and R2 are
separate recovery surfaces. Secrets are Worker secrets, not checked-in
variables. This profile has no availability SLA or claim of production-scale
capacity. Stablecoin instructions remain unavailable while
`NODEZUNO_STABLECOIN_PAYMENT_MODE=disabled` or the launch approval flag is
false. Manual mode must be explicitly enabled after launch approval. Do not
select `ethereum_mainnet` on the Free profile.

### Alternate AWS container profile

The production container is a Next.js application behind a TLS reverse proxy.
It uses a durable database for submissions, sessions, consent, request history,
rate limits, and administrative audit records. The lowest-cost AWS profile uses
one process and one encrypted SQLite volume.

```text
Browser
  |
  v
AWS security group and Caddy TLS
  |
  v
Nodezuno container, unprivileged UID 1001
  |
  v
Encrypted persistent SQLite volume
  ^
  |
one-shot email worker -> Zoho SMTP

one-shot payment worker -> dedicated Ethereum RPC endpoints
                         -> public receipt and finalized-block evidence

allowlisted administrator -> sealed presigned upload -> private versioned S3
private S3 -> exact customer-managed KMS key
authorized buyer -> five-minute version-pinned signed download
private S3 object access -> CloudTrail data-event audit
```

SQLite permits exactly one application writer in this profile. Multiple active
replicas require a reviewed managed-database migration.

## 7. Implemented website controls

### Request admission

- mutation routes require JSON and bounded request bodies;
- schemas reject unknown or oversized fields;
- same-origin checks reject cross-site writes;
- forms include a honeypot, signed proof-of-work challenge, and database-backed
  IP and email rate limits;
- submission creation requires a bounded idempotency key;
- exact replays return the prior receipt and changed replays fail;
- public error responses carry request IDs without exposing stack traces; and
- public intake warns against sending credentials, exploit material, private
  repositories, or other sensitive evidence.

### Authentication and authorization

- Better Auth sessions are database-backed and use host-only, HttpOnly,
  SameSite cookies;
- email accounts require a configured delivery provider on public deployments;
- configured Google, EVM wallet, and Solana wallet paths resolve a stable
  application identity;
- protected resources derive tenant identity from the session rather than
  caller-supplied IDs;
- administrator routes require a verified real-email account plus exact
  membership in `NODEZUNO_ADMIN_EMAILS`;
- wallet-only synthetic email cannot become administrator identity; and
- administrator mutations produce audit records.

### Browser and response controls

- per-request Content Security Policy nonces protect scripts;
- framing and object embedding are denied;
- HTTPS receives HTTP Strict Transport Security;
- content-type sniffing is disabled;
- referrer, permission, opener, and resource policies are restricted; and
- sensitive application, API, account, and administrator paths are excluded
  from indexing.

### Notification delivery

- business mutations persist notification intent before any provider call;
- the Cloudflare Cron worker claims at most one D1 outbox row per minute and is
  constrained by the Free CPU limit; the alternate container worker claims one
  row at a time under an exclusive SQLite transaction and two-minute lease;
- a canonical payload hash and database trigger make the delivery identity,
  topic, entity, template, payload, and creation time immutable after sealing;
- SMTP requests use a stable message ID for correlation, bounded timeout,
  exact payload validation, and hydrated current database state; SMTP does not
  guarantee idempotent delivery;
- retryable failure uses bounded exponential delay and deterministic jitter;
  permanent failure, eight attempts, or the 20-hour retry horizon produces a
  terminal dead letter;
- logs contain only aggregate pass counts and event names, never recipient,
  subject, body, provider response, private tracking link, or newsletter token;
- Zoho SMTP success records only `accepted`;
- no provider callback records inbox delivery, bounce, suppression, or
  complaint outcomes; and
- SMTP delivery is not idempotent, so uncertain sends must not be retried
  blindly.

Operators must treat dead letters and accepted messages without confirmed
mailbox receipt
as reconciliation work, not as reasons to edit sealed database content.

### Stablecoin payment verification

- payment instruction and claim routes require exact same origin plus the
  scoped review cookie or exact account already bound to the order;
- the server fixes chain ID 1, canonical USDC or USDT contract, six decimals,
  recipient, phase, proposal version, expiry, and exact atomic amount;
- each instruction carries a unique 1 to 9,999 atomic-unit reference suffix,
  and the buyer must transfer the exact displayed amount without rounding;
- claim payloads accept only a complete Ethereum transaction hash and a
  mandatory Telegram username, normalized to lowercase with one leading `@`;
- transaction hashes are globally unique, preventing reuse across buyers,
  orders, and phases;
- claim submission never changes paid state;
- every configured dedicated RPC endpoint must report chain ID 1 and agreeing
  normalized evidence;
- each worker pass stores a heartbeat tied to the active provider and endpoint
  configuration; new instructions require every endpoint healthy and that
  heartbeat no older than 150 seconds;
- verification requires a successful receipt, exactly one canonical selected
  token `Transfer`, exact recipient and amount, a readable receipt block,
  sufficient confirmations, and finalized-block progress;
- missing receipts, timeout, malformed data, disagreement, reorg uncertainty,
  and insufficient finality remain confirming or enter manual review;
- exact verification creates an immutable payment-confirmation ledger row;
- seller-received anomalies open immutable reconciliation cases;
- applying a case requires exact same origin, a fresh real-email allowlisted
  administrator session, durable idempotency, exact action, a bounded decision
  note, complete finalized official-token evidence, the seller recipient, at
  least two agreeing providers, and the narrow contractual amount rule;
- arbitrary amounts and ambiguous receipts cannot be applied;
- an eligible reconciliation atomically changes the case, intent, order,
  confirmation, order event, administrator audit event, and buyer notification;
- the buyer confirmation route is bound to the exact order and returns private
  no-store JSON that is not a tax invoice or custody receipt; and
- worker logs contain aggregate counts only, never RPC URLs or headers,
  Telegram usernames, transaction hashes, addresses, or receipts.

An Etherscan page, wallet success screen, screenshot, submitted hash, or buyer
statement is not payment authority. Do not add an administrator shortcut that
marks payment from such evidence. Use only the guarded reconciliation route
when the stored eligibility result permits application. An ineligible or
conflicting case requires a separately approved incident process, never an ad
hoc database edit.

### Secure deliverables

- only an allowlisted administrator can prepare or finalize a deliverable;
- the database seals the order, kind, filename, content type, exact byte length,
  and SHA-256 value before returning a same-origin authenticated R2 upload
  route;
- the browser streams the exact-length file through the Worker to the private
  R2 binding, with an application limit of 90 MiB;
- finalization accepts only an R2 object whose size, type, checksum, sealed
  metadata, ETag, and object version match the database record;
- a final report and manifest are mandatory before an order can be completed;
- only released files appear to the buyer, and every download requires current
  authorization for that exact review order;
- buyer downloads are private no-store Worker streams that recheck order
  authorization, ETag, version, length, and checksum; no public object URL is
  issued; and
- application prepare, verify, release, and lifecycle actions are preserved in
  the database audit history. The alternate AWS profile adds S3/KMS controls
  and CloudTrail object data events.

The deliverables bucket is an output channel for reviewed final artifacts. It
does not turn the public intake form into a confidential source-upload channel.
Private source and exploit evidence still require engagement-specific intake,
analysis, retention, and deletion controls.

### Secret handling

`RATE_LIMIT_SECRET`, `API_KEY_PEPPER`, `BETTER_AUTH_SECRET`, and
`REVIEW_CAPABILITY_SECRET` must be unique, random values of at least 32
characters. OAuth, email, customer RPC, and dedicated payment RPC
credentials remain deployment secrets. They must not appear in source control,
container images, logs, support tickets, public forms, or client-side code.
`ZOHO_SMTP_PASSWORD` is a protected app password for the fixed
`info@nodezuno.com` mailbox. The mailbox address is not an authorization
credential.

### Data handling

Website intake stores the submitted identity and company fields, high-level
message, request kind, source path, consent version and time, status, and
timestamps. Abuse controls store bounded fingerprints. Sessions and provider
accounts remain in the selected database. The application does not ship an
advertising tracker.

A payment claim stores the normalized Telegram username and public Ethereum
transaction hash, linking contact information to public-chain activity. It is
personal and commercial data even though the transaction is public. It is
returned only through the authorized buyer portal, exact account export, and
restricted administrator view. Account export includes the claimant's
instruction and chain evidence but redacts payment RPC configuration, headers,
and worker leases.

The public website database is not the correct store for customer source,
exploit reproduction, or private review file contents. It stores only sealed
metadata and release state. In the current Cloudflare profile, final file
bytes remain in private R2. The alternate AWS profile uses private
KMS-encrypted S3.

## 8. Alternate AWS production controls

The supplied first-production profile requires:

- an encrypted EC2 volume;
- ports 80 and 443 only, with no SSH ingress and operator access through AWS
  Systems Manager Session Manager;
- Caddy-managed HTTPS;
- port 3000 available only inside the Compose network;
- an unprivileged application container with no-new-privileges;
- mode `0700` data and backup directories owned by UID 1001;
- four independent application secrets;
- verified email delivery for public email authentication;
- the Zoho SMTP host, protected app password, `info@nodezuno.com` mailbox, and
  scheduled one-shot notification worker;
- a scheduled one-shot payment worker, two or three dedicated payment RPC
  endpoints with distinct providers and hosts, successful chain and token
  preflight, a fresh persisted verifier heartbeat, CloudWatch payment alarms,
  and aggregate-only logs;
- a private versioned S3 deliverables bucket, dedicated rotating KMS key,
  checksum-sealed uploads, version-pinned downloads, least-privilege IAM, and
  CloudTrail object data events;
- exact `PUBLIC_ORIGIN` and `BETTER_AUTH_URL` values;
- daily application-consistent backups copied to encrypted private S3;
- EBS snapshots as an additional layer;
- readiness checks before publication; and
- `NODEZUNO_PUBLIC_INDEXING=false` until legal, security, content, form, and
  recovery checks pass.

See [AWS_DEPLOYMENT.md](AWS_DEPLOYMENT.md).

## 9. Known limitations

- The initial AWS profile has one host, one availability zone, one web process,
  and one SQLite writer. It is not horizontally scalable or highly available
  and has no public SLA.
- Repository controls do not prove that a particular deployment is configured
  correctly.
- Source inspection does not prove live Zoho SMTP acceptance, DNS
  authentication, or mailbox delivery.
- Mocked payment tests do not prove endpoint independence, Ethereum
  availability, finality, stablecoin value, seller wallet access, or refund
  operations. Production preflight and a separately approved exact-value
  rehearsal are separate gates. The fixed payment is not a low-value probe.
- Source tests do not prove the deployed S3 bucket policy, KMS key, CloudTrail
  data-event delivery, presigned upload CORS, or buyer download authorization.
  Those are deployment checks before a customer deliverable is released.
- Direct wallet collection does not remove tax, accounting, invoicing,
  sanctions, AML, consumer-protection, or India-specific regulatory duties.
- The website has not been represented as independently penetration tested.
- Legal summaries remain drafts until qualified counsel approves them for the
  operating entity and customer jurisdictions.
- A review can miss vulnerabilities and depends on complete customer inputs.
- Fork execution cannot perfectly reproduce every future mainnet condition.
- Third-party repositories, RPC providers, model providers, and analysis tools
  have their own failure and trust boundaries.

Do not publish an availability, certification, data-residency, retention,
insurance, review-quality, or security-effectiveness claim until it is measured
and supported by the actual deployed control.

## 10. Responsible disclosure

Use `/security/responsible-disclosure` for a high-level report about a suspected
vulnerability in Nodezuno-owned systems. Do not test customer protocols,
third-party infrastructure, or public chains under that policy. Avoid denial
of service, destructive tests, persistence, social engineering, broad data
access, and publication before coordinated remediation.

Do not put live secrets or dangerous reproduction material in the public form.
Start with impact, affected Nodezuno asset, minimal safe proof, and contact
information. Wait for a restricted channel before sharing sensitive evidence.
