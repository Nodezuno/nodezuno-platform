"use client";

import Link from "next/link";
import styles from "./whitepaper-experience.module.css";

const chapters = [
  ["Abstract", "wp-abstract"],
  ["Definition and objectives", "wp-definition"],
  ["Threat model", "wp-threat-model"],
  ["Trust and authority", "wp-trust"],
  ["Review architecture", "wp-architecture"],
  ["Artifact identity", "wp-artifacts"],
  ["Evidence model", "wp-evidence"],
  ["Deterministic checks", "wp-checks"],
  ["Fork execution and invariants", "wp-execution"],
  ["AI boundary", "wp-ai"],
  ["Human review", "wp-human"],
  ["Assurance levels and decisions", "wp-assurance"],
  ["Evidence bundle", "wp-delivery"],
  ["Security and data handling", "wp-data"],
  ["Limitations", "wp-limitations"],
  ["Roadmap and references", "wp-roadmap"],
] as const;

const reviewLifecycle = [
  {
    label: "Accept",
    title: "Validate prerequisites",
    body: "Confirm the audited baseline, proposed release, target state, exact execution plan, owners, invariants, payment, and written scope.",
  },
  {
    label: "Freeze",
    title: "Bind the artifacts",
    body: "Record content digests, build settings, deployed addresses, payload bytes, configuration, fork block, exclusions, and review identities.",
  },
  {
    label: "Analyze",
    title: "Diff and decode",
    body: "Normalize source and compiler outputs, map the semantic change surface, decode every privileged action, and identify affected trust boundaries.",
  },
  {
    label: "Execute",
    title: "Simulate and test",
    body: "Apply the exact release on a pinned fork, replay relevant behavior, run deterministic checks and invariants, and preserve traces and state deltas.",
  },
  {
    label: "Challenge",
    title: "Validate as a human",
    body: "Reproduce material findings, test preconditions, challenge severity, distinguish fact from hypothesis, and record uncertainty.",
  },
  {
    label: "Decide",
    title: "Issue a recommendation",
    body: "A named reviewer signs Proceed, Remediate, or Hold for the exact frozen scope and delivers evidence, residual risks, and next actions.",
  },
];

const threatClasses = [
  [
    "Artifact substitution",
    "The reviewed source, compiler settings, linked libraries, bytecode, addresses, configuration, or payload do not match what will execute.",
  ],
  [
    "Storage corruption",
    "A layout, inheritance, packing, namespace, gap, initializer, beacon, or diamond change mutates existing state incorrectly.",
  ],
  [
    "Authority expansion",
    "Owners, roles, timelocks, guardians, signers, delegates, or upgrade rights gain unintended reach or lose required separation.",
  ],
  [
    "Payload ambiguity",
    "A batch targets the wrong address, selector, value, order, chain, initializer, dependency, or postcondition.",
  ],
  [
    "Economic invariant failure",
    "The release breaks solvency, asset conservation, supply accounting, price bounds, fee rules, message uniqueness, or user entitlements.",
  ],
  [
    "Integration mismatch",
    "An oracle, bridge, token, hook, callback, sequencer, router, or third-party contract behaves differently from the release assumptions.",
  ],
  [
    "Operational sequence failure",
    "Partial execution, delay, front-running, reordering, failed initialization, pause state, or recovery action leaves the system unsafe.",
  ],
  [
    "Analysis corruption",
    "A faulty tool, stale fork, incomplete RPC, untrusted repository text, prompt injection, or reviewer mistake produces a false conclusion.",
  ],
] as const;

const assuranceLevels = [
  {
    level: "L0",
    name: "Artifact-bound",
    meaning:
      "The reviewed inputs, target network state, tool environment, execution plan, owners, and exclusions are identified and content-bound.",
    doesNotMean:
      "No structural or behavioral safety conclusion has been established.",
  },
  {
    level: "L1",
    name: "Structurally analyzed",
    meaning:
      "Applicable build, bytecode, interface, storage, authority, configuration, dependency, and payload checks completed against bound artifacts.",
    doesNotMean:
      "The release has not necessarily executed successfully against representative production state.",
  },
  {
    level: "L2",
    name: "Fork-executed",
    meaning:
      "The exact release path and applicable invariants completed on a pinned fork with reproducible commands, traces, and state deltas.",
    doesNotMean:
      "A fork cannot reproduce every production condition, future state, integration, or adversarial sequence.",
  },
  {
    level: "L3",
    name: "Human-adjudicated",
    meaning:
      "A named reviewer validated material evidence, challenged findings and uncertainty, and signed the scoped release recommendation.",
    doesNotMean:
      "It is not a warranty, certification, formal proof, or guarantee that no exploit exists.",
  },
] as const;

const evidenceRecordExample = [
  "claimId: UA-STORAGE-004",
  "releaseDigest: sha256:4c7f...9b2e",
  "claim: proposed implementation changes slot 14 semantics",
  "inputs:",
  "  baselineLayout: sha256:5bd1...087a",
  "  proposedLayout: sha256:9c2a...ee11",
  "method: normalized compiler storage-layout comparison",
  "environment: solc 0.8.28 / optimizer 10000 / viaIR false",
  "observation: FeeConfig.recipient overlaps WithdrawalConfig.delay",
  "reproduction: tests/UAStorage004.t.sol",
  "status: human-validated",
  "limitations:",
  "  - applies only to the listed proxy and implementation",
].join("\n");

