"use client";

import { useState } from "react";

const aiExplorerQuestions = [
  {
    id: "revert",
    question: "Why did this transaction fail?",
    answer:
      "The synthetic transaction reached the token contract, then reverted because the requested transfer exceeded the sender balance at the referenced block.",
    confidence: "High in this fixture",
    evidence: [
      "Transaction 0x7c...91 · status reverted",
      "Trace frame 3 · ERC20InsufficientBalance",
      "Block 4,210,884 · canonical fixture tip",
    ],
  },
  {
    id: "fees",
    question: "What caused the fee spike in this block?",
    answer:
      "Three synthetic contracts generated most of the gas demand. Contract 0xa1...08 accounts for 61 percent, primarily through repeated storage writes.",
    confidence: "Medium in this fixture",
    evidence: [
      "Block 4,210,901 · gas used 93 percent",
      "Call aggregate · contract 0xa1...08",
      "Receipt set · 184 synthetic transactions",
    ],
  },
  {
    id: "validator",
    question: "What changed in the validator set?",
    answer:
      "The synthetic checkpoint records one validator leaving and two joining. Total modeled voting weight increased by 2.4 percent.",
    confidence: "High in this fixture",
    evidence: [
      "Validator event · remove node-07",
      "Validator events · add node-12 and node-13",
      "Checkpoint 18,404 · finalized fixture state",
    ],
  },
] as const;

export function AiExplorerExperience() {
  const [activeId, setActiveId] = useState<(typeof aiExplorerQuestions)[number]["id"]>(
    "revert",
  );
  const active =
    aiExplorerQuestions.find((item) => item.id === activeId) ??
    aiExplorerQuestions[0];

  return (
    <section className="special-module ai-explorer-module">
      <div className="module-head">
        <div>
          <span className="section-kicker">Evidence-grounded prototype</span>
          <h2>Ask the chain what happened.</h2>
        </div>
        <span className="preview-badge">Synthetic fixture</span>
      </div>
      <p className="module-disclaimer">
        This interactive preview uses deterministic sample records. It does not
        query a live chain or call an AI model. Production answers will require
        a canonical index, fork awareness, freshness checks, and citations to
        raw blocks, transactions, events, traces, or validator observations.
      </p>
      <div className="directory-filters" aria-label="AI Explorer example questions">
        {aiExplorerQuestions.map((item) => (
          <button
            className={active.id === item.id ? "active" : ""}
            key={item.id}
            onClick={() => setActiveId(item.id)}
            type="button"
          >
            {item.question}
          </button>
        ))}
      </div>
      <div className="capability-grid">
        <article className="capability-card">
          <span className="section-kicker">Explanation</span>
          <h3>{active.question}</h3>
          <p>{active.answer}</p>
          <small>{active.confidence}</small>
        </article>
        <article className="capability-card">
          <span className="section-kicker">Attached evidence</span>
          <h3>Every claim must be inspectable.</h3>
          <ul>
            {active.evidence.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}

const aiOperationsScenarios = [
  {
    id: "finality",
    label: "Finality delay",
    observation:
      "The synthetic network has not finalized a checkpoint for 94 seconds. RPC reads remain available, but two validators report a different peer view after a staged client change.",
    diagnosis:
      "Client-version drift is the leading hypothesis in this fixture. It is not a confirmed root cause because the validator duty record and network-level peer sample are incomplete.",
    confidence: "Medium confidence in this fixture",
    evidence: [
      "Consensus checkpoint 18,404 · finality age 94 seconds",
      "Deployment change chg-208 · two validators moved to v1.8.3",
      "Peer samples · two conflicting network views",
    ],
    nextStep:
      "Collect validator duty results and compare the changed nodes with the approved compatibility matrix. Pause the remaining rollout until an operator reviews the result.",
  },
  {
    id: "rpc",
    label: "RPC divergence",
    observation:
      "One synthetic RPC pool reports a block tip three heights behind the reference while error rate rises on trace-heavy methods.",
    diagnosis:
      "Resource saturation on one archive role is more consistent with the attached evidence than a chain-wide consensus issue. Canonical identity still needs to be rechecked.",
    confidence: "Medium confidence in this fixture",
    evidence: [
      "RPC pool west-02 · tip lag 3 blocks",
      "Method class debug_trace · error rate 18 percent",
      "Archive node west-02-a · disk queue above fixture threshold",
    ],
    nextStep:
      "Verify chain identity and a common finalized block across pools, then ask an operator to decide whether the affected archive node should leave read rotation.",
  },
  {
    id: "indexer",
    label: "Explorer lag",
    observation:
      "The synthetic explorer is 427 blocks behind even though canonical RPC tip checks remain healthy across two read pools.",
    diagnosis:
      "A stopped ingestion cursor after a schema change is the strongest fixture hypothesis. The chain and public RPC surfaces do not show the same lag.",
    confidence: "High confidence in this fixture",
    evidence: [
      "Indexer cursor · unchanged for 11 minutes",
      "Schema release idx-31 · completed 13 minutes ago",
      "Canonical RPC comparison · both pools at block 4,210,901",
    ],
    nextStep:
      "Run the read-only cursor integrity check, inspect the migration result, and require approval before replaying or advancing indexed state.",
  },
] as const;

export function AiOperationsExperience() {
  const [activeId, setActiveId] = useState<
    (typeof aiOperationsScenarios)[number]["id"]
  >("finality");
  const active =
    aiOperationsScenarios.find((item) => item.id === activeId) ??
    aiOperationsScenarios[0];

  return (
    <section className="special-module ai-explorer-module">
      <div className="module-head">
        <div>
          <span className="section-kicker">Read-only operations prototype</span>
          <h2>See the evidence chain before the action.</h2>
        </div>
        <span className="preview-badge">Synthetic incidents</span>
      </div>
      <p className="module-disclaimer">
        This preview uses deterministic sample records. It does not monitor a
        customer chain, invoke an AI model, execute a runbook, or validate
        production accuracy. A real pilot must measure diagnosis quality,
        citation coverage, time to useful evidence, and unsafe recommendation
        rate against operator-reviewed incidents.
      </p>
      <div className="directory-filters" aria-label="AI operations incident examples">
        {aiOperationsScenarios.map((scenario) => (
          <button
            className={active.id === scenario.id ? "active" : ""}
            key={scenario.id}
            onClick={() => setActiveId(scenario.id)}
            type="button"
          >
            {scenario.label}
          </button>
        ))}
      </div>
      <div className="capability-grid">
        <article className="capability-card">
          <span className="section-kicker">Observed</span>
          <h3>{active.label}</h3>
          <p>{active.observation}</p>
          <small>Observation is kept separate from inference.</small>
        </article>
        <article className="capability-card">
          <span className="section-kicker">Ranked hypothesis</span>
          <h3>What the evidence supports so far</h3>
          <p>{active.diagnosis}</p>
          <small>{active.confidence}</small>
        </article>
        <article className="capability-card">
          <span className="section-kicker">Attached evidence</span>
          <h3>Every material claim stays inspectable.</h3>
          <ul>
            {active.evidence.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
        <article className="capability-card">
          <span className="section-kicker">Approval-gated next step</span>
          <h3>A proposal, not an autonomous change</h3>
          <p>{active.nextStep}</p>
          <small>Signing, deployment, failover, and state changes remain blocked.</small>
        </article>
      </div>
    </section>
  );
}
