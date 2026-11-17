import Link from "next/link";
import { reviewPolicy, reviewPriceLabels, reviewScopeSummary } from "@/lib/review-policy";
import type { DetailPageData } from "@/lib/site-data";
import styles from "./commercial-page.module.css";

const pageCopy = {
  product: {
    label: "Release review",
    title: "Know what changes. Know what could break.",
    description: "A security review of your next smart contract or protocol version. We compare it with the previously reviewed version, investigate the risks introduced by the change, and give your engineers a report they can act on.",
    links: [{ label: "What we review", href: "#coverage" }, { label: "What you receive", href: "#deliverables" }, { label: "Preparation guide", href: "/docs" }],
  },
  methodology: {
    label: "How it works",
    title: "From your next release to a clear recommendation.",
    description: "Submit your release details, accept the fixed service order, and pay the deposit in USDC or USDT on Ethereum Mainnet. Submit the transaction hash and Telegram username. Sanjay checks payment manually, then confirms the kickoff requirements and timing.",
    links: [{ label: "The process", href: "#process" }, { label: "The review method", href: "#evidence" }, { label: "Technical whitepaper", href: "/whitepaper" }],
  },
  pricing: {
    label: "Pricing",
    title: "One release. One clear price.",
    description: "The same fixed price for supported EVM and non-EVM releases. No subscription, no recurring charges, and no sales call required to create your order.",
    links: [{ label: "Scope and limits", href: "#scope" }, { label: "Payment milestones", href: "#payment" }, { label: "Common questions", href: "/faq" }],
  },
} as const;

const processSteps = [
  { title: "Tell us about the release", text: "Provide your contact details, target network, previously reviewed version, planned change, and release date. The form creates your private service order directly.", detail: "You receive a private client portal" },
  { title: "Accept the scope and pay", text: `Read the recorded scope and terms, then pay the ${reviewPriceLabels.deposit} deposit in USDC or USDT on Ethereum Mainnet. Submit the transaction hash and your Telegram username.`, detail: "Sanjay checks the transfer manually and contacts you" },
  { title: "Prepare the review materials", text: "Share the exact code versions, prior security review, build instructions, deployed addresses, release actions, and expected behavior through the agreed private route.", detail: "The delivery estimate starts after readiness" },
  { title: "Review, remediate, and receive the report", text: "We investigate the highest-risk changes, document findings, and review one agreed set of fixes. Pay the final balance before receiving the final report and signed recommendation.", detail: "Your team keeps control of deployment" },
];

function ScopeList() {
  return (
    <dl className={styles.scopeList}>
      <div><dt>Network and release</dt><dd>One network, one planned release</dd></div>
      <div><dt>Affected components</dt><dd>Up to {reviewPolicy.affectedComponents.max} contracts, programs, or modules</dd></div>
      <div><dt>Materially changed code</dt><dd>Up to {reviewPolicy.materiallyChangedLines.max} protocol code lines</dd></div>
      <div><dt>Remediation</dt><dd>{reviewPolicy.fixReviews} agreed fix review included</dd></div>
      <div><dt>Standard EVM target</dt><dd>{reviewPolicy.evmTargetBusinessDays} business days after readiness</dd></div>
      <div><dt>Non-EVM timing</dt><dd>Chain-specific estimate confirmed at kickoff</dd></div>
    </dl>
  );
}

