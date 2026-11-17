# Production improvement execution record

Date: 2026-09-03.
Feedback source: `NODEZUNO_PRODUCTION_IMPROVEMENT_PLAN.md`, supplied by the owner.
Scope: first implementation batch plus a verified inventory of existing controls.
This is not a declaration that every item in the plan or every public-launch gate is complete.

## Business decisions preserved

The feedback's older EVM-only and manual-approval examples were not applied as new requirements. The current owner decisions remain:

- EVM and supported non-EVM reviews at the same USD 7,500 price;
- USD 3,750 scheduling deposit and USD 3,750 final balance;
- immediate fixed order creation from a valid bounded form, without manual approval;
- Ethereum Mainnet USDC or USDT only, paid directly to the fixed recipient;
- mandatory transaction hash and Telegram username;
- payment credited only from finalized matching Ethereum evidence;
- immutable payment confirmation plus a queued confirmation email;
- a prominent recipient address, with no copyable token-contract box;
- local/AWS deployment, with no external publication or cloud resource changes in this batch.

## Changed

### Source and release protection

- Added one shared source-path policy and tightened tracked-source rejection for secrets, keys, environment files, databases, runtime state, build output, archives, and Terraform state/plans/inputs.
- Limited example exemptions to exact approved templates. A filename ending in `.example` no longer bypasses every rule.
- Added a clean-commit-only source exporter. It archives Git objects, writes outside the repository, refuses overwrites, uses owner-only permissions, and emits a SHA-256 manifest. It uploads nothing.
- Expanded Docker ignore boundaries, including the native gateway build context.
- Disabled checkout credential persistence across workflows and implicit Docker build-record uploads. Kept SBOM/provenance, dependency gates, immutable action references, and digest deployments.
- Added workflow run ID to image tags so a new manual run of the same commit does not collide with an immutable ECR tag.

### Current offer and understandable wording

- Added `lib/review-policy.ts` for current minor-unit amounts, scope limits, network/release counts, delivery target, and derived labels.
- Connected order creation, validation, form controls, core public pricing copy, and OpenAPI constraints to that policy.
- Replaced confusing order-form copy and distinguished order submission, payment instructions, transfer submission, verification, and confirmation.
- Corrected the documentation map's EVM-only description and the standard EVM method's obsolete manual-approval wording.
- Added a canonical product/scope contract, API audience map, payment-state guide, runtime/capacity guide, and rendering-boundary explanation.
- Reduced the root README to a repository and operating entry point. Retained historical research documents and their existing archive labels rather than deleting unrelated work.

### Responsibility boundaries

- Extracted pure order input validation to `lib/server/reviews/input.ts`, retaining the original exported entry point and wire fields.
- Extracted browser order-request handling to `lib/client/review-order-request.ts`; the form retains interaction and focus state.
- Separated the private native-gateway OpenAPI operation, security scheme, and input/output schemas into `lib/api/internal.ts`. No new HTTP endpoint publishes that document.
- Moved shared Problem contracts into `lib/api/shared.ts`. The provider webhook is explicitly classified as provider-only; customer workspace/RPC beta compatibility contracts remain documented.
- Split five large detail experiences using SSR-enabled dynamic imports and stopped passing unused chain-directory data to unrelated pages.
- Corrected three homepage internal navigation anchors to use Next.js navigation.

### Operations

- Added an email pass scheduling budget so slow provider calls stop taking new work before monopolizing the shared worker lock. Existing leases, attempts, sealed payloads, idempotency, and delivery reconciliation remain authoritative.
- Added timestamps, event names, and durations to aggregate worker logging; no customer payloads or secret configuration are logged.
- Added database size, WAL size, and data-inode utilization to the AWS host collector. Collection failure does not masquerade as zero database size.
- Corrected migration documentation to SQL/checksum-ledger authority through 0027, documented the existing narrow 0002 legacy-ledger exception, and removed contradictory Drizzle-generation instructions.