const glossary = [
  [
    "Audited baseline",
    "The exact source revision and system state that anchor the prior independent review. An audit report without a bound commit is not sufficient by itself.",
  ],
  [
    "Release candidate",
    "The exact proposed source, compiler configuration, bytecode, addresses, payload, parameters, order, and target state submitted for review.",
  ],
  [
    "Artifact binding",
    "The association of a claim or decision with content digests and environment identifiers so a changed input is detectable.",
  ],
  [
    "Fork manifest",
    "The chain ID, block number and hash, RPC source class, tool versions, test seeds, impersonation, balance changes, and other deviations used to reproduce state.",
  ],
  [
    "Invariant",
    "A safety, accounting, authority, uniqueness, price, or liveness property expected to remain true across the reviewed release.",
  ],
  [
    "Material claim",
    "A conclusion capable of changing the release recommendation, severity, remediation, governance decision, or stated residual risk.",
  ],
  [
    "Release recommendation",
    "The reviewer-signed Proceed, Remediate, or Hold recommendation for one frozen scope. It is advisory and does not transfer deployment authority.",
  ],
  [
    "Residual risk",
    "A known uncertainty, exclusion, environmental dependency, or untested condition that remains after the review.",
  ],
] as const;

function WhitepaperChapterLinks() {
  return (
    <ol>
      {chapters.map(([title, id], index) => (
        <li key={id}>
          <a href={"#" + id} onClick={(event) => {
            const contents = event.currentTarget.closest("details");
            if (contents) contents.open = false;
          }}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {title}
          </a>
        </li>
      ))}
    </ol>
  );
}

