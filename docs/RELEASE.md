# Release procedure

Use a reviewed Git commit as the source of a release. This document covers the
current Cloudflare Worker, D1, and private R2 application. It does not provide
a procedure for the retired RPC, node, explorer, gRPC, or developer-workspace
products.

## Before creating a release

1. Review the complete source diff and confirm it contains only intended
   website changes.
2. Confirm no credentials, `.dev.vars`, local database, export, generated
   runtime state, or private customer file is staged.
3. Confirm the ordered migration files are unchanged unless the release
   includes a separately reviewed database migration.
4. Wait for the repository's required GitHub Actions checks to succeed.
5. Confirm the Cloudflare account, zone, D1 database, private R2 bucket,
   Worker bindings, and platform secrets are the intended production resources.
6. Keep public indexing and payment instructions disabled until the owner has
   explicitly completed the required launch approvals.

The repository is source control, not a secrets manager. Do not put secret
values in GitHub files, workflow output, issue comments, or commit messages.

## Cloudflare release

Use the current release guard and review its output before each state-changing
step:

```sh
pnpm run preflight:cloudflare
```

Apply an approved D1 migration separately and only after verifying the account,
database ID, current migration head, exact SQL diff, and recovery plan:

```sh
pnpm run db:migrate:cloudflare
```

Deploy the Worker through the guarded command documented in
[CLOUDFLARE_PRODUCTION_RELEASE.md](CLOUDFLARE_PRODUCTION_RELEASE.md). Do not
use a direct deployment shortcut to bypass its source and configuration gates.
The deploy command does not decide legal readiness or enable payment
instructions.

After deployment, verify the active Worker version and canonical domain, then
check `/api/v1/live`, `/api/v1/ready`, `/api/v1/health`, authentication,
order intake, email receipt, private deliverable authorization, and outbox
processing. Keep payment disabled during release verification. Do not submit a
real payment to test production.

## Database and compatibility

D1 migrations are ordered history. Do not edit or remove an applied migration.
A Worker rollback does not reverse D1 changes. Use a new forward migration for
schema corrections, and only after an independent recovery point and approved
data-retention plan exist.

The repository contains migration files from earlier product directions.
They remain to preserve migration checksums and upgrade order for existing
databases. Their presence does not restore retired RPC, node, explorer, gRPC,
or workspace code. Do not drop their tables or rows as part of this release.

## Rollback

If the deployed Worker causes a customer-impacting regression:

1. Stop further deploys and record the affected commit and Worker version.
2. Use Cloudflare deployment history to select a known-good compatible Worker
   version.
3. Do not roll back D1 or remove R2 objects unless a separate recovery decision
   authorizes it.
4. Verify health, authentication, order access, private file delivery, and
   notification processing after rollback.
5. Record the incident and corrective follow-up.

A previous Worker version is safe only when it is compatible with the current
D1 schema and stored data.

## Source update for the current cleanup

This cleanup is a normal source change. After reviewing the changed and
deleted file list and confirming that secrets are absent, commit and push the
reviewed changes to the repository's `main` branch. GitHub Actions will run
the configured checks; Cloudflare will not change until a deployment command
or a separately configured deployment workflow publishes a new Worker.
