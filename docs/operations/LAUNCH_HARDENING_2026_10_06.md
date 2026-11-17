# Launch hardening and frontend improvement record

Date: 2026-10-06.
Scope: current public release-review service, production dependencies,
customer API diagnostics, and native macOS deployment reliability.
No AWS resources or external publication were created by this work.

## Customer-facing improvements

- Reworked the homepage with a concise description of the service, readable
  typography, clear section navigation, stronger contrast, and a static
  explanation of the actual report deliverables. Removed the obsolete
  interactive upgrade example and its unused styles.
- Gave product, methodology, and pricing dedicated server-rendered layouts.
  Product separates coverage from deliverables; methodology separates the
  customer process from the technical method; pricing separates the fixed
  fee, payment milestones, scope, and exclusions.
- Kept informational pages focused on their purpose instead of inserting
  repeated order prompts. The shared navigation remains the global entry
  point; pricing has one contextual order action.
- Simplified account creation and login while preserving email, configured
  Google, EVM, and Solana authentication controls. Added scoped light-theme
  form styles, accessible focus states, mobile input sizing, and clearer
  provider-specific error language.
- Desktop menus close when keyboard focus leaves the header. Existing
  one-open-menu, outside-click, Escape, and mobile navigation behavior remains.
- Status now has a fifteen-second request deadline, cancellation cleanup,
  retry/refresh controls, bounded response validation, and explicit failure
  states. An unavailable response no longer displays preview fallback
  services or implies a clean incident history.
- Removed the client boundary from the static detail-page shell. Forms and
  interactive utilities live in separate client modules. No measured bundle
  size, performance score, or Core Web Vitals improvement is claimed.

## Backend and operations

- Seven review-order API handlers now produce bounded, structured completion
  telemetry and response correlation headers. Static operation names,
  generated UUIDs, and allowlisted failure categories/codes prevent customer
  identifiers or payloads from becoming log dimensions. No new database
  writes, paid telemetry service, or payment-state transition was added.
- Per-operation log budgets reserve space for server failures while limiting
  noisy polling and rejected requests. SQLite contention is classified without
  logging SQL, parameters, exception messages, or file paths.
- macOS deploy and worker locks now use kernel-owned descriptor locks rather
  than ownerless lock directories. Process exit, including a crash, releases
  the lock. Persistent kernel lock files must never be deleted to unlock a job.
- Worker runners use `exec` and preserve the held descriptor. Deploy holds its
  own lock in the operation shell, installs runners atomically, and restarts
  the selected previous release if runner installation fails after stopping
  services and before migration.
- Corrected the operations runbook's obsolete intake-only and EVM-only
  description to match immediate fixed-order checkout and supported non-EVM
  reviews at the same price.

## Dependency remediation

The initial production dependency audit reported nine advisories. Some apply
only to particular platforms or features; this is not evidence of exploitation.
The release pins Next.js and its matching lint configuration to 16.3.6 and
updates affected transitive dependency resolutions. The frozen install succeeds.

Primary advisory references for the Next.js update:

- [next/og ImageResponse advisory](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j)
- [AVIF image-optimizer advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4)
- [Windows request-processing advisory](https://github.com/advisories/GHSA-p293-qw3h-jr36)

The post-update `pnpm audit --prod` result reports zero vulnerabilities
across 230 production and optional dependencies. This is an audit snapshot,
not a guarantee that no security issue exists. The release workflow must
continue to audit the exact locked dependencies.

## Verification and launch boundary

Automated test suites, browser tests, and real payment/email actions were not
run, following the owner's instruction. No payment was submitted and no
customer or payment state was created for verification. Source review and
targeted lint were performed.

Recorded release checks:

- Frozen dependency installation: passed.
- Targeted ESLint for the changed TS/TSX modules and review API routes: passed.
- TypeScript compilation: passed. The initial build caught an optional
  workflow type in the new page; it was corrected before activation.
- Final standalone Next.js 16.3.6 production build: passed.
- Edited macOS shell scripts: syntax checks passed.
- Control-plane deployment configuration: passed, with public indexing
  disabled and legal-launch approval unchanged.
- Dedicated Ethereum payment evidence preflight: both configured independent
  endpoints reported chain ID 1 and agreeing finalized block evidence. This
  is endpoint readiness, not a completed customer payment.
- Pre-deployment SQLite backup: created and verified; 28 migration files
  recorded, no new schema migration added in this batch.
- Normal local deployment: activated release
  `20261006T162434Z-d5e72875faa2-5974`; web liveness, readiness, and backend
  health passed through the standard deployment script.
- Local address: `http://localhost:3000`.

The local release was built from the existing working tree. Its label includes
the base commit identifier, not a claim that the working changes are committed.
Before AWS packaging, review and commit the intended source and use the
clean-source and immutable-image workflow in the production release checklist.

These improvements do not prove production-scale capacity or high availability.
The budget deployment remains a single-host profile. Keep its legal approval,
payment-provider quorum, email delivery, administrator identity, domain/TLS,
private delivery storage, restore evidence, and monitoring launch gates in
the existing production release checklist. Public indexing and paid checkout
must not be enabled by bypassing those controls.