export function WhitepaperExperience() {
  return (
    <section
      className={`${styles.paper} whitepaper-experience`}
      aria-label="Nodezuno EVM upgrade security review technical whitepaper"
    >
      <div className={`${styles.masthead} whitepaper-masthead`}>
        <div>
          <span>NODEZUNO RESEARCH / NZ-UA-WP-001</span>
          <h1>Technical whitepaper</h1>
          <p className="whitepaper-subtitle">How we review an EVM smart contract upgrade.</p>
        </div>
        <div className="whitepaper-meta">
          <span>
            <small>Version</small>
            1.0
          </span>
          <span>
            <small>Published</small>
            10 August 2026
          </span>
          <span>
            <small>Scope</small>
            Audited EVM contract upgrades
          </span>
          <button
            className="button button-outline"
            onClick={() => window.print()}
            type="button"
          >
            Print / save PDF
          </button>
        </div>
      </div>

      <div className="whitepaper-notice">
        <span className="docs-state docs-state-preview">Methodology</span>
        <p>
          This paper describes our standard EVM review method for previously
          audited contracts and one defined upgrade. It is a methodology, not a
          record of completed client reviews. Non-EVM reviews use their own tools
          and timelines, with the same $7,500 price and 50/50 payment structure.
        </p>
      </div>

      <div className={`${styles.layout} whitepaper-layout`}>
        <aside className={`${styles.contents} whitepaper-toc whitepaper-toc-desktop`} aria-label="Whitepaper contents">
          <strong>Contents</strong>
          <WhitepaperChapterLinks />
          <div>
            <span>Standard EVM review</span>
            <p>
              One release on one EVM network, with a five-business-day target
              after payment and required materials are ready.
            </p>
            <Link href="/docs">
              Preparation guide ↗
            </Link>
          </div>
        </aside>

        <details className={`${styles.mobileContents} whitepaper-toc-mobile`}>
          <summary>
            <span>Contents</span>
            <strong>{chapters.length} sections</strong>
            <i aria-hidden="true" />
          </summary>
          <nav aria-label="Whitepaper contents">
            <WhitepaperChapterLinks />
          </nav>
        </details>

        <article className={`${styles.article} whitepaper-article`}>
          <section id="wp-abstract">
            <span className="whitepaper-chapter">01 / ABSTRACT</span>
            <h2>
              Independent evidence for the gap between audit and execution.
            </h2>
            <p className="whitepaper-lede">
              An audited protocol can still ship an unsafe upgrade. The final
              release may differ from the reviewed commit, modify proxy storage,
              expand authority, encode the wrong governance action, change a
              production parameter, or fail only when executed against live
              historical state. Point-in-time audit evidence does not
              automatically follow those changes into production.
            </p>
            <p>
              The Nodezuno EVM upgrade security review is a paid, five-business-day
              independent release review for audited EVM contract systems. The
              method binds an audited baseline, the exact release candidate,
              the intended deployment or governance payload, and a pinned view
              of production state. It then combines normalized change
              analysis, payload decoding, deterministic checks, fork execution,
              invariant testing, and accountable human review.
            </p>
            <p>
              The output is an inspectable evidence bundle and one scoped
              recommendation: Proceed, Remediate, or Hold. These labels describe
              release evidence, not absolute security. The client retains all
              governance, signing, deployment, monitoring, and incident
              authority.
            </p>
            <div className="whitepaper-thesis">
              <span>THESIS</span>
              <strong>
                A material upgrade should execute only after its exact
                artifacts, production state, trust-boundary changes, and
                critical invariants have been independently examined as one
                release object.
              </strong>
            </div>
          </section>

          <section id="wp-definition">
            <span className="whitepaper-chapter">
              02 / DEFINITION + OBJECTIVES
            </span>
            <h2>A release review, not a second general audit.</h2>
            <p>
              The standard engagement begins with a baseline that has already
              received an independent audit or equivalent review. Its subject
              is the delta from that baseline to one frozen production release
              on one EVM network. The review includes the code and the action
              that will make the code or configuration effective.
            </p>
            <div className="whitepaper-two-column">
              <div>
                <h3>Objectives</h3>
                <ul>
                  <li>Bind conclusions to exact source, bytecode, state, and payload.</li>
                  <li>Identify every changed authority and economic trust boundary.</li>
                  <li>Decode the complete deployment or governance action.</li>
                  <li>Execute the release against a pinned production fork.</li>
                  <li>Test agreed safety and business invariants.</li>
                  <li>Preserve evidence that another engineer can inspect.</li>
                  <li>Assign one human-owned release recommendation.</li>
                </ul>
              </div>
              <div>
                <h3>Non-objectives</h3>
                <ul>
                  <li>Auditing a new or materially unaudited protocol from first principles.</li>
                  <li>Proving that no unknown vulnerability or exploit exists.</li>
                  <li>Taking custody of keys or executing production actions.</li>
                  <li>Providing legal, regulatory, tax, accounting, or insurance opinions.</li>
                  <li>Replacing client monitoring, governance, rollback, or incident response.</li>
                  <li>Allowing AI to issue or sign the release recommendation.</li>
                  <li>Issuing a certification, badge, or universal assurance score.</li>
                </ul>
              </div>
            </div>
            <div className="whitepaper-contract-note">
              <span>Service contract</span>
              <p>
                The five-business-day window starts only after payment under
                the order, accepted prerequisites, written scope, restricted
                access setup, and artifact freeze. Client wait time, revised
                scope, inaccessible systems, and remediation are outside that
                window unless the order states otherwise.
              </p>
              <Link href="/pricing">Read current pricing and scope ↗</Link>
            </div>
          </section>

          <section id="wp-threat-model">
            <span className="whitepaper-chapter">03 / THREAT MODEL</span>
            <h2>Assume the release can fail across code, state, authority, and process.</h2>
            <p>
              The model considers accidental defects, malicious changes,
              compromised contributors, incorrect operational assumptions,
              faulty tools, stale or incomplete chain data, hostile external
              dependencies, and reviewer error. It does not assume that a
              successful build, prior audit, verified source label, governance
              vote, or passing unit suite establishes release safety.
            </p>
            <div className="whitepaper-threat-grid">
              {threatClasses.map(([title, body], index) => (
                <div key={title}>
                  <strong>
                    {String(index + 1).padStart(2, "0")} / {title}
                  </strong>
                  <p>{body}</p>
                </div>
              ))}
            </div>
            <h3 className="whitepaper-subhead">Protected properties</h3>
            <ul className="whitepaper-principles">
              <li>
                <strong>Asset integrity</strong>
                <span>User and protocol assets cannot be created, destroyed, redirected, locked, or mis-accounted outside intended rules.</span>
              </li>
              <li>
                <strong>Authority integrity</strong>
                <span>Only intended principals can upgrade, pause, configure, mint, seize, withdraw, relay, or otherwise exercise privileged behavior.</span>
              </li>
              <li>
                <strong>State continuity</strong>
                <span>Existing storage, balances, positions, messages, nonces, and entitlements preserve their intended meaning across the release.</span>
              </li>
              <li>
                <strong>Execution integrity</strong>
                <span>The actual transaction sequence matches reviewed targets, selectors, parameters, values, order, chain, and postconditions.</span>
              </li>
              <li>
                <strong>Evidence integrity</strong>
                <span>Material conclusions remain attributable to exact inputs, methods, observations, reproduction status, limitations, and human review.</span>
              </li>
            </ul>
            <div className="whitepaper-assumption">
              <strong>Adversarial input boundary</strong>
              <p>
                Source comments, documentation, issue text, governance
                descriptions, calldata annotations, logs, prior reports, and
                client prompts can be incomplete, mistaken, or deliberately
                manipulative. They are context, not self-authenticating truth.
              </p>
            </div>
          </section>

          <section id="wp-trust">
            <span className="whitepaper-chapter">04 / TRUST + AUTHORITY</span>
            <h2>Independent review must not become production authority.</h2>
            <p>
              Nodezuno needs enough access to inspect artifacts and reproduce
              behavior, but no authority to approve governance, sign a
              transaction, control an upgrade admin, move assets, operate a
              validator, or administer the client&apos;s production
              infrastructure. The engagement separates evidence access from
              execution authority.
            </p>
            <div className="whitepaper-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Actor</th>
                    <th>Permitted responsibility</th>
                    <th>Authority boundary</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Client technical owner</td>
                    <td>Provide artifacts, explain intent, answer factual questions, and correct the release.</td>
                    <td>Cannot change frozen inputs without invalidating or revising scope.</td>
                  </tr>
                  <tr>
                    <td>Client decision authority</td>
                    <td>Accept risk, govern, sign, deploy, monitor, pause, roll back, and respond.</td>
                    <td>Cannot represent Nodezuno&apos;s recommendation more broadly than its stated scope.</td>
                  </tr>
                  <tr>
                    <td>Nodezuno reviewer</td>
                    <td>Define review coverage, validate evidence, adjudicate findings, and sign the recommendation.</td>
                    <td>Does not receive production signing or custody authority.</td>
                  </tr>
                  <tr>
                    <td>Analysis tools</td>
                    <td>Build, normalize, diff, decode, execute tests, simulate, trace, and record observations.</td>
                    <td>Cannot independently convert output into a material finding or release recommendation.</td>
                  </tr>
                  <tr>
                    <td>AI systems</td>
                    <td>Assist search, hypothesis generation, summarization, and draft analysis within approved data boundaries.</td>
                    <td>Cannot access forbidden data, execute production actions, validate itself, or own the verdict.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section id="wp-architecture">
            <span className="whitepaper-chapter">05 / REVIEW ARCHITECTURE</span>
            <h2>A staged system with evidence gates and human authority.</h2>
            <p>
              The architecture is organized to prevent a plausible narrative
              from bypassing artifact identity, execution evidence, or human
              review. Each stage consumes bound inputs and emits attributable
              observations. A later stage may challenge an earlier result but
              cannot silently rewrite its source evidence.
            </p>
            <div
              className="whitepaper-system-map"
              aria-label="EVM upgrade review architecture"
            >
              <div>
                <small>BOUND INPUTS</small>
                <strong>Baseline · proposal · payload · state · invariants</strong>
              </div>
              <span aria-hidden="true">→</span>
              <div className="is-core">
                <small>EVIDENCE PIPELINE</small>
                <strong>Normalize · diff · decode · fork · test · trace</strong>
              </div>
              <span aria-hidden="true">→</span>
              <div>
                <small>HUMAN DECISION</small>
                <strong>Validate · challenge · limit · sign · deliver</strong>
              </div>
              <div className="system-map-planes">
                <span>Artifact control</span>
                <span>Deterministic execution</span>
                <span>Independent adjudication</span>
              </div>
            </div>
            <div className="whitepaper-plane-stack">
              <div>
                <span>01 / CONTROL</span>
                <h3>Scope and artifact plane</h3>
                <p>
                  Holds the written boundary, identities, artifact digests,
                  build manifest, target addresses, fork state, payload,
                  invariants, exclusions, questions, and evidence index.
                </p>
                <ul>
                  <li>Prerequisite validation and fit decision</li>
                  <li>Least-privilege reviewer access</li>
                  <li>Immutable artifact references</li>
                  <li>Scope-change invalidation</li>
                </ul>
              </div>
              <div>
                <span>02 / ANALYSIS</span>
                <h3>Deterministic evidence plane</h3>
                <p>
                  Rebuilds and normalizes artifacts, computes deltas, decodes
                  execution, creates the fork, runs checks and invariants, and
                  retains commands, traces, and state observations.
                </p>
                <ul>
                  <li>Reproducible build and bytecode mapping</li>
                  <li>Storage, interface, role, and payload checks</li>
                  <li>Pinned fork execution and historical replay</li>
                  <li>Invariant and failure-path evidence</li>
                </ul>
              </div>
              <div>
                <span>03 / DECISION</span>
                <h3>Human adjudication plane</h3>
                <p>
                  A named reviewer examines the whole release, reproduces
                  material claims, challenges feasibility, records uncertainty,
                  assigns the bounded status, and signs delivery.
                </p>
                <ul>
                  <li>Threat-model completeness review</li>
                  <li>Material finding reproduction</li>
                  <li>Severity and residual-risk judgment</li>
                  <li>Proceed, Remediate, or Hold recommendation</li>
                </ul>
              </div>
            </div>
            <div className="whitepaper-lifecycle">
              {reviewLifecycle.map((step, index) => (
                <div key={step.label}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <small>{step.label}</small>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="wp-artifacts">
            <span className="whitepaper-chapter">06 / ARTIFACT IDENTITY</span>
            <h2>The review object is more than a Git commit.</h2>
            <p>
              A source revision does not fully specify an EVM release.
              Compilation, linking, metadata, constructor or initializer data,
              proxy state, deployment addresses, governance wrappers, target
              chain, transaction order, and configuration can all change
              execution. The Nodezuno EVM upgrade review identifies these inputs as one
              release object.
            </p>
            <div className="whitepaper-slo-grid">
              {[
                ["Source", "Repositories, commits, submodules, generated code, remappings, and included paths."],
                ["Build", "Compiler and tool versions, optimizer, runs, EVM target, via-IR setting, metadata, libraries, and flags."],
                ["Bytecode", "Creation and runtime bytecode, immutables, linked addresses, verified-source relationship, and deployed code hash."],
                ["State", "Chain ID, block number and hash, proxy slots, roles, owners, configuration, balances, dependencies, and accepted modifications."],
                ["Action", "Targets, selectors, calldata, values, salt, predecessor, delay, order, delegate calls, initializer, and expected postconditions."],
                ["Intent", "Architecture rationale, resolved audit findings, critical invariants, known risks, monitoring, rollback assumptions, and named owners."],
              ].map(([label, body]) => (
                <div key={label}>
                  <span>BOUND INPUT</span>
                  <strong>{label}</strong>
                  <p>{body}</p>
                </div>
              ))}
            </div>
            <div className="whitepaper-assumption">
              <strong>Digest semantics</strong>
              <p>
                A cryptographic digest proves that bytes are unchanged. It does
                not prove that the bytes are correct, complete, safe, deployed,
                authorized, or semantically equivalent. Those questions require
                additional evidence.
              </p>
            </div>
          </section>

          <section id="wp-evidence">
            <span className="whitepaper-chapter">07 / EVIDENCE MODEL</span>
            <h2>Every material claim needs provenance and a validation state.</h2>
            <p>
              Evidence records separate the claim, input identity, method,
              environment, observation, reproduction artifact, reviewer
              judgment, and limitation. This prevents a scanner message, model
              hypothesis, passing test, or reviewer intuition from being
              presented as stronger evidence than it is.
            </p>
            <div className="whitepaper-policy-code">
              <pre>
                <code>{evidenceRecordExample}</code>
              </pre>
              <div>
                <strong>Minimum claim fields</strong>
                <p>
                  Claim ID, release digest, affected artifact, evidence source,
                  method, tool and environment, observation, reproduction
                  status, reviewer, timestamp, confidence basis, contrary
                  evidence, and known limitations.
                </p>
              </div>
            </div>
            <div className="whitepaper-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Evidence state</th>
                    <th>Meaning</th>
                    <th>Permitted use</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Lead</td>
                    <td>A tool, AI system, prior report, or reviewer identified a hypothesis.</td>
                    <td>Guides investigation only. It is not a finding.</td>
                  </tr>
                  <tr>
                    <td>Observed</td>
                    <td>A bounded method produced a recorded result against identified inputs.</td>
                    <td>Supports a factual observation with stated environment limits.</td>
                  </tr>
                  <tr>
                    <td>Reproduced</td>
                    <td>The material behavior repeats through preserved steps or an independent path.</td>
                    <td>Supports impact and feasibility analysis.</td>
                  </tr>
                  <tr>
                    <td>Human-validated</td>
                    <td>A named reviewer connected the evidence to scope, challenged it, and accepted the conclusion.</td>
                    <td>May support a material finding and release recommendation.</td>
                  </tr>
                  <tr>
                    <td>Unresolved</td>
                    <td>Evidence conflicts, is unavailable, or cannot be reproduced within the review window.</td>
                    <td>Must remain visible and may require Hold.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section id="wp-checks">
            <span className="whitepaper-chapter">08 / DETERMINISTIC CHECKS</span>
            <h2>Repeatable comparisons establish the structural release delta.</h2>
            <p>
              The check catalog is selected according to upgrade pattern,
              protocol design, artifacts, and written scope. A result is PASS,
              FAIL, NOT APPLICABLE with rationale, or UNRESOLVED. Missing
              evidence is never silently converted into a pass.
            </p>
            <div className="whitepaper-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Check family</th>
                    <th>Representative checks</th>
                    <th>Primary evidence</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Build reproducibility</td>
                    <td>Compiler settings, dependency locks, generated code, libraries, metadata, creation and runtime bytecode.</td>
                    <td>Build manifest, commands, output digests, deployed code hash.</td>
                  </tr>
                  <tr>
                    <td>Interface compatibility</td>
                    <td>ABI, selectors, events, errors, receive and fallback behavior, mutability, return shapes, and externally reachable calls.</td>
                    <td>Normalized ABI and selector delta with source locations.</td>
                  </tr>
                  <tr>
                    <td>Storage compatibility</td>
                    <td>Slots, types, packing, inheritance, gaps, namespaces, mappings, structs, enums, initializers, and proxy conventions.</td>
                    <td>Compiler layouts, proxy state reads, and targeted fork assertions.</td>
                  </tr>
                  <tr>
                    <td>Proxy mechanics</td>
                    <td>EIP-1967 and UUPS slots, beacons, transparent proxy admin, rollback guards, diamond selectors, facet cuts, and initialization.</td>
                    <td>Onchain slots, bytecode, decoded calls, and post-upgrade assertions.</td>
                  </tr>
                  <tr>
                    <td>Authority graph</td>
                    <td>Owners, roles, admins, guardians, timelocks, multisigs, signers, delegates, pause and upgrade reachability.</td>
                    <td>Role events, state reads, call graph, governance configuration, and simulations.</td>
                  </tr>
                  <tr>
                    <td>Payload integrity</td>
                    <td>Chain, target, selector, arguments, value, operation type, order, predecessor, salt, delay, nested batches, and postconditions.</td>
                    <td>Raw payload bytes, deterministic decode, expected-action manifest.</td>
                  </tr>
                  <tr>
                    <td>Dependency and configuration</td>
                    <td>Oracle feeds, decimals, heartbeat, sequencer checks, bridges, tokens, routers, hooks, callbacks, limits, fees, and risk parameters.</td>
                    <td>Baseline and proposed state snapshots plus dependency behavior tests.</td>
                  </tr>
                  <tr>
                    <td>Behavioral regression</td>
                    <td>Historical calls, event and revert changes, gas-sensitive paths, accounting transitions, failure recovery, and client invariants.</td>
                    <td>Pinned fork runs, traces, state deltas, invariant results, and test seeds.</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="whitepaper-caption">
              Determinism applies to identified inputs and environments. It does
              not imply that an RPC provider, external service, compiler,
              dependency, or blockchain will remain unchanged outside the
              preserved review context.
            </p>
          </section>

          <section id="wp-execution">
            <span className="whitepaper-chapter">
              09 / FORK EXECUTION + INVARIANTS
            </span>
            <h2>Test the proposed action against real state, without calling it production.</h2>
            <p>
              Fork execution begins at an agreed block number and hash on the
              target network. The environment records archive-data source,
              client and tool versions, impersonated accounts, funded accounts,
              mocked components, timestamp or block changes, and all other
              departures from public state. The review executes the exact
              proposed action before testing its consequences.
            </p>
            <div className="whitepaper-lineage">
              {[
                ["Pin", "Chain ID · block number · block hash · RPC class"],
                ["Recreate", "Addresses · storage · roles · balances · dependencies"],
                ["Execute", "Targets · calldata · value · order · initializer"],
                ["Exercise", "Historical paths · adversarial sequences · failures"],
                ["Assert", "Safety · accounting · authority · postconditions"],
              ].map(([label, detail], index) => (
                <div key={label}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </div>
              ))}
            </div>
            <div className="whitepaper-two-column">
              <div>
                <h3>Invariant design</h3>
                <ul>
                  <li>State the property in domain language before encoding it.</li>
                  <li>Identify actors, preconditions, exclusions, and tolerated error.</li>
                  <li>Connect each property to assets or authority at risk.</li>
                  <li>Run before and after the proposed action when meaningful.</li>
                  <li>Preserve failing seeds, call sequences, traces, and state.</li>
                </ul>
              </div>
              <div>
                <h3>Representative properties</h3>
                <ul>
                  <li>Assets remain greater than or equal to recorded liabilities.</li>
                  <li>Total user entitlements remain conserved across migration.</li>
                  <li>Only the intended governance path can upgrade or configure.</li>
                  <li>A message, withdrawal, or claim cannot be consumed twice.</li>
                  <li>Prices and decimals remain inside defined safety bounds.</li>
                </ul>
              </div>
            </div>
            <div className="whitepaper-assumption">
              <strong>Fork validity boundary</strong>
              <p>
                A fork cannot establish future transaction ordering, private
                order flow, validator behavior, unavailable offchain systems,
                unknown integrations, future liquidity, changed oracle
                responses, or exhaustive adversarial coverage. These remain
                explicit residual risks.
              </p>
            </div>
          </section>

          <section id="wp-ai">
            <span className="whitepaper-chapter">10 / AI BOUNDARY</span>
            <h2>AI can increase review breadth without receiving release authority.</h2>
            <p>
              Model-assisted analysis may help summarize large deltas, propose
              threat hypotheses and invariant candidates, cluster traces,
              explain deterministic tool output, and draft non-final evidence
              language. These outputs begin as leads. They become material only
              through source-bound observation, reproduction when applicable,
              and human validation.
            </p>
            <div className="whitepaper-two-column">
              <div>
                <h3>Permitted role</h3>
                <ul>
                  <li>Prioritize changed files, functions, dependencies, and traces.</li>
                  <li>Propose questions, adversarial states, and invariant candidates.</li>
                  <li>Translate tool output into review leads for an expert.</li>
                  <li>Assist documentation after facts and evidence are established.</li>
                  <li>Operate only inside approved access and data boundaries.</li>
                </ul>
              </div>
              <div>
                <h3>Prohibited role</h3>
                <ul>
                  <li>Changing scope, artifacts, or evidence status by itself.</li>
                  <li>Accessing production keys or submitting production actions.</li>
                  <li>Treating generated output as self-validating evidence.</li>
                  <li>Assigning the final Proceed, Remediate, or Hold recommendation.</li>
                  <li>Claiming that a release, protocol, or contract is safe.</li>
                </ul>
              </div>
            </div>
            <div className="whitepaper-security-layers">
              {[
                ["Untrusted context", "Repository text, comments, reports, calldata descriptions, logs, and prompts may contain misleading instructions or prompt injection."],
                ["Tool isolation", "Model-accessible tools must be bounded to the approved review environment and must not expose signing, deployment, or unrestricted client systems."],
                ["Evidence gate", "A model assertion cannot support a material finding until a human connects it to preserved deterministic or independently inspected evidence."],
                ["Data agreement", "External model use, model provider, retention behavior, and permitted artifact classes must match the written engagement terms."],
                ["Human signature", "Only the named reviewer can accept a material conclusion and sign the release recommendation."],
              ].map(([layer, body]) => (
                <div key={layer}>
                  <strong>{layer}</strong>
                  <p>{body}</p>
                </div>
              ))}
            </div>
            <p>
              If client terms prohibit model use for an artifact class, the
              affected model-assisted workflow is disabled. The service does
              not silently send the material to a different model provider.
            </p>
          </section>

          <section id="wp-human">
            <span className="whitepaper-chapter">11 / HUMAN REVIEW</span>
            <h2>Judgment remains explicit, attributable, and challengeable.</h2>
            <p>
              A named reviewer owns scope adequacy, threat-model quality,
              material-delta coverage, finding reproduction, severity,
              feasibility, uncertainty, residual risk, and the final
              recommendation. Human review is not a ceremonial approval after
              automation. It is the authority boundary that converts evidence
              into a decision.
            </p>
            <ul className="whitepaper-contract-list">
              <li>
                <strong>Scope validation.</strong>
                <span>Confirm that the proposed action, affected contracts, state, dependencies, and client-stated invariants are represented accurately.</span>
              </li>
              <li>
                <strong>Material-delta review.</strong>
                <span>Inspect changed trust boundaries, including apparently small configuration, role, initializer, and call-order changes.</span>
              </li>
              <li>
                <strong>Finding challenge.</strong>
                <span>Reproduce behavior, test exploit preconditions, search for counter-evidence, and separate a tool artifact from protocol impact.</span>
              </li>
              <li>
                <strong>Uncertainty management.</strong>
                <span>Record unavailable evidence, conflicting results, assumptions, environmental gaps, and the reason each matters to the decision.</span>
              </li>
              <li>
                <strong>Decision signature.</strong>
                <span>Assign Proceed, Remediate, or Hold only after reviewing the indexed evidence and state the exact validity boundary and residual risks.</span>
              </li>
            </ul>
            <div className="whitepaper-assumption">
              <strong>Independence</strong>
              <p>
                Nodezuno reviews and recommends. The client retains the power
                to accept risk and execute. Compensation is for the defined
                review work, not for producing Proceed, approving governance, or
                taking a percentage of assets protected.
              </p>
            </div>
          </section>

          <section id="wp-assurance">
            <span className="whitepaper-chapter">
              12 / ASSURANCE LEVELS + DECISIONS
            </span>
            <h2>Describe completed evidence separately from the release recommendation.</h2>
            <p>
              Assurance levels state which evidence stages completed for the
              frozen release. The decision states what the reviewer recommends.
              A high evidence level does not force Proceed: a well-reproduced
              blocker can produce L3 evidence and a Remediate recommendation.
            </p>
            <div className="whitepaper-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Level</th>
                    <th>Established meaning</th>
                    <th>Explicit non-meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {assuranceLevels.map((item) => (
                    <tr key={item.level}>
                      <td>
                        <strong>{item.level}</strong>
                        <br />
                        {item.name}
                      </td>
                      <td>{item.meaning}</td>
                      <td>{item.doesNotMean}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="whitepaper-problem-grid">
              <div>
                <span>Proceed</span>
                <h3>No blocker reproduced</h3>
                <p>
                  Required evidence completed and no release blocker was
                  reproduced in the frozen scope. Limitations and residual
                  risks remain inseparable from the recommendation.
                </p>
              </div>
              <div>
                <span>Remediate</span>
                <h3>Correct before release</h3>
                <p>
                  A release blocker or material defect is reproduced or
                  sufficiently substantiated within scope. The recommendation
                  identifies the correction required before re-review.
                </p>
              </div>
              <div>
                <span>Hold</span>
                <h3>Evidence or conditions remain</h3>
                <p>
                  Material uncertainty, missing evidence, a coverage gap, or a
                  release condition prevents Proceed. The recommendation names
                  what must be resolved before another decision.
                </p>
              </div>
            </div>
            <p className="whitepaper-caption">
              Nodezuno does not use an autonomous AI verdict or a universal
              numeric safety score. Proceed, Remediate, and Hold are
              reviewer-signed, scope-bound recommendations with written reasoning.
              A changed bound input makes the prior recommendation inapplicable.
            </p>
          </section>

          <section id="wp-delivery">
            <span className="whitepaper-chapter">13 / EVIDENCE BUNDLE</span>
            <h2>Delivery should let engineering, security, and governance inspect the same facts.</h2>
            <div className="whitepaper-roadmap">
              <div>
                <span>DELIVERABLE 01</span>
                <h3>Scope and artifact manifest</h3>
                <p>
                  Included inputs, digests, addresses, network state, build
                  environment, owners, assumptions, exclusions, and scope changes.
                </p>
                <small>Purpose: establish the exact review object</small>
              </div>
              <div>
                <span>DELIVERABLE 02</span>
                <h3>Release delta and action decode</h3>
                <p>
                  Structural code, bytecode, storage, authority, configuration,
                  dependency, payload, and expected-postcondition changes.
                </p>
                <small>Purpose: make changed trust boundaries visible</small>
              </div>
              <div>
                <span>DELIVERABLE 03</span>
                <h3>Execution and invariant evidence</h3>
                <p>
                  Fork manifest, commands, versions, test seeds, traces, state
                  deltas, outcomes, raw-output digests, and reproduction notes.
                </p>
                <small>Purpose: support independent inspection and reruns</small>
              </div>
              <div>
                <span>DELIVERABLE 04</span>
                <h3>Finding register</h3>
                <p>
                  Claims, affected artifacts, evidence, impact, feasibility,
                  severity rationale, uncertainty, and remediation disposition.
                </p>
                <small>Purpose: separate verified facts from open hypotheses</small>
              </div>
              <div>
                <span>DELIVERABLE 05</span>
                <h3>Decision memorandum</h3>
                <p>
                  Assurance level, Proceed, Remediate, or Hold, mandatory conditions,
                  residual risks, limitations, validity boundary, reviewer, and date.
                </p>
                <small>Purpose: create one accountable release recommendation</small>
              </div>
              <div>
                <span>DELIVERABLE 06</span>
                <h3>Verification addendum</h3>
                <p>
                  When included in scope, identifies the remediation revision
                  and result of one bounded verification pass.
                </p>
                <small>Purpose: close agreed conditions without hiding new changes</small>
              </div>
            </div>
            <p>
              The bundle is delivered in a human-readable form. Machine-readable
              manifests, scripts, or regression tests may be included when the
              written scope, repository license, and client environment permit.
              Proprietary source and sensitive evidence may be referenced by
              digest or redacted rather than redistributed.
            </p>
          </section>

          <section id="wp-data">
            <span className="whitepaper-chapter">
              14 / SECURITY + DATA HANDLING
            </span>
            <h2>Minimize what enters the review and what the reviewer can do.</h2>
            <p>
              Public intake is limited to scoping metadata. Private source,
              detailed vulnerability information, credentials, and restricted
              evidence must not be submitted until the parties establish a
              written scope and approved exchange channel. The EVM upgrade review
              does not require production signing authority or custody.
            </p>
            <div className="whitepaper-security-layers">
              {[
                ["Access minimization", "Prefer read-only, repository-scoped, reviewer-specific, time-bounded access. Keep review systems separate from production signing and administration."],
                ["Secret exclusion", "Do not provide private keys, seed phrases, deployer credentials, wallet approvals, cloud administrator access, or unrestricted production credentials."],
                ["Data minimization", "Provide only artifacts, state, configuration, traces, reports, and contact data necessary for the accepted scope. Remove unrelated personal and customer data."],
                ["Evidence separation", "Keep raw artifacts, deterministic observations, reviewer notes, model-generated leads, and delivery outputs logically distinct and access-controlled."],
                ["Model governance", "The written terms identify whether external model providers are permitted and which artifact classes may enter model-assisted analysis."],
                ["Retention and deletion", "The engagement order defines retention, deletion or return, and any limited exceptions needed for billing, disputes, law, or agreed regression work."],
                ["Coordinated disclosure", "Potential vulnerabilities move through named restricted contacts. Public forms, public repositories, and community channels are not disclosure paths."],
              ].map(([layer, body]) => (
                <div key={layer}>
                  <strong>{layer}</strong>
                  <p>{body}</p>
                </div>
              ))}
            </div>
            <div className="whitepaper-contract-note">
              <span>Security posture</span>
              <p>
                This paper states methodology requirements. It does not claim a
                certification, regulatory approval, completed independent
                control audit, or customer-specific data-processing commitment.
                The signed engagement terms control actual handling.
              </p>
              <Link href="/security">Review the Nodezuno security page ↗</Link>
            </div>
          </section>

          <section id="wp-limitations">
            <span className="whitepaper-chapter">15 / LIMITATIONS</span>
            <h2>Assurance remains bounded by scope, evidence, time, and environment.</h2>
            <ul className="whitepaper-limitations">
              <li>The review cannot prove that no unknown bug, exploit path, economic attack, or operational failure exists.</li>
              <li>A prior audit can be incomplete, outdated, incorrectly scoped, or disconnected from deployed bytecode and state.</li>
              <li>Only listed artifacts, addresses, payloads, configuration, dependencies, invariants, and chain state receive coverage.</li>
              <li>Fork execution cannot perfectly reproduce production ordering, private transactions, validator behavior, future liquidity, or unavailable offchain systems.</li>
              <li>Historical replay samples known behavior and does not exhaust future calls or adversarial sequences.</li>
              <li>Third-party contracts, bridges, oracles, tokens, frontends, keepers, cloud systems, endpoints, employees, and signers are reviewed only to the depth written in scope.</li>
              <li>Formal verification, economic modeling, penetration testing, incident response, continuous monitoring, deployment, and rollback operations are not included unless separately agreed.</li>
              <li>Unreproducible builds, incomplete RPC history, missing configuration, ambiguous payloads, or unavailable owners may force Hold, lower evidence coverage, rescoping, or decline.</li>
              <li>Nodezuno does not provide legal, tax, accounting, regulatory, insurance, or investment advice.</li>
              <li>Proceed, Remediate, and Hold are recommendations, not warranties, certifications, service-level guarantees, or authorization to deploy.</li>
              <li>Any change to a bound input invalidates the decision for the revised release until reviewed.</li>
              <li>The client remains responsible for governance, key security, production execution, monitoring, emergency powers, rollback, communication, and incident response.</li>
            </ul>
            <h3 className="whitepaper-subhead">Failure to complete</h3>
            <p>
              If evidence needed for a responsible decision cannot be obtained
              within scope, Nodezuno must preserve that uncertainty. The
              appropriate result may be Hold, Remediate, a reduced assurance
              level, a revised scope, or a declined conclusion. Schedule
              pressure is not evidence.
            </p>
          </section>

          <section id="wp-roadmap">
            <span className="whitepaper-chapter">
              16 / ROADMAP + REFERENCES
            </span>
            <h2>Extend the evidence system without automating away accountability.</h2>
            <p>
              Roadmap directions are research and operating priorities, not
              promised dates, availability commitments, customer results, or
              autonomous decision claims. Method changes will be versioned so a
              past review remains interpretable under the method used at that
              time.
            </p>
            <div className="whitepaper-roadmap">
              <div className="is-complete">
                <span>METHOD 1.0</span>
                <h3>Single-upgrade assurance</h3>
                <p>
                  Audited EVM baseline, one frozen release batch, one network,
                  deterministic checks, fork evidence, and human recommendation.
                </p>
                <small>Current documented service boundary</small>
              </div>
              <div>
                <span>NEXT</span>
                <h3>Broader deterministic adapters</h3>
                <p>
                  Versioned schemas and checks for additional proxy patterns,
                  governance executors, diamonds, beacons, and common integrations.
                </p>
                <small>Subject to validation and supported scope</small>
              </div>
              <div>
                <span>NEXT</span>
                <h3>Reusable regression baselines</h3>
                <p>
                  Preserve approved client invariants and release evidence as a
                  controlled baseline for later, separately scoped upgrades.
                </p>
                <small>No continuous service is implied by this paper</small>
              </div>
              <div>
                <span>RESEARCH</span>
                <h3>Stronger specification</h3>
                <p>
                  Explore machine-readable release manifests, formally stated
                  invariants, provenance standards, and proof-carrying evidence.
                </p>
                <small>Human release authority remains mandatory</small>
              </div>
            </div>

            <h3 className="whitepaper-subhead">Glossary</h3>
            <dl className="whitepaper-glossary">
              {glossary.map(([term, definition]) => (
                <div key={term}>
                  <dt>{term}</dt>
                  <dd>{definition}</dd>
                </div>
              ))}
            </dl>

            <h3 className="whitepaper-subhead">Normative context</h3>
            <div className="whitepaper-references">
              <a
                aria-label="EIP-1967: Proxy storage slots, opens in a new tab"
                href="https://eips.ethereum.org/EIPS/eip-1967"
                target="_blank"
                rel="noopener noreferrer"
              >
                EIP-1967: Proxy storage slots <span>↗</span>
              </a>
              <a
                aria-label="EIP-1822: Universal Upgradeable Proxy Standard, opens in a new tab"
                href="https://eips.ethereum.org/EIPS/eip-1822"
                target="_blank"
                rel="noopener noreferrer"
              >
                EIP-1822: Universal Upgradeable Proxy Standard <span>↗</span>
              </a>
              <a
                aria-label="EIP-2535: Diamonds, opens in a new tab"
                href="https://eips.ethereum.org/EIPS/eip-2535"
                target="_blank"
                rel="noopener noreferrer"
              >
                EIP-2535: Diamonds <span>↗</span>
              </a>
              <a
                aria-label="Solidity storage layout documentation, opens in a new tab"
                href="https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html"
                target="_blank"
                rel="noopener noreferrer"
              >
                Solidity: Storage layout <span>↗</span>
              </a>
              <a
                aria-label="Foundry fork testing guide, opens in a new tab"
                href="https://www.getfoundry.sh/guides/fork-testing"
                target="_blank"
                rel="noopener noreferrer"
              >
                Foundry: Fork testing <span>↗</span>
              </a>
              <Link href="/security">
                Nodezuno security boundary <span>↗</span>
              </Link>
            </div>

            <div className="whitepaper-version">
              <span>Version 1.0 · 10 August 2026</span>
              <p>
                Initial public methodology for the Nodezuno EVM upgrade security review.
                Future revisions will record material changes to scope,
                evidence semantics, assurance levels, AI boundaries, and human
                decision authority.
              </p>
            </div>
            <div className="whitepaper-contract-note">
              <span>Discuss the methodology</span>
              <p>
                Questions, corrections, and research feedback help improve this
                working paper. Share public references and a description of the
                section you would like to discuss.
              </p>
              <Link href="/company/contact">
                Contact Nodezuno ↗
              </Link>
            </div>
          </section>
        </article>
      </div>
    </section>
  );
}
