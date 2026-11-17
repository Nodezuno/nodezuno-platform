# Database migration policy

**Authority:** ordered SQL files in `drizzle/` plus the
`nodezuno_schema_migrations` checksum ledger

**Applies to:** SQLite and Cloudflare D1 REST deployments

**Current sequence:** `0000` through `0027`

## One migration authority

The runtime migration authority is the ordered set of `NNNN_name.sql` files.
The migration runner calculates a SHA-256 checksum for every file and records
the filename, checksum, time, and application mode in
`nodezuno_schema_migrations`.

The files under `drizzle/meta/` describe the earlier Drizzle-generated history
only. They end before the current production SQL sequence and are not used by
the runtime migrator. `pnpm run db:generate` is intentionally blocked until a
separate migration-lineage project either reconstructs correct Drizzle
snapshots or formally removes Drizzle generation. Do not hand-edit the journal
to make migration numbers appear aligned.

## Required rules

- Migration filenames must be unique, ordered, and contiguous.
- Never change a migration after it has been applied.
- Never remove an applied migration file from the repository.
- Every schema change requires a new SQL file and a corresponding schema
  verification update.
- Normal release migrations must be backward compatible with the immediately
  previous application release.
- A destructive change requires a separately approved expand-and-contract
  plan, a verified recovery point, a maintenance boundary, and an explicit
  decision about rollback compatibility.
- Production releases must apply the exact migration bytes contained in the
  reviewed image or source commit.

The migration runner fails when the sequence has a gap, an applied file is
missing, an applied checksum changes, a required table, index, trigger, or
column is absent, or a retired production table unexpectedly remains. There
is one narrow legacy-ledger exception: the exact previously reviewed checksum
for `0002_next_guardsmen.sql` listed in `REVIEWED_LEGACY_MIGRATION_CHECKSUMS`
can be normalized to the current checksum without replaying its SQL. This
existing compatibility exception is not permission to edit applied migrations
or add further exceptions during a normal release.

## Fresh installation

A new database can apply `0000` through `0027` before the first application
process becomes public. This is the intended path for Nodezuno's first AWS
deployment. Keep both controls false:

```text
NODEZUNO_ALLOW_SCHEMA_BASELINE=false
NODEZUNO_ALLOW_CONTRACT_MIGRATIONS=false
```

No contract override is needed on an empty database.

## Existing schema baseline

`NODEZUNO_ALLOW_SCHEMA_BASELINE=true` is a one-time reviewed cutover for a
healthy pre-ledger database. It is not a general migration bypass and it does
not authorize contract migrations. Return it to `false` immediately after the
recorded cutover.

## Contract migration 0024

`0024_remove_legacy_provider_payments.sql` removes the retired provider-payment
tables. A release older than `0024` may still expect those tables, so applying
it to an existing database can make application rollback unsafe.

The standard AWS and local deployment commands refuse
`NODEZUNO_ALLOW_CONTRACT_MIGRATIONS=true`. On an existing database that has not
applied `0024`, the migration runner also stops before the contract change.
This preserves the currently running release and its data.

For a future existing installation, do not bypass the guard during a normal
deployment. Create a change-specific maintenance runbook that includes all of
the following:

1. Prove the candidate release no longer reads or writes the retired tables.
2. Build and verify the immutable candidate before the maintenance window.
3. Stop the old web process and every worker.
4. Create and independently verify a database recovery point.
5. Record row counts and prove the cutover guard in `0024` reports no unsafe
   records.
6. Apply the exact candidate migration with
   `NODEZUNO_ALLOW_CONTRACT_MIGRATIONS=true` only for that one maintenance
   command.
7. Return the setting to `false` before starting the candidate.
8. Verify schema, readiness, payment-worker health, and the private review
   portal before restoring public traffic.
9. If the candidate fails, do not start a pre-`0024` image against the
   contracted database. Stop services, restore the verified pre-migration
   database, verify it, and only then restore the prior application release.

This repository has not been deployed to AWS yet, so the supported launch path
is a fresh database rather than an in-place pre-`0024` production upgrade.

## Additive migration 0025

`0025_review_language.sql` updates the public status description from
qualification wording to review-intake wording. It changes no table, index,
trigger, authorization rule, payment record, or customer evidence. It is safe
to apply after the guarded `0024` boundary as part of the candidate release.

## Direct ordering migrations 0026 and 0027

`0026_direct_checkout.sql` converts eligible legacy unpaid requests to the
generated-order flow. `0027_direct_checkout_scope_correction.sql` corrects
only unaccepted auto-converted records with missing or oversized scope and no
payment instruction. They do not change accepted terms or existing payment
evidence. Both are applied history and must remain byte-for-byte unchanged.

## Release verification

Before an approved release:

```bash
pnpm run release:source:verify
pnpm run test:discovery
pnpm run db:migrate:container
```

Run the migration first on a fresh isolated database with the same driver as
production. For a supported upgrade rehearsal, restore a representative
verified backup into isolation and apply the candidate there. The application
readiness route must pass after migration. A container image is not a database
backup.
