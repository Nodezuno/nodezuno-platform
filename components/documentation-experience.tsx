"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { reviewPriceLabels } from "@/lib/review-policy";
import styles from "./documentation-experience.module.css";

const navigationGroups = [
  {
    label: "Start",
    items: [
      ["Service overview", "docs-overview"],
      ["Who this is for", "docs-icp"],
      ["What you need to provide", "docs-prerequisites"],
      ["Review timeline", "docs-timeline"],
    ],
  },
  {
    label: "Prepare",
    items: [
      ["Submit a request", "docs-intake"],
      ["Files and release details", "docs-artifacts"],
      ["Audited version and planned upgrade", "docs-baselines"],
      ["Finalize the review scope", "docs-freeze"],
    ],
  },
  {
    label: "Review",
    items: [
      ["What Nodezuno does", "docs-workflow"],
      ["Reproducible checks", "docs-checks"],
      ["Testing against chain state", "docs-simulation"],
      ["Reviewer sign-off", "docs-human-review"],
    ],
  },
  {
    label: "Decide",
    items: [
      ["What you receive", "docs-evidence"],
      ["Understanding the recommendation", "docs-decision"],
      ["How AI is used", "docs-ai"],
      ["Data handling and security", "docs-security"],
      ["What the review cannot guarantee", "docs-limitations"],
      ["Price and common questions", "docs-pricing"],
    ],
  },
] as const;

const artifactManifestExample = [
  "engagement: ua-2026-0042",
  "network: ethereum-mainnet",
  "forkBlock: 24192000",
  "baseline:",
  "  repository: protocol/contracts",
  "  commit: 7f3b...91a2",
  "  auditReport: audit-final.pdf",
  "proposed:",
  "  commit: c42a...0d11",
  "  governancePayload: proposal-118.json",
  "targets:",
  "  - proxy: 0x1234...abcd",
  "    implementation: 0x9876...ef01",
  "invariants:",
  "  - assets >= liabilities",
  "  - only governance can upgrade",
  "  - withdrawals preserve user balances",
].join("\n");

const forkReviewExample = [
  "export REVIEW_RPC_URL=\"https://your-archive-rpc.example\"",
  "export FORK_BLOCK=24192000",
  "",
  "forge test \\",
  "  --fork-url \"$REVIEW_RPC_URL\" \\",
  "  --fork-block-number \"$FORK_BLOCK\" \\",
  "  --match-path \"test/upgrade-assurance/**/*.t.sol\" \\",
  "  -vvv",
].join("\n");

const decisionRecordExample = [
  "{",
  "  \"engagement\": \"ua-2026-0042\",",
  "  \"releaseDigest\": \"sha256:4c7f...9b2e\",",
  "  \"decision\": \"Hold\",",
  "  \"conditions\": [",
  "    \"Remove the deployer EOA from UPGRADER_ROLE\",",
  "    \"Re-run UA-INV-007 against the frozen fork\"",
  "  ],",
  "  \"reviewer\": \"Named human reviewer\",",
  "  \"validForExactArtifactsOnly\": true",
  "}",
].join("\n");