## Behavior intentionally changed

- Public wording and module loading follow the changes above.
- The public OpenAPI document no longer includes the internal gateway contract.
- Email passes defer unclaimed rows when the scheduling reserve is reached.
- Release packaging rejects more unsafe paths and writes commit-bound exports only.
- A deployed updated AWS host bundle emits three additional custom metrics. Include their cost in the monitoring budget; no AWS resources were changed here.

## Behavior intentionally preserved

- Existing order prices, accepted terms text/version/hash, payment evidence, immutable confirmations, reconciliation cases, and outbox payloads.
- Same-origin enforcement, capability isolation, authentication, role checks, anti-abuse challenge, rate limits, replay protection, and idempotency.
- Ethereum chain/token/recipient/amount/finality/provider-agreement checks, worker leases, and transactional payment application.
- No browser-reported payment success, simulated receipts, private wallet key, or automatic treasury transfer.
- CSP nonce generation and root request-bound rendering. Making HTML static without a CSP redesign would weaken the existing boundary.
- The existing CI regression suites. Their internal-API reference assertions were updated for the contract split, but the suites were not run in this session.

## Configuration and migration impact

- No new application secret or database migration is required by this batch.
- The schema remains at 0027. No applied SQL migration was edited.
- Docker and native macOS worker packaging now include the shared review policy; the server-domain extraction is included by the existing recursive server copy.
- AWS workflow and host-collector changes take effect only after a reviewed deployment.
- No deployment, real payment submission, outgoing email, source upload, commit, credential rotation, or production-data mutation was performed in this batch.
- Existing modified and untracked source was preserved. The production release/export gate must remain closed until the full intended changes are reviewed and committed.

## Verification

- Static TypeScript compilation and the standalone Next.js production build passed during implementation.
- Targeted ESLint checks passed after correcting the three internal-link findings.
- Changed worker/export scripts passed Node syntax checks.
- Changed AWS/local shell scripts passed Bash syntax checks.
- `git diff --check` passed.
- Automated test suites, browser interaction tests, external email delivery, AWS deployment, backup recovery, payment transfers, and a content-level secret/history scan were not performed.

The final build/check outcome is reported with the handoff. A passing build is not a substitute for the external release evidence in [PRODUCTION_RELEASE_EVIDENCE.md](PRODUCTION_RELEASE_EVIDENCE.md).

## Feedback status and next work

| Item | Status after this batch | Remaining evidence or implementation |
| --- | --- | --- |
| PROD-001 Source hygiene | Implemented path/export protections | Content-level source/history secret review; reviewed clean commit; actual archive handoff |
| PROD-002 Scope contract | Shared policy and canonical guide implemented | Broader static copy review when policy changes; historical terms remain immutable |
| PROD-003 Payment terminology | Main order/payment wording corrected | Final human review of every public/legal surface |
| PROD-004 Document status | Canonical map and current contradictions corrected | Continue consolidating overlapping older runbooks without losing history |
| PROD-005 Product terminology | Canonical terminology recorded | Apply consistently during remaining module extraction |
| PROD-006 Public copy | Core form, price, and process copy improved | Full content/editorial pass remains |
| PROD-007 Information architecture | Existing grouped navigation preserved | Further navigation changes need a separate scoped decision; no redesign performed |
| PROD-008 Client surfaces | Initial module split and form request extraction | Server detail shell, payment/admin responsibility splits, runtime accessibility/navigation evidence |
| PROD-009 Dynamic rendering | Nonce dependency documented and preserved | Separate CSP-safe static rendering/cache design and runtime evidence |
| PROD-010 Shared content | Core price/scope/step facts centralized | Additional domain-specific content modules as remaining surfaces are split |
| PROD-011 API decomposition | Shared and internal contracts separated | Customer domain contracts remain a large file; move one domain at a time |
| PROD-012 API audiences | Internal operation removed from public contract; provider callback labeled | Continued inventory and privacy review when endpoints change |
| PROD-013 Backend contexts | Pure review-input boundary extracted | Database/workspace/RPC contexts still require incremental decomposition |
| PROD-014 Migration authority | Current authority and history documented | Fresh/upgrade/recovery evidence belongs to an approved release rehearsal |
| PROD-015 SQLite operation | Existing safeguards retained; capacity record and three collectors added | Write latency, busy-error aggregation, and observed capacity/recovery evidence |
| PROD-016 Payment state machine | Existing guarded transitions documented | A transition-code refactor is deferred until its security regression coverage can run |
| PROD-017 Observability | Worker envelope/duration and storage metrics improved | Route timing, lock-skip/error aggregation, tracing, and deployed alert evidence |
| PROD-018 Deployment | Rerun-safe tags, checkout and artifact hardening implemented | Approved clean-source release, content-level secret scan, external rollout and recovery evidence |

