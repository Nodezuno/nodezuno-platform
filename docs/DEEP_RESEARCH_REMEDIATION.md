# Deep research remediation record

Last reviewed: 2026-09-01

## Source boundary

This record maps the verifiable recommendations in
`deep-research-report.md` to the repository. The supplied file is a 107-line
executive summary. It references a separate 62 KB audit artifact named
`NODEZUNO_CODEBASE_DEEP_REVIEW.md`, but that artifact was not attached. No
claim in this record implies that unseen findings were reviewed.

## Completed repository work

### Release integrity

- Test discovery is recursive, deterministic, and fails when zero tests or a
  required money-sensitive suite is missing.
- GitHub Actions use immutable action commit SHAs.
- Pull requests run dependency review and production dependency audit.
- Generated state, local databases, light-node runtime data, environment
  secrets, and Terraform state are excluded from release source.
- The release-source verifier rejects mutable action references, missing or
  untracked review, payment, worker, migration, deployment, and commerce
  release surfaces, and any dirty working tree.

### Runtime configuration and deployment safety

- Container readiness validates origin, domain, authentication, secret
  isolation, database, ingress, administrator, notifications, deliverable
  storage, payments, and legal launch boundaries.
- The AWS environment uploader rejects duplicate or malformed assignments,
  placeholder values, reused secrets, origin and domain mismatch, invalid
  publication flags, and incoherent payment activation.
- Private deployments default to payments disabled and search indexing off.
- Public indexing and Ethereum Mainnet settlement require explicit legal
  launch approval.
- Disabled payment workers are successful no-ops. Enabled workers still
  require a fresh independent-provider verifier quorum.

### Database migration authority

- Ordered SQL files in `drizzle/` are the only production migration authority.
- Drizzle generation is blocked until a reviewed reconciliation plan exists.
- Migration numbering must be contiguous and applied files may not disappear.
- Migration `0024_remove_legacy_provider_payments.sql` is treated as a contract
  migration. Existing installations require an explicit maintenance cutover;
  standard deployment and rollback paths refuse the override.
- Final schema verification requires current payment, reconciliation,
  deliverable, index, and trigger surfaces and proves retired provider-payment
  tables are absent.

### Customer experience and accessibility

- The primary action is now "Request a review" rather than an eligibility
  claim.
- Applicant language is used before acceptance and customer language after
  acceptance.
- Payment copy describes exact Ethereum Mainnet USDC or USDT settlement and
  does not imply a hosted checkout or wallet connection.
- Form errors are associated with their controls, invalid controls receive
  focus, and a consistent visible keyboard focus indicator is present.
- Desktop and mobile navigation each keep only one section open. Opening a new
  section closes the prior section, and clicking outside navigation closes it.
- Customer-facing text and repository documentation contain no Unicode em dash.

### Operations and observability

- Readiness failures emit bounded structured records with named checks.
- AWS publishes readiness, capacity, backup, worker, payment, reconciliation,
  notification failure, notification backlog, and edge 5xx metrics.
- CloudWatch alarms cover stale worker heartbeats, unhealthy payment evidence,
  unresolved claims, manual reconciliation, terminal notification failures,
  old notification backlog, and aggregate edge 5xx responses.
- Local deployment creates and verifies a pre-deployment SQLite backup before
  migration, preserves the prior release, and rolls back application code if
  the new release does not become healthy.

### Documentation governance

- `docs/README.md` identifies current, retained internal, historical, and
  superseded documents.
- `docs/MIGRATIONS.md` defines expand, migrate, contract, and rollback rules.
- AWS, container, local, security, operations, incident, disaster recovery,
  payment, commerce, API, backend, data model, and release documents describe
  the current Upgrade Assurance product boundary.
- `docs/PRODUCTION_RELEASE_EVIDENCE.md` provides one scoped operator record for
  clean-source provenance, legal approval, external edge checks, notification
  delivery, payment verification, deliverable storage, restore drills, alarms,
  and final sign-off.

## Validation completed

- TypeScript static checking passed.
- ESLint passed.
- Shell syntax checks passed for changed deployment scripts.
- YAML parsing passed for the supported deployment examples and workflows.
- Git whitespace validation passed.
- The Next.js standalone production build passed with `robots.txt` and root
  metadata rendered dynamically from runtime launch flags.
- Local production-style deployment completed with 26 migrations, six status
  services, eight chains, a verified pre-deployment backup, scheduled email and
  payment workers, and healthy liveness and readiness endpoints.
- Two independent Ethereum endpoints agreed on Mainnet chain identity, latest
  and finalized blocks, canonical USDC and USDT contracts, token decimals, and
  receipt behavior. A payment worker pass completed with zero failures.

The full automated test suite was not run during this remediation because the
operator explicitly requested no test execution. The suites remain in source
and CI remains configured to run them from a reviewed commit.

## Blocking gates before a public AWS release

1. Review every intended working-tree change and create a clean source-control
   commit. The current working tree is intentionally not committed by the
   automation agent, so the release-source verifier remains closed.
2. Obtain qualified legal, tax, privacy, sanctions, cross-border payment, and
   refund-process approval described in `docs/AWS_DEPLOYMENT.md`. Record the
   approved document versions and hashes before setting
   `NODEZUNO_LEGAL_LAUNCH_APPROVED=true`.
3. Provision the AWS resources, upload real secrets, confirm the SNS
   subscription, verify Zoho SMTP and mailbox receipt, prove S3 and KMS behavior,
   configure external uptime monitoring, and complete DNS and TLS checks.
4. Run the full CI suite from the reviewed release commit.
5. Supply the referenced detailed 62 KB audit if its additional findings must
   also be mapped and remediated.

Until those gates pass, the local deployment is a production-style private
release, not evidence of a publicly operated production service.
