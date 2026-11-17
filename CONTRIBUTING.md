# Contributing to Nodezuno

Nodezuno is a money-sensitive production application. Changes must preserve
customer data, payment evidence, authorization boundaries, and rollback
safety.

## Before changing code

1. Read [docs/README.md](docs/README.md) for the active product boundary.
2. Read [docs/MIGRATIONS.md](docs/MIGRATIONS.md) before any schema change.
3. Follow [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md) for safe staging and
   GitHub handoff.
4. Keep local secrets only in ignored environment files.
5. Preserve public API and database identifiers unless a reviewed migration or
   versioned contract explicitly changes them.

## Required change discipline

- Make the smallest coherent change.
- Add or update regression coverage for changed behavior.
- Never weaken payment verification, same-origin checks, request
  authorization, idempotency, finality, or audit records for convenience.
- Never edit an applied SQL migration.
- Never add generated builds, databases, Terraform state, local node runtime,
  or populated environment files to source control.
- Use Applicant or Contact before acceptance and Customer after acceptance.
- Do not describe retained RPC or chain-operations foundations as live public
  products.

## Review gates

```bash
pnpm run release:source:verify
pnpm run test:discovery
pnpm run lint
pnpm exec tsc --noEmit --incremental false
pnpm test
pnpm run build:container
```

Run the release-source check from a clean reviewed commit. Uncommitted and
untracked files are rejected because remote build systems cannot reproduce
them.

The test discoverer exits nonzero if no tests are found or a required
money-sensitive suite is missing. Production release workflows use immutable
action SHAs and dependency review. Do not replace these controls with mutable
tags.

## Pull request description

Explain the customer outcome, security impact, data or migration impact,
rollback boundary, verification performed, and any external evidence still
required. Legal, mailbox-delivery, RPC-provider, DNS, certificate, and cloud
evidence cannot be proven by source code alone and must be called out clearly.
