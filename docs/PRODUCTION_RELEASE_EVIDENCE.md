# Legacy AWS production release evidence record

This template is for the alternate AWS container profile. For the active
Cloudflare Worker profile, use
[CLOUDFLARE_PRODUCTION_RELEASE.md](CLOUDFLARE_PRODUCTION_RELEASE.md).

Use one private copy of this record for every AWS production release. The
record proves what was reviewed, deployed, and observed. It is not a place for
secret values, customer payloads, email addresses, Telegram usernames,
transaction hashes, wallet recovery material, RPC URLs, signed URLs, database
exports, or raw logs.

Every gate has one of three states:

- `PASS`: current evidence is linked and independently reviewed;
- `BLOCKED`: the release cannot become public or accept payment; or
- `NOT IN SCOPE`: the capability is disabled and the reviewer records why.

`NOT IN SCOPE` cannot be used for source integrity, database recovery, legal
approval, authentication, external health, alert delivery, or any capability
that is enabled in the release environment.

## 1. Release identity and clean source

```text
Release label:
Release UTC start:
Release UTC completion:
Repository remote:
Branch:
Commit SHA:
Commit reviewer:
Deployment operator:
GitHub workflow run:
Immutable ECR image digest:
Previous compatible image digest:
Database migration head:
```

Run these commands before packaging. Preserve their redacted output in the
record. The final source-integrity command must run after the intended changes
have been reviewed and committed.

```bash
git status --short
git diff --check
git rev-parse --verify HEAD
git branch --show-current
git show --no-patch --format='%H %cI %s' HEAD
pnpm run release:source:verify
```

The first command must print nothing for a releasable commit. Confirm the exact
commit exists on the protected production branch, then compare it with the
remote branch without changing local source:

```bash
local_commit="$(git rev-parse HEAD)"
remote_commit="$(git ls-remote --exit-code origin refs/heads/main | awk '{print $1}')"
test -n "$remote_commit" && test "$local_commit" = "$remote_commit"
```

Record `PASS` only when the source tree is clean, the full intended diff has
been reviewed, the remote commit is identical, and the immutable image digest
was built by the approved workflow from that commit. Do not deploy a local
working tree, mutable image tag, or manually copied source archive.

## 2. Scope and exact public copy

```text
State:
Reviewer:
Evidence link:
Current public product:
Enabled optional capabilities:
Explicitly disabled retained foundations:
Known public limitations:
```

Confirm all of the following:

- the main action opens the structured service-order form;
- a valid bounded form creates the fixed service order immediately without
  administrator approval;
- the private checkout action says `Accept terms and view payment instructions`;
- public copy does not promise eligibility, acceptance, availability, an SLA,
  a node fleet, or an automated assurance decision;
- the total is USD 7,500, with a USD 3,750 scheduling deposit and USD 3,750
  balance;
- payment copy says official USDC or USDT on Ethereum Mainnet only, the exact
  server-issued token amount must be sent, and the buyer pays network gas;
- copy does not imply a hosted checkout, card processor, wallet connection,
  custody, automated refund, tax invoice, or proof from a transaction hash;
- the transaction hash and mandatory Telegram username are inputs for
  verification, not evidence that payment succeeded; and
- RPC, gRPC, node-attachment, and chain-operation foundations are marked
  `NOT IN SCOPE` unless they have their own current deployment evidence and
  approved public product scope.

## 3. Legal and commerce approval

```text
State:
Qualified adviser:
Approval date:
Seller identity document version and SHA-256:
Terms version, effective date, and SHA-256:
Privacy version, effective date, and SHA-256:
Security or disclosure policy version and SHA-256:
Tax, GST, accounting, and valuation decision record:
FEMA and cross-border payment decision record:
Sanctions screening procedure:
Manual refund procedure and authority:
Proposal, cancellation, expiry, and delivery terms:
```

This gate is `BLOCKED` until a qualified adviser approves the production
position for Sanjay Sudagani, sole proprietor trading as Nodezuno. Source code,
a successful build, an AWS deployment, and a self-custody wallet do not satisfy
this gate.

Keep these values in the deployed environment until the record is approved:

```text
NODEZUNO_LEGAL_LAUNCH_APPROVED=false
NODEZUNO_PUBLIC_INDEXING=false
NODEZUNO_STABLECOIN_PAYMENT_MODE=disabled
```

Manual mode does not run automatic payment verification and is available only
after the owner approves launch. The release remains blocked until the owner
records the applicable legal, tax, seller-disclosure, and payment-handling
decisions. Keep the deployed payment mode `disabled` until those checks are
complete. Do not enable `ethereum_mainnet` on the Cloudflare Free profile.
Public indexing remains a separate release decision.

## 4. AWS and external edge evidence

```text
State:
AWS account and region:
Terraform plan and apply record:
EC2 instance ID:
Encrypted data-volume ID:
ECR digest and scan result:
DNS provider and checked UTC time:
Apex and www resolution result:
TLS certificate identity and expiry:
External monitor provider and check ID:
External alert destination and delivery proof:
SNS subscription and controlled alarm-delivery proof:
Public origin:
Ingress mode:
```

