# Prelaunch customer-flow improvements

Date: 2026-09-05

This is an implementation record, not production launch approval. It extends
the current release-review product without changing its price, payment network,
recipient, accepted-term snapshots, or finalized-evidence settlement rules.

## Customer experience

- The order form uses a light working surface, a fixed-price summary, and three
  clearly labelled sections: team, release, and scope/timing.
- Scope limits and the different EVM/non-EVM timing expectations are visible
  before submission. Supported ecosystems retain the same USD 7,500 price.
- Double submissions are guarded synchronously and form fields are disabled
  while the original request is pending. Random-key creation errors now reach
  the existing accessible error state.
- The private portal uses compact headings, larger labels, a manual refresh
  control, a last-checked timestamp, and a separate stale-status warning.
- Background refresh cannot overwrite a newer payment mutation or clear an
  actionable form error. Pending-claim polling pauses while the tab is hidden
  and resumes when the customer returns.

## Payment instruction safety

The server now returns distinct `acceptingTransfers` and `acceptingClaims`
flags, a server `checkedAt` timestamp, and `claimSubmissionDeadline`.

- A new transfer is invited only for an unexpired `awaiting_transfer`
  instruction with no unresolved claim.
- The portal hides send/copy controls for expired, submitted, confirmed, or
  otherwise non-payable instructions. A failed status refresh also hides them.
- The six-hour late-evidence window remains available after a transfer
  instruction expires. This is for the hash of an already-sent transaction,
  not permission to send funds after expiry.
- Read queries preserve the instruction throughout that evidence window.
  This fixes the previous disappearance of the hash form after a refresh.
- Replaying an expired or cancelled creation request now returns a clear
  conflict instead of returning a stale instruction as a successful checkout.
- Browser retries retain a random idempotency key while the outcome is unknown.
  A completed creation clears that local key; server-side active-intent
  deduplication remains authoritative for later requests.

No schema migration, payment-credit transition, receipt mutation, provider
quorum relaxation, claim limit change, or automated refund was introduced.
Only verified finalized evidence can credit an order. The recipient remains
`0x07218C8E2B01fbff950Af65A0f36D3305520aC3b` and payment remains official Ethereum
Mainnet USDC or USDT only.

## Request and deployment reliability

- Incoming bodies have a ten-second whole-body read deadline and handle client
  cancellation. Existing byte limits and strict UTF-8/JSON checks remain.
  Cancellation of an unresponsive upstream cannot hold the error response open.
- Local startup validates every LaunchAgent definition before starting any job
  and retries transient startup failures using fresh launchd state.
- Local migration preparation stops web, payment, and email jobs even when only
  the workers are loaded. A failed stop prevents migration.
- Rollback output distinguishes a selected previous release from a healthy
  recovered release.
- A local worker lock collision produces a nonzero exit and a safe structured
  error instead of silently reporting a successful skipped pass. Locks are not
  automatically deleted: an operator must confirm the former worker has exited
  before removing an abandoned empty lock directory.

These local supervisor changes do not replace AWS systemd, Docker locking,
off-host backups, or the existing immutable-image deployment requirements.
No additional cloud resources or paid dependencies were added.

## Validation and remaining launch gates

Automated suites and browser interaction tests were not run, at the owner's
request. Compilation, targeted lint, shell syntax, source inspection, and
read-only local health checks are the permitted verification for this batch.
Their actual results must be recorded with the handoff; this file does not
predeclare them successful.

Recorded local results for this batch:

- Next.js standalone production build and TypeScript compilation passed.
- Targeted ESLint and Bash syntax checks passed.
- Control-plane and configured Ethereum endpoint preflights passed.
- The predeployment SQLite backup was created and verified; the database
  remained at 28 applied migration files, with no schema changes in this batch.
- Local release `20260905T114712Z-d5e72875faa2-13481` started healthy.
- This local release includes uncommitted work and is not a releasable clean
  production source commit. The commit fragment in its label is only the
  checkout base, not evidence that these changes are committed.

Public launch still requires the evidence in
[PRODUCTION_RELEASE_EVIDENCE.md](PRODUCTION_RELEASE_EVIDENCE.md), including a
reviewed clean source commit, approved seller/payment/legal position, deployed
TLS and external monitoring, administrator access checks, real email delivery
evidence, controlled USDC/USDT payment validation, and off-host restore proof.
Skipped money-sensitive regression checks remain an explicit release gap.

Do not enable a public production payment configuration or indexing merely
because the local build succeeds. Do not use production customers to discover
checkout or recovery defects.
