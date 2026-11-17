# Changelog

All notable production changes are recorded here. Dates use UTC.

## Unreleased

- Replaced manual pre-payment qualification with direct fixed-scope service
  orders, explicit terms acceptance, and Ethereum stablecoin checkout.
- Added receipt-bound payment-confirmation emails and neutral initial order
  emails that do not ask already-paid buyers to pay again.
- Converted compatible legacy requests to direct checkout while routing
  incomplete unpaid scopes back to the customer form without manual approval.
- Included the shared chain-target module in local and container payment-worker
  releases.
- Made AWS release finalization transactional across worker unit files, timer
  states, image markers, required post-deployment backups, and deployment
  metrics.
- Added fixed Docker process networks and a persistent `DOCKER-USER` credential
  boundary so only the web container can reach EC2 instance metadata.
- Reduced email and payment worker environments to the exact outbound values
  used by each process.

### Release integrity

- Added fail-closed test discovery with required payment, notification, and
  deliverable suites.
- Added a clean-source gate for secrets, generated state, local databases,
  light-node runtime files, and mutable GitHub Action references.
- Pinned CI and CodeQL actions to immutable commit SHAs and added pull-request
  dependency review.
- Pinned the Dockerfile frontend plus Node.js and Go container bases to
  immutable multi-architecture image digests, and made source-integrity checks
  reject mutable Docker references.

### Customer experience

- Removed token-contract copy boxes from checkout and highlighted the sole
  recipient wallet with a larger address and explicit copy action.
- Corrected review-request and Ethereum Mainnet USDC or USDT payment wording.
- Standardized the buyer journey around Order details, Fixed service order,
  Payment, Verification, and Work.
- Replaced qualification wording in operator notifications, status copy, and
  review controls with direct review-request language.
- Associated server field errors with their controls and strengthened visible
  keyboard focus across site modules.
- Added a private capability-protected review portal for proposal status,
  payment instructions, transaction evidence, confirmations, and released
  deliverables.
- Made desktop and mobile navigation single-disclosure, with outside-click and
  route-change closure.

### Commerce and settlement

- Added direct Ethereum Mainnet USDC and USDT payment instructions for the
  fixed scheduling deposit and final balance. No card processor, hosted
  checkout, wallet connection, or server-side signing key is used.
- Added mandatory transaction-hash and Telegram contact submission without
  treating buyer submission as payment proof.
- Added exact token, recipient, amount, canonical block, confirmation,
  finality, transaction-replay, and independent-provider agreement checks.
- Added scheduled payment verification, persisted verifier health, bounded
  retries, manual reconciliation cases, immutable confirmation records, and
  buyer-visible confirmation downloads.
- Added legal launch and public-indexing gates that remain disabled by default.

### Notifications and delivery

- Added a sealed SQLite notification outbox, bounded Resend delivery worker,
  signed delivery-event webhook, double opt-in newsletter flow, and terminal
  failure handling.
- Added versioned, checksum-bound, KMS-protected S3 deliverable upload and
  capability-authorized download flows for the AWS profile.
- Added administrator review-order, proposal, lifecycle, reconciliation, and
  deliverable controls with audit events and guarded transitions.

### Database and deployment

- Declared ordered SQL plus the checksum ledger as the migration authority.
- Disabled unsafe Drizzle migration generation until metadata lineage is
  reconciled.
- Added contiguous sequence, missing-file, contract-migration, current-schema,
  and retired-table guards.
- Prevented standard AWS and local deployment paths from enabling a destructive
  contract migration.
- Added AWS and local one-shot email and payment worker schedules, shared
  locking, health heartbeats, and disabled-mode no-op behavior.
- Added private release defaults, environment coherence validation, immutable
  image deployment, pre-migration backups, code rollback, and source-integrity
  enforcement.
- Added readiness-aware edge admission and least-privilege environment files
  for the web, notification-worker, and payment-worker roles on AWS.

### Operations

- Added CloudWatch metrics and alarms for readiness, host capacity, backup age,
  worker health, payment verifier health, unresolved payment claims,
  reconciliation, notification failures, notification age, and edge errors.
- Added a production release evidence record, restore and recovery procedures,
  alarm response guidance, and explicit external-evidence gates.
- Added a production-style local Mac deployment with scheduled workers,
  verified SQLite backups, release activation, and health inspection.

### Documentation

- Added canonical documentation status, migration policy, contributor rules,
  product terminology, and explicit launch boundaries.