export function CommercialPage({ page }: { page: DetailPageData }) {
  const key = page.path === "product" ? "product" : page.path === "methodology" ? "methodology" : "pricing";
  const copy = pageCopy[key];
  return (
    <main className={styles.page} id="main-content">
      <header className={styles.hero}>
        <div className={styles.container}>
          <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">{copy.label}</span></nav>
          <div className={styles.heroGrid}>
            <div>
              <p className={styles.kicker}>{copy.label}</p>
              <h1>{copy.title}</h1>
              <p className={styles.lead}>{copy.description}</p>
              {page.primaryCta ? (
                <Link
                  className={`${styles.primaryButton} ${styles.heroCta}`}
                  href={page.primaryCta.href}
                >
                  {page.primaryCta.label}
                  <span aria-hidden="true">↗</span>
                </Link>
              ) : null}
            </div>
            <aside className={styles.summary} aria-label="Service at a glance">
              <span>THE SERVICE AT A GLANCE</span>
              <dl>
                <div><dt>Coverage</dt><dd>EVM + non-EVM</dd></div>
                <div><dt>Total fee</dt><dd>{reviewPriceLabels.total} USD</dd></div>
                <div><dt>Output</dt><dd>Findings, evidence, recommendation</dd></div>
              </dl>
              <p>For a bounded release with a prior audit or professional security review. Not a replacement for a full audit.</p>
            </aside>
          </div>
          <nav className={styles.pageNav} aria-label="On this page">
            {copy.links.map((link) => <Link key={link.href} href={link.href}>{link.label}<span aria-hidden="true">{link.href.startsWith("#") ? "↓" : "↗"}</span></Link>)}
          </nav>
        </div>
      </header>

      {key === "product" ? (
        <>
          <section className={styles.section} id="coverage" aria-labelledby="coverage-heading">
            <div className={styles.sectionHead}><p className={styles.kicker}>What we review</p><h2 id="coverage-heading">The change, not just the code diff.</h2><p>Code is one part of an upgrade. We also examine the state, permissions, dependencies, and actions that determine how it behaves in production.</p></div>
            <div className={styles.cardGrid}>{page.capabilities.map((item) => <article className={styles.card} key={item.index}><span className={styles.index}>{item.index}</span><h3>{item.title}</h3><p>{item.description}</p></article>)}</div>
          </section>
          <section className={`${styles.section} ${styles.softSection}`} id="deliverables" aria-labelledby="deliverables-heading">
            <div className={styles.sectionHead}><p className={styles.kicker}>What you receive</p><h2 id="deliverables-heading">A usable record of the release and its risks.</h2><p>Every material finding needs supporting evidence. The recommendation names the exact release, assumptions, unresolved risks, and limits of the review.</p></div>
            <div className={styles.outputGrid}>{(page.workflow ?? []).map((item, index) => <article key={item.label}><span>{String(index + 1).padStart(2, "0")} / {item.label}</span><h3>{item.title}</h3><p>{item.description}</p></article>)}</div>
            <div className={styles.recommendation}><div><span>HUMAN-REVIEWED RECOMMENDATION</span><strong>Proceed / Remediate / Hold</strong></div><p>A scoped assessment, not a guarantee of security. Your team retains the release decision and signing authority.</p></div>
          </section>
          <section className={styles.section} aria-labelledby="product-boundary-heading"><div className={styles.boundary}><div><p className={styles.kicker}>A bounded engagement</p><h2 id="product-boundary-heading">Define the release before the review starts.</h2><p>{reviewScopeSummary}</p><Link className={styles.textLink} href="/pricing">See pricing and exclusions <span aria-hidden="true">↗</span></Link></div><ScopeList /></div></section>
        </>
      ) : key === "methodology" ? (
        <>
          <section className={styles.section} id="process" aria-labelledby="process-heading"><div className={styles.sectionHead}><p className={styles.kicker}>Your engagement</p><h2 id="process-heading">Four steps. Clear responsibilities.</h2><p>You create the service order and continue to payment in the private portal. Sanjay checks the submitted transaction manually. Work starts only after payment is recorded, the required materials are ready, the scope is confirmed, conflicts are cleared, and reviewer availability is agreed.</p></div><ol className={styles.timeline}>{processSteps.map((step, index) => <li key={step.title}><span className={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</span><div><h3>{step.title}</h3><p>{step.text}</p><small>{step.detail}</small></div></li>)}</ol></section>
          <section className={`${styles.section} ${styles.softSection}`} id="evidence" aria-labelledby="evidence-heading"><div className={styles.sectionHead}><p className={styles.kicker}>Inside the review</p><h2 id="evidence-heading">Investigation first. Evidence before conclusions.</h2><p>Tools and execution environments adapt to the target chain. AI may help suggest investigation paths, but it does not approve findings or make the final release recommendation.</p></div><div className={styles.cardGrid}>{page.capabilities.map((item) => <article className={styles.card} key={item.index}><span className={styles.index}>{item.index}</span><h3>{item.title}</h3><p>{item.description}</p></article>)}</div><div className={styles.resourceLinks}><Link href="/docs">Prepare your review materials <span aria-hidden="true">↗</span></Link><Link href="/whitepaper">Read the technical whitepaper <span aria-hidden="true">↗</span></Link><Link href="/security">Understand data handling <span aria-hidden="true">↗</span></Link></div></section>
        </>
      ) : (
        <>
          <section className={styles.section} aria-labelledby="price-heading"><div className={styles.priceLayout}><article className={styles.priceCard}><p className={styles.kicker}>Fixed release review</p><h2 id="price-heading">{reviewPriceLabels.total}<span>USD total</span></h2><p>Supported EVM and non-EVM releases share the same price and opening scope limits.</p><ul><li>One network and one bounded release</li><li>Findings, evidence, and a signed recommendation</li><li>One agreed fix review</li><li>No subscription or automatic renewal</li></ul><Link className={styles.primaryButton} href="/review/start">Create your review order <span aria-hidden="true">↗</span></Link><small>Creating an order does not charge you.</small></article><div className={styles.priceDetails} id="payment"><p className={styles.kicker}>Payment milestones</p><h2>Half at scheduling.<br />Half before the final report.</h2><div className={styles.milestones}><div><span>01 / SCHEDULING DEPOSIT</span><strong>{reviewPriceLabels.deposit}</strong><p>Pay after accepting the generated service order. Submit the transaction hash and required Telegram username. Sanjay checks the payment manually and confirms receipt by email.</p></div><div><span>02 / FINAL BALANCE</span><strong>{reviewPriceLabels.balance}</strong><p>Due before the final report and signed recommendation are delivered. The payment is checked manually as well.</p></div></div><div className={styles.paymentNote}><strong>USDC or USDT on Ethereum Mainnet only.</strong><p>Your private portal shows the exact amount and recipient address. Network fees and applicable taxes are separate. No wallet connection or card processor is required. Automatic payment verification is off.</p></div><Link className={styles.textLink} href="/faq">Questions about payment? <span aria-hidden="true">↗</span></Link></div></div></section>
          <section className={`${styles.section} ${styles.softSection}`} id="scope" aria-labelledby="scope-heading"><div className={styles.boundary}><div><p className={styles.kicker}>Scope and limits</p><h2 id="scope-heading">Exactly what one order covers.</h2><p>The limits keep the engagement focused on one release. They are intake ceilings, not a universal measure of security complexity.</p><Link className={styles.textLink} href="/product">Explore review coverage <span aria-hidden="true">↗</span></Link></div><ScopeList /></div><div className={styles.exclusions}><h3>Not included in this package</h3><p>Additional networks, unrelated releases, extra remediation cycles, a new full-system audit, formal verification, specialist cryptography, custody, deployment, incident response, travel, or expedited work. Added scope requires a separately accepted order or is declined.</p></div></section>
        </>
      )}
      <aside className={styles.footnote}><p>{page.note}</p>{key === "pricing" ? <p>Work starts only after Sanjay manually checks the deposit, required materials are ready, the submitted scope is confirmed, conflict checks are complete, and reviewer availability is agreed. If Nodezuno cannot begin the ordered service, the accepted terms govern cancellation and refund handling.</p> : null}<Link href="/legal/terms">Service terms</Link></aside>
    </main>
  );
}