Verify `/`, `/docs`, `/api/v1/live`, `/api/v1/ready`, and
`/api/v1/health` from a network outside AWS and outside the deployment host.
Record status, UTC time, latency, certificate result, and safe response summary.
Do not treat a local container probe, an SSM shell, or a CloudWatch metric from
the same host as external availability evidence.

## 5. Authentication and administrator boundary

```text
State:
Email sender-domain verification:
Email signup and verification result:
Password reset result:
Google result or NOT IN SCOPE reason:
EVM wallet result:
Solana wallet result:
Administrator allowlist reviewer:
Administrator MFA evidence:
Anonymous admin denial:
Non-allowlisted authenticated denial:
Session revocation result:
```

Do not record account addresses or session values. A wallet-only synthetic
email must not authorize administration.

## 6. Notification delivery

```text
State:
Operations mailbox owner:
Zoho SMTP host review:
Zoho app password stored in the secret manager:
Email-worker timer state:
SMTP acceptance safe ID and UTC time:
Controlled mailbox receipt UTC time:
Terminal failure count:
Oldest unresolved age:
```

API acceptance, worker success, a synthetic callback, and controlled mailbox
receipt are separate facts. General availability remains blocked until the
signed provider event and controlled receipt are both observed. Reconcile
`pending`, `processing`, `accepted`, and `failed` rows without copying payloads
or changing sealed rows by hand.

## 7. Ethereum stablecoin settlement

```text
State:
Legal gate reference:
Payment mode:
Recipient-address review:
Wallet control and offline recovery owner:
Refund authority and destination-verification record:
Payment worker timer state:
Confirmation policy:
Verifier heartbeat age and configuration match:
Configured provider count:
Healthy provider count:
Provider names, chain ID, latest block, finalized block, and checked UTC time:
USDC instruction and verification result:
USDT instruction and verification result:
Wrong-network, token, recipient, amount, replay, disagreement, and finality evidence:
Oldest unresolved claim age:
Manual-review count and assigned owner:
```

Record no endpoint URL, provider credential, transaction hash, Telegram
username, wallet recovery material, address beyond the public recipient, or raw
RPC response. Payment can be `PASS` only when every configured independent
provider is healthy, the persisted heartbeat is current and configuration
matched, the scheduled worker is healthy, and the approved end-to-end
rehearsal is complete. A transaction hash or block-explorer page is not payment
evidence.

## 8. Deliverable storage

```text
State:
Private bucket and public-access-block review:
Versioning and lifecycle review:
KMS key and key-policy review:
Application IAM review:
CloudTrail object data-event result:
Sealed upload and checksum result:
Final report and manifest completion gate:
Authorized version-pinned download result:
Cross-order denial result:
Signed URL expiry result:
```

Do not include customer filenames, content, object keys, signed URLs, or
downloaded artifacts in this record.

## 9. Database backup and restore

```text
State:
Database driver and volume identity:
Pre-deployment backup key and manifest key:
Backup UTC time, byte size, and SHA-256:
S3 retention and checksum observation:
Post-deployment backup key and manifest key:
Last successful isolated restore drill:
Drill source, isolated target, and reviewer:
Schema and integrity result:
Expected and actual row-count checks:
Measured RPO:
Measured RTO:
Sampled payment-confirmation relationship result:
Sampled deliverable-version and KMS result:
Next drill due:
```

A locally verified upload is not complete recovery evidence until an approved
operator can retrieve the off-host object and a restore drill succeeds. Stop
web mutations plus both background-worker timers before a production restore.
Reconcile payment and notification queues before restarting either timer.

## 10. Monitoring, alerts, and runbooks

```text
State:
CloudWatch dashboard URL:
All alarm states reviewed UTC:
SNS controlled delivery result:
External uptime alert result:
Application and edge log retention:
CloudTrail delivery status:
Named incident commander:
Named operations owner:
Named data steward:
Named security reviewer:
Named communications owner:
Runbook review date:
```

Review every alarm listed in [OPERATIONS.md](OPERATIONS.md), including missing
data behavior. Prove that the independent monitor and SNS destination reach a
channel outside the web host. An alarm returning to `OK` is recovery evidence,
not incident closure. The incident record still needs impact, timeline, data
integrity, root cause, corrective owners, and reviewer approval.

## 11. Release validation and approval

Record the command, exact commit, start and end UTC times, exit status, skipped
reason, and artifact digest for each required quality gate. Do not reuse a
historical result. A skipped target-driver, money-sensitive, restore, or
external integration gate keeps the release `BLOCKED`.

```text
Frozen dependency install:
Production dependency audit:
Lint:
Type check:
Required automated suites:
Production container build:
Migration rehearsal:
Read-only public probes:
Runtime link crawl:
Desktop, tablet, mobile, keyboard, and navigation review:
Known gaps and owners:
Rollback decision owner:
Final release state:
Operator signature and UTC time:
Independent reviewer signature and UTC time:
```

The final state may be `PASS` only when every enabled-capability gate passes,
the source commit is clean and remote, legal approval is current, external
evidence is attached, recovery is proven, and rollback ownership is named.