function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copyStatus, setCopyStatus] = useState<
    "idle" | "copied" | "error"
  >("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("idle"), 1800);
    } catch {
      setCopyStatus("error");
      window.setTimeout(() => setCopyStatus("idle"), 3000);
    }
  }

  return (
    <div className="docs-code">
      <div>
        <span>{label}</span>
        <div className="copy-action">
          <span
            aria-live="polite"
            className={
              copyStatus === "error"
                ? "copy-feedback copy-feedback-error"
                : "copy-feedback"
            }
          >
            {copyStatus === "copied"
              ? "Copied to clipboard"
              : copyStatus === "error"
                ? "Copy failed. Select the text below."
                : ""}
          </span>
          <button onClick={copy} type="button">
            {copyStatus === "copied"
              ? "Copied"
              : copyStatus === "error"
                ? "Try again"
                : "Copy"}
          </button>
        </div>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

const faq = [
  [
    "Is this another smart contract audit?",
    "No. The Nodezuno EVM upgrade review starts from an audited version and focuses on the exact release you plan to deploy. It examines code, storage, roles, configuration, governance calldata, dependencies, historical state, and the protocol rules that must continue to hold. It does not replace a full audit of a new or materially unaudited system.",
  ],
  [
    "When does the standard five-business-day clock start?",
    "For the standard EVM review, the target window begins after scope acceptance, payment under the order, finalization of the code and release files, and confirmation that all required inputs work. Time spent waiting for missing inputs, access, or client decisions is outside the review window.",
  ],
  [
    "Can Nodezuno review private repositories?",
    "A private repository may be accepted through a restricted, least-privilege channel defined in the written scope. Do not place source archives, secrets, private RPC credentials, exploit material, or customer data in the public intake form.",
  ],
  [
    "Does Proceed guarantee that the upgrade is safe?",
    "No. Proceed means no release blocker was reproduced within the frozen scope and the required evidence completed. It is not a warranty, certification, legal opinion, or proof that no vulnerability exists.",
  ],
  [
    "Who makes the final decision?",
    "A named Nodezuno reviewer signs the Proceed, Remediate, or Hold recommendation. The client remains responsible for governance, signing, deployment, monitoring, rollback, and every production action.",
  ],
  [
    "What happens if the release changes during review?",
    "Any change to source, compiler settings, linked libraries, addresses, payload, configuration, target chain, or execution plan can place the release outside the agreed scope. Nodezuno will either confirm a revised scope or state that the existing recommendation does not cover the change.",
  ],
  [
    "Is remediation included?",
    "The published opening scope includes one review of an agreed fix set. This pass checks agreed corrections against the original finding. It is not a new review of unrelated changes.",
  ],
  [
    "Does Nodezuno review non-EVM systems?",
    `Yes. Every supported non-EVM review has the same ${reviewPriceLabels.total} price, ${reviewPriceLabels.deposit} deposit, and ${reviewPriceLabels.balance} balance as an EVM review. Submit your upgrade details to create the fixed service order and pay without waiting for approval. Preparation requirements and the completion estimate are confirmed at kickoff. The five-business-day target remains specific to the standard EVM scope.`,
  ],
  [
    "Can the review cover several chains or upgrade batches?",
    `No. One ${reviewPriceLabels.total} engagement covers one frozen upgrade batch on one network. Additional networks, release actions, or materially different states require another ${reviewPriceLabels.total} service order. Non-EVM completion estimates are confirmed at kickoff.`,
  ],
] as const;

export function DocumentationExperience() {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredNavigation = useMemo(
    () =>
      navigationGroups
        .map((group) => ({
          ...group,
          items: group.items.filter(([label]) =>
            label.toLowerCase().includes(normalizedQuery),
          ),
        }))
        .filter((group) => group.items.length > 0),
    [normalizedQuery],
  );
  const filteredSectionCount = filteredNavigation.reduce(
    (count, group) => count + group.items.length,
    0,
  );

  return (
    <section className={`${styles.page} docs-experience`} aria-label="Nodezuno documentation">
      <header className={`${styles.heading} docs-page-heading`}>
        <nav aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><span>Documentation</span></nav>
        <span>PREPARATION & DELIVERY</span>
        <h1>EVM preparation guide.</h1>
        <p>The files, release details, and decisions needed for an EVM upgrade review. Non-EVM reviews receive preparation instructions for their selected ecosystem at kickoff.</p>
      </header>
      <div className={`${styles.toolbar} docs-toolbar`}>
        <div>
          <span className="docs-live-dot" aria-hidden="true" />
          <strong>Guide contents</strong>
          <small className={styles.sectionCount} aria-live="polite">{filteredSectionCount} sections</small>
        </div>
        <label>
          <span className="sr-only">Filter documentation navigation</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a section"
            type="search"
            value={query}
          />
          <span aria-hidden="true">⌕</span>
        </label>
        <Link href="/whitepaper">
          Technical whitepaper <span aria-hidden="true">↗</span>
        </Link>
      </div>

      <div className={`${styles.layout} docs-layout`}>
        <aside className={`${styles.sidebar} docs-sidebar docs-sidebar-desktop`} aria-label="On this page">
          {filteredNavigation.length ? (
            filteredNavigation.map((group) => (
              <div className="docs-nav-group" key={group.label}>
                <strong>{group.label}</strong>
                {group.items.map(([label, id]) => (
                  <a href={`#${id}`} key={id}>
                    {label}
                  </a>
                ))}
              </div>
            ))
          ) : (
            <p className="docs-no-match">
              No section matches &quot;{query}&quot;. Try scope, files,
              evidence, security, or pricing.
            </p>
          )}
        </aside>

        <details className={`${styles.mobileContents} docs-sidebar-mobile`}>
          <summary>
            <span>On this page</span>
            <strong>{filteredSectionCount} sections</strong>
            <i aria-hidden="true" />
          </summary>
          <nav aria-label="Documentation sections">
            {filteredNavigation.length ? (
              filteredNavigation.map((group) => (
                <div key={group.label}>
                  <strong>{group.label}</strong>
                  {group.items.map(([label, id]) => (
                    <a href={"#" + id} key={id} onClick={(event) => {
                      const contents = event.currentTarget.closest("details");
                      if (contents) contents.open = false;
                    }}>{label}</a>
                  ))}
                </div>
              ))
            ) : (
              <p>No section matches &quot;{query}&quot;.</p>
            )}
          </nav>
        </details>

        <article className={`${styles.article} docs-article`}>
          <section id="docs-overview">
            <span className="docs-section-index">01 / SERVICE OVERVIEW</span>
            <h2>Prepare the release files.</h2>
            <div className="docs-before-start">
              <h3>Before you start</h3>
              <ul>
                <li>Prior audit report and the exact reviewed version</li>
                <li>Stable release candidate and reproducible build instructions</li>
                <li>Affected contracts, addresses, storage changes, and dependencies</li>
                <li>Planned deployment or governance action and expected results</li>
                <li>Existing tests, known risks, and one available technical contact</li>
              </ul>
            </div>
            <p className="docs-lede">
              Use this guide to prepare the standard EVM review, understand its
              five-business-day target, and see what the final report includes.
              Nodezuno compares the planned upgrade with the audited version,
              tests it against fixed onchain state, and requires a named reviewer
              to sign the recommendation. This guide, its checklist, and the
              current whitepaper are EVM-specific. Non-EVM reviews use the same{" "}
              {reviewPriceLabels.total} order and receive chain-specific preparation requirements
              during kickoff after Sanjay has manually checked the scheduling payment.
            </p>
            <div className="docs-maturity-grid">
              <div>
                <span className="docs-state docs-state-live">Input</span>
                <h3>Frozen release</h3>
                <p>
                  Exact commits, compiler settings, deployed addresses,
                  payloads, configuration, audit baseline, and intended state.
                </p>
              </div>
              <div>
                <span className="docs-state docs-state-preview">Method</span>
                <h3>Reproducible review</h3>
                <p>
                  Compare, decode, test against chain state, check financial and
                  protocol rules, reproduce findings, and complete human review.
                </p>
              </div>
              <div>
                <span className="docs-state docs-state-proposed">Output</span>
                <h3>Bounded decision</h3>
                <p>
                  A Proceed, Remediate, or Hold recommendation plus source-bound
                  evidence, residual risks, and explicit limitations.
                </p>
              </div>
            </div>
            <div className="docs-callout docs-callout-important">
              <strong>It is not a safety guarantee.</strong>
              <p>
                The decision applies only to the listed artifact digests,
                network, fork block, payload, configuration, and review scope.
                It does not certify the protocol or prove the absence of bugs.
              </p>
            </div>
          </section>

          <section id="docs-icp">
            <span className="docs-section-index">02 / IDEAL CUSTOMER PROFILE</span>
            <h2>Built for teams that already take security seriously.</h2>
            <p>
              The strongest fit is a protocol, stablecoin, bridge, lending,
              exchange, custody, tokenization, or onchain-finance team with a
              previously audited EVM system and a material production change.
              A technical owner and a release decision-maker must be available
              during the review window.
            </p>
            <div className="docs-rule-grid">
              <div>
                <strong>Strong fit</strong>
                <p>
                  Proxy implementation changes, diamond cuts, governance
                  proposals, role changes, oracle migrations, bridge adapters,
                  token logic, integrations, and risk-parameter updates.
                </p>
              </div>
              <div>
                <strong>Required maturity</strong>
                <p>
                  An audit or equivalent independent review exists for the
                  baseline, builds are reproducible, contracts are identifiable,
                  and business invariants can be stated precisely.
                </p>
              </div>
              <div>
                <strong>Decision context</strong>
                <p>
                  The upgrade has a planned execution path, target network,
                  owners, governance or signer process, monitoring plan, and
                  enough lead time to resolve a Hold or Remediate outcome.
                </p>
              </div>
              <div>
                <strong>Not a fit</strong>
                <p>
                  First audits, emergency incident response, active exploits,
                  unaudited rewrites, key custody, legal opinions, and requests
                  for guaranteed approval are not a fit. Non-EVM work is accepted
                  only for selected custom reviews.
                </p>
              </div>
            </div>
          </section>

          <section id="docs-prerequisites">
            <span className="docs-section-index">03 / PREREQUISITES</span>
            <h2>The standard five-day target depends on reviewable inputs.</h2>
            <ul className="docs-check-list">
              <li>A final audited baseline commit and its audit report.</li>
              <li>A frozen proposed commit with reproducible build instructions.</li>
              <li>Compiler, optimizer, EVM target, library, and deployment settings.</li>
              <li>Target chain, proxy and implementation addresses, and fork block.</li>
              <li>Exact deployment transaction or governance proposal payload.</li>
              <li>Current and proposed configuration, roles, owners, and timelocks.</li>
              <li>Relevant ABI, storage layout, deployment records, and verified bytecode.</li>
              <li>Existing tests plus protocol-level safety and business invariants.</li>
              <li>A read-only archive RPC path suitable for a pinned fork.</li>
              <li>Named engineering and security contacts able to answer questions.</li>
            </ul>
            <div className="docs-callout docs-callout-important">
              <strong>Incomplete artifacts pause the work.</strong>
              <p>
                Payment activates the service order, but all required artifacts
                must be ready before the delivery clock begins. Missing source, unreproducible bytecode,
                an undecodable payload, or an unstable release candidate may
                pause the work or require a new service order.
              </p>
            </div>
          </section>

          <section id="docs-timeline">
            <span className="docs-section-index">04 / ENGAGEMENT TIMELINE</span>
            <h2>Standard EVM target: five business days, with explicit gates.</h2>
            <ol className="docs-steps">
              {[
                [
                  "Day 0: accept and freeze",
                  "Confirm payment and written scope, validate prerequisites, hash artifacts, select the fork block, and identify review owners.",
                ],
                [
                  "Day 1: map the release",
                  "Rebuild both revisions, compute semantic and bytecode deltas, decode payloads, and map storage, roles, configuration, and dependencies.",
                ],
                [
                  "Days 2 and 3: execute evidence",
                  "Apply the release on a pinned fork, replay relevant behavior, run deterministic checks and invariants, and investigate divergent state.",
                ],
                [
                  "Day 4: reproduce and challenge",
                  "A human reviewer tests material hypotheses, validates preconditions, challenges severity, and records uncertainty and coverage gaps.",
                ],
                [
                  "Day 5: decide and deliver",
                  "Complete evidence review, assign Proceed, Remediate, or Hold, sign the recommendation, and deliver the evidence bundle and next actions.",
                ],
              ].map(([title, body], index) => (
                <li key={title}>
                  <span>{index}</span>
                  <div>
                    <strong>{title}</strong>
                    <p>{body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="docs-fine-print">
              Client wait time, scope changes, inaccessible infrastructure, and
              remediation work are not counted inside the standard
              five-business-day review window unless the written order says
              otherwise. Non-EVM completion estimates are confirmed during kickoff
              once the required materials are available.
            </p>
          </section>

          <section id="docs-intake">
            <span className="docs-section-index">05 / INTAKE</span>
            <h2>Start with metadata, then establish a restricted channel.</h2>
            <p>
              The public intake asks what is changing, where it will execute,
              when the decision is needed, which audit establishes the
              baseline, and which value-preserving behaviors matter. It is not
              a file-transfer or vulnerability-reporting channel.
            </p>
            <div className="docs-checklist-grid">
              {[
                "Protocol and technical owner",
                "Target EVM network",
                "Upgrade mechanism",
                "Baseline audit and commit",
                "Proposed commit or proposal link",
                "Expected execution date",
                "Affected contracts and integrations",
                "Critical invariants and known concerns",
              ].map((item, index) => (
                <div key={item}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{item}</p>
                </div>
              ))}
            </div>
            <div className="docs-callout docs-callout-important">
              <strong>Never submit secrets through public intake.</strong>
              <p>
                Do not send private keys, seed phrases, signing material,
                production credentials, private RPC URLs, customer records,
                undisclosed exploit details, or private source archives.
              </p>
              <Link href="/review/start">
                Open the scoping form <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </section>

          <section id="docs-artifacts">
            <span className="docs-section-index">06 / ARTIFACT MANIFEST</span>
            <h2>Every conclusion binds to exact inputs.</h2>
            <p>
              The manifest names the baseline, proposal, deployed contracts,
              target network state, execution plan, toolchain, invariants, and
              owners. Nodezuno records content digests for received artifacts.
              A digest change creates a different review object.
            </p>
            <CodeBlock code={artifactManifestExample} label="Illustrative scope manifest" />
            <p className="docs-fine-print">
              The example is descriptive. The accepted manifest and written
              order, not this documentation, control the actual engagement.
            </p>
          </section>

          <section id="docs-baselines">
            <span className="docs-section-index">07 / BASELINE + PROPOSAL</span>
            <h2>Compare deployed truth, reviewed intent, and proposed execution.</h2>
            <div className="docs-plane-grid">
              <div>
                <span>01</span>
                <h3>Audited baseline</h3>
                <p>
                  Reviewed source revision, audit report and disposition,
                  compiler settings, storage layout, deployment metadata, and
                  accepted known issues.
                </p>
              </div>
              <div>
                <span>02</span>
                <h3>Production state</h3>
                <p>
                  Proxy and implementation addresses, bytecode, roles,
                  balances, configuration, dependencies, and pinned chain
                  state at the agreed fork block.
                </p>
              </div>
              <div>
                <span>03</span>
                <h3>Proposed release</h3>
                <p>
                  Source and bytecode, linked libraries, initializers,
                  governance calldata, target addresses, values, ordering,
                  postconditions, and intended operating changes.
                </p>
              </div>
            </div>
            <div className="docs-callout">
              <strong>Audit disposition matters.</strong>
              <p>
                Unresolved findings in the baseline are carried into the risk
                record. Nodezuno does not silently treat a prior report as proof
                that deployed bytecode, configuration, or state matches it.
              </p>
            </div>
          </section>

          <section id="docs-freeze">
            <span className="docs-section-index">08 / SCOPE FREEZE</span>
            <h2>Freeze before analysis, invalidate on change.</h2>
            <p>
              Scope acceptance identifies included repositories, directories,
              contracts, addresses, networks, payloads, invariants, external
              dependencies, and exclusions. The freeze also records artifact
              hashes, build environment, fork block, intended execution order,
              and the client contacts authorized to answer questions.
            </p>
            <div className="docs-rule-grid">
              <div>
                <strong>In-scope change</strong>
                <p>
                  A correction directly tied to a reported condition may enter
                  an agreed verification pass after the primary decision.
                </p>
              </div>
              <div>
                <strong>Scope-breaking change</strong>
                <p>
                  New features, new targets, changed compiler settings,
                  reordered calls, different parameters, or a different fork
                  state require a new freeze and may require a new order.
                </p>
              </div>
            </div>
          </section>

          <section id="docs-workflow">
            <span className="docs-section-index">09 / REVIEW WORKFLOW</span>
            <h2>Diff, decode, execute, challenge, decide.</h2>
            <ol className="docs-steps">
              {[
                [
                  "Diff the release",
                  "Compare source, compiler output, bytecode, ABI, selectors, events, errors, storage, inheritance, libraries, dependencies, and configuration.",
                ],
                [
                  "Decode the action",
                  "Resolve every target, selector, argument, value transfer, role transition, upgrade call, initializer, batch order, and expected postcondition.",
                ],
                [
                  "Simulate on a fork",
                  "Recreate the pinned production state, execute the exact release path, record state changes and traces, and test failure and rollback assumptions.",
                ],
                [
                  "Check invariants",
                  "Run agreed safety, solvency, authorization, accounting, uniqueness, price, liveness, and integration properties before and after the release.",
                ],
                [
                  "Validate as a human",
                  "Reproduce material findings, challenge exploit preconditions, adjudicate severity, document uncertainty, and own the final recommendation.",
                ],
              ].map(([title, body], index) => (
                <li key={title}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{title}</strong>
                    <p>{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section id="docs-checks">
            <span className="docs-section-index">10 / DETERMINISTIC CHECKS</span>
            <h2>Use repeatable checks before interpretive judgment.</h2>
            <div className="docs-rule-grid">
              {[
                [
                  "Build and bytecode",
                  "Reproduce compiler output, normalize metadata, identify linked libraries and immutables, and compare expected runtime bytecode with deployed code.",
                ],
                [
                  "Interface surface",
                  "Compare ABI functions, selectors, events, custom errors, payable behavior, fallback paths, and externally reachable calls.",
                ],
                [
                  "Storage safety",
                  "Compare slots, types, inheritance order, packing, gaps, namespaces, initializers, and proxy-specific storage conventions.",
                ],
                [
                  "Authority graph",
                  "Resolve owners, roles, admins, timelocks, guardians, signers, upgrade rights, pause rights, and reachable privileged actions.",
                ],
                [
                  "Payload integrity",
                  "Decode targets, calldata, values, salt, predecessor, delay, ordering, delegate calls, diamond cuts, beacons, and initializer execution.",
                ],
                [
                  "State and behavior",
                  "Compare balances, liabilities, supply, configuration, events, reverts, gas-sensitive paths, dependency responses, and protocol invariants.",
                ],
              ].map(([title, body]) => (
                <div key={title}>
                  <strong>{title}</strong>
                  <p>{body}</p>
                </div>
              ))}
            </div>
            <p className="docs-fine-print">
              Applicability depends on the upgrade pattern and accepted scope.
              A check marked not applicable includes a reason; it is not
              silently counted as a pass.
            </p>
          </section>

          <section id="docs-simulation">
            <span className="docs-section-index">11 / FORK SIMULATION</span>
            <h2>Execute the proposed release against pinned historical state.</h2>
            <p>
              The fork manifest records chain ID, block number and hash, RPC
              source class, client and tool versions, account impersonation,
              balance modifications, environment variables, test seeds, and
              every deviation from public chain state. The exact deployment or
              governance sequence runs before post-upgrade behavior is tested.
            </p>
            <CodeBlock code={forkReviewExample} label="Illustrative Foundry replay" />
            <ul className="docs-check-list">
              <li>Execute the exact call order, targets, values, and calldata.</li>
              <li>Assert expected implementation, owner, role, and config state.</li>
              <li>Replay representative historical actions and known edge cases.</li>
              <li>Generate adversarial sequences within agreed threat boundaries.</li>
              <li>Record traces and state deltas for failed properties.</li>
              <li>Distinguish fork artifacts from reproducible protocol behavior.</li>
            </ul>
            <div className="docs-callout docs-callout-important">
              <strong>A fork is evidence, not production.</strong>
              <p>
                It cannot reproduce future ordering, private order flow,
                validator behavior, unknown integrations, unavailable offchain
                systems, changed oracle responses, or every adversarial state.
              </p>
            </div>
          </section>

          <section id="docs-human-review">
            <span className="docs-section-index">12 / HUMAN VALIDATION</span>
            <h2>A named reviewer is accountable for material conclusions.</h2>
            <p>
              Automated output becomes a review finding only after a human
              connects it to the frozen release, verifies the affected state,
              reproduces or substantiates the behavior, evaluates realistic
              preconditions and impact, and records contrary evidence.
            </p>
            <div className="docs-checklist-grid">
              {[
                "Confirm scope and threat model",
                "Review every material delta",
                "Reproduce blocking behavior",
                "Challenge severity and feasibility",
                "Separate fact from hypothesis",
                "Record uncertainty and exclusions",
                "Validate remediation evidence",
                "Sign the release recommendation",
              ].map((item, index) => (
                <div key={item}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="docs-evidence">
            <span className="docs-section-index">13 / EVIDENCE BUNDLE</span>
            <h2>Deliver enough context to inspect and reproduce the decision.</h2>
            <div className="docs-endpoint-list">
              {[
                ["01", "Scope manifest", "Included artifacts, digests, addresses, network, fork state, assumptions, owners, and exclusions."],
                ["02", "Release delta", "Code, bytecode, interface, storage, authority, configuration, dependency, and payload changes."],
                ["03", "Execution record", "Fork manifest, commands, tool versions, test seeds, traces, state deltas, raw-output digests, and reproduction notes."],
                ["04", "Invariant register", "Property definition, rationale, preconditions, coverage, outcome, and links to the supporting run."],
                ["05", "Finding records", "Claim, affected artifact, evidence, impact, feasibility, severity rationale, uncertainty, and remediation status."],
                ["06", "Decision memorandum", "Proceed, Remediate, or Hold, mandatory conditions, residual risks, limitations, validity boundary, reviewer, and timestamp."],
                ["07", "Verification addendum", "When scoped, the exact remediation revision and result of the bounded verification pass."],
              ].map(([index, title, body]) => (
                <div key={title}>
                  <span className="docs-method">{index}</span>
                  <div>
                    <strong>{title}</strong>
                    <p>{body}</p>
                  </div>
                  <small>Evidence</small>
                </div>
              ))}
            </div>
            <p>
              Delivery is human-readable and may include machine-readable
              manifests, scripts, or regression tests when the scope,
              licensing, and client environment permit. Evidence may be
              redacted to avoid redistributing secrets or proprietary code.
            </p>
          </section>

          <section id="docs-decision">
            <span className="docs-section-index">
              14 / Proceed, Remediate, Hold
            </span>
            <h2>One recommendation, three meanings.</h2>
            <div className="docs-maturity-grid">
              <div>
                <span className="docs-state docs-state-live">Proceed</span>
                <h3>No blocker reproduced</h3>
                <p>
                  Required review evidence completed and no blocker was
                  reproduced in the frozen scope. Residual risks and all
                  limitations remain part of the recommendation.
                </p>
              </div>
              <div>
                <span className="docs-state docs-state-proposed">Remediate</span>
                <h3>Correct before release</h3>
                <p>
                  A release blocker or material defect is reproduced or
                  sufficiently substantiated within scope. The recommendation
                  identifies evidence, preconditions, and required correction.
                </p>
              </div>
              <div>
                <span className="docs-state docs-state-preview">Hold</span>
                <h3>Evidence or conditions remain</h3>
                <p>
                  Material uncertainty, missing evidence, a coverage gap, or a
                  release condition prevents Proceed. The recommendation lists
                  what must be resolved before another decision.
                </p>
              </div>
            </div>
            <CodeBlock code={decisionRecordExample} label="Illustrative decision record" />
            <div className="docs-callout docs-callout-important">
              <strong>Client authority does not transfer.</strong>
              <p>
                Nodezuno gives an independent recommendation. The protocol,
                governance body, multisig, deployer, or other authorized client
                party retains the final decision and every production action.
              </p>
            </div>
          </section>

          <section id="docs-ai">
            <span className="docs-section-index">15 / AI BOUNDARY</span>
            <h2>AI expands the search. It does not own the verdict.</h2>
            <div className="docs-rule-grid">
              <div>
                <strong>Permitted assistance</strong>
                <p>
                  Summarize diffs, propose hypotheses and invariants, cluster
                  traces, explain tool output, identify review leads, and draft
                  non-final evidence text for human verification.
                </p>
              </div>
              <div>
                <strong>Prohibited authority</strong>
                <p>
                  AI cannot change scope, access production keys, submit
                  transactions, mark its own output verified, assign the final
                  status, sign a decision, or claim that a release is safe.
                </p>
              </div>
            </div>
            <ul className="docs-check-list">
              <li>Repository text, comments, calldata, logs, and reports are treated as untrusted model input.</li>
              <li>Material claims require deterministic or independently inspected evidence.</li>
              <li>Model names, versions, permissions, and data boundaries are recorded when material to the review.</li>
              <li>Use of external model providers must match the written data terms for the engagement.</li>
              <li>When model use is not permitted, the affected AI-assisted workflow is disabled rather than silently rerouted.</li>
            </ul>
          </section>

          <section id="docs-security">
            <span className="docs-section-index">16 / SECURITY + DATA POLICY</span>
            <h2>Minimize access, data, authority, and retention.</h2>
            <p>
              The engagement order defines the approved transfer channel,
              authorized reviewers, subprocessors if any, permitted analysis
              environments, retention window, deletion or return process, and
              disclosure contacts. Nodezuno does not ask for production signing
              authority or custody as part of an EVM upgrade review.
            </p>
            <div className="docs-rule-grid">
              {[
                ["Access", "Prefer read-only, repository-scoped, time-bounded access. Separate source access from client production systems and signing infrastructure."],
                ["Secrets", "Do not provide private keys, seed phrases, wallet approvals, deployer credentials, cloud administrator access, or unrestricted production RPC credentials."],
                ["Data minimization", "Provide only code, configuration, state, traces, reports, and contacts needed for the agreed review. Remove unrelated customer and employee data."],
                ["Evidence handling", "Reference artifacts by digest, restrict raw access, redact delivery where necessary, and keep factual evidence separate from analyst notes and AI-generated leads."],
                ["Retention", "The written order states the review retention window and exceptions required for billing, disputes, law, or mutually approved regression work."],
                ["Disclosure", "Potential vulnerabilities move through the restricted engagement channel and named security contacts, not public forms, chat rooms, or public issue trackers."],
              ].map(([title, body]) => (
                <div key={title}>
                  <strong>{title}</strong>
                  <p>{body}</p>
                </div>
              ))}
            </div>
            <div className="docs-inline-links">
              <Link href="/security">Security overview</Link>
              <Link href="/legal/privacy">Privacy notice</Link>
            </div>
          </section>

          <section id="docs-limitations">
            <span className="docs-section-index">17 / LIMITATIONS</span>
            <h2>Know exactly what the review cannot establish.</h2>
            <ul className="docs-check-list">
              <li>It does not prove that no vulnerability or exploit exists.</li>
              <li>It does not replace a full audit of a new or materially unaudited system.</li>
              <li>It does not cover artifacts, addresses, payloads, configuration, or state outside the frozen scope.</li>
              <li>Fork behavior cannot perfectly reproduce production ordering, liquidity, or offchain dependencies.</li>
              <li>Third-party contracts and infrastructure are reviewed only to the depth named in scope.</li>
              <li>Formal verification, penetration testing, incident response, monitoring, and deployment operations are excluded unless separately agreed.</li>
              <li>Nodezuno does not provide legal, regulatory, accounting, investment, insurance, or tax advice.</li>
              <li>Nodezuno does not hold keys, approve governance, execute the upgrade, or operate the client&apos;s production response.</li>
              <li>Proceed, Remediate, and Hold are review recommendations, not certifications or warranties.</li>
              <li>New chain state or any release change can invalidate prior evidence.</li>
            </ul>
          </section>

          <section id="docs-pricing">
            <span className="docs-section-index">18 / PRICING + FAQ</span>
            <h2>Review the commercial terms before you start.</h2>
            <p>
              The pricing page is the public source for price, payment milestones,
              standard scope, taxes, fees, and work that requires another order.
              Your service order records the exact terms that apply to your release.
            </p>
            <div className="docs-inline-links">
              <Link href="/pricing">Review pricing</Link>
              <Link href="/security">Review security</Link>
            </div>
            <h3>Frequently asked questions</h3>
            <div className="docs-rule-grid">
              {faq.map(([question, answer]) => (
                <div key={question}>
                  <strong>{question}</strong>
                  <p>{answer}</p>
                </div>
              ))}
            </div>
            <div className="docs-callout">
              <strong>Scope before sending restricted material.</strong>
              <p>
                Begin with dates, public links, affected surfaces, and the
                baseline audit. After Sanjay manually checks the scheduling payment, Nodezuno provides the
                approved secure exchange process for private code or files.
              </p>
            </div>
          </section>
        </article>
      </div>
    </section>
  );
}