Recommended next engineering batch: extract customer API contracts by domain and move the static detail-page shell to server rendering, preserving nonce security and the existing interaction boundaries. Do not claim complete production readiness until the remaining implementation and launch evidence are resolved.

## Frontend restructure batch

Date: 2026-09-04.
Feedback source: `NODEZUNO_FRONTEND_RESTRUCTURE_REVIEW_FOR_CODEX.md`, supplied by the owner.

This batch reduced the public marketing surface to one clear offer without
changing the existing payment, identity, evidence, or deployment authority:

- rebuilt the homepage as six sections covering the offer, review areas,
  deliverables, process, fixed scope and price, trust boundary, FAQ, and one
  direct order action;
- replaced the large multi-product navigation with three direct routes plus
  compact Resources and Company menus, while preserving one-open-menu, outside
  click, Escape, focus restoration, focus trapping, and mobile scroll locking;
- consolidated duplicate product, process, scope, and trust pages through
  permanent redirects to canonical anchored sections and removed redirects from
  the sitemap;
- clarified equal USD 7,500 pricing for supported EVM and non-EVM reviews,
  direct order creation, payment verification, readiness, scope checks, and
  reviewer availability;
- simplified the pricing and order-start experiences, added concise scope field
  guidance, and kept payment instructions out of the first intake screen;
- converted the whitepaper to a document-first heading structure, added a
  collapsed mobile contents panel, enlarged reading text, updated the Foundry
  reference, and added external-link accessibility labels;
- added a collapsed mobile documentation contents panel plus a before-start
  checklist and reduced duplicate pricing prose;
- shortened the About page while preserving Sanjay Sudagani's personal founder
  story and operating principles;
- removed the plain Node release crawler's direct TypeScript import, seeded it
  from the deployed canonical sitemap, and made internal redirects visible;
- added a bounded, allowlisted external-reference checker and a reusable
  post-deployment public-site release workflow; and
- made control-plane preflight output explicitly report disabled, blocked,
  invalid, or enabled public-indexing state while preserving the legal launch
  gate.

No deployment, external publication, payment, email, or production-data change
was performed in this batch. Automated test suites and browser checks were not
run, following the owner's instruction. The final lint, type, and production
build outcome is reported in the task handoff.

## October launch-hardening batch

Date: 2026-10-06.

The homepage, core service pages, pricing, and account entry now use clearer,
more focused presentation. Static page shells have moved out of the client
graph; the old homepage demo was removed. Review APIs gained privacy-safe
bounded diagnostics, the status UI gained failure and retry handling, and
native deployment/workers use kernel-managed locks with crash-safe release.
Published production dependency advisories were remediated; the final
production audit reports zero vulnerabilities. Frozen installation, targeted
lint, TypeScript, shell syntax, final production build, deployment preflights,
database-backup verification, and local health checks passed.

The standard local release is running at `http://localhost:3000`.
Automated suites and browser tests were not run. AWS capacity, external
delivery, and public-launch approval were not established by this local build.
See the [full implementation and evidence record](operations/LAUNCH_HARDENING_2026_10_06.md).
