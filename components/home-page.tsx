import Link from "next/link";
import { reviewPolicy, reviewPriceLabels } from "@/lib/review-policy";
import { HomeFaq } from "./home-faq";
import { ReleaseReviewPreview } from "./release-review-preview";
import { ReleasePathVisual } from "./release-path-visual";
import { ReviewAreaIcon } from "./review-area-icon";
import styles from "./home-page.module.css";

const reviewAreas = [
  {
    number: "01",
    area: "code",
    title: "Changed code",
    copy: "New functions, dependencies, compiler settings, contract logic, programs, modules, and runtime behavior introduced by the next version.",
  },
  {
    number: "02",
    area: "state",
    title: "Storage and state",
    copy: "Storage layouts, account migrations, initialization, balances, configuration, and the live state the upgrade must preserve.",
  },
  {
    number: "03",
    area: "authority",
    title: "Permissions",
    copy: "Owners, roles, multisigs, timelocks, validators, governance authority, emergency controls, and every privileged action.",
  },
  {
    number: "04",
    area: "execution",
    title: "Release execution",
    copy: "The exact deployment or governance action, its order of operations, integrations, and the conditions that must hold during the release.",
  },
] as const;

const deliverables = [
  {
    eyebrow: "FINAL RELEASE RECOMMENDATION",
    title: "Proceed, Remediate, or Hold",
    copy: "A human reviewer signs one clear recommendation for the exact version, network, files, and upgrade action that were reviewed.",
    detail: "Your team keeps control of deployment.",
  },
  {
    eyebrow: "PRIORITIZED FINDINGS",
    title: "Understand the highest-risk changes",
    copy: "Each material issue explains the affected behavior, evidence, impact, severity, and practical correction.",
    detail: "Ordered by release risk.",
  },
  {
    eyebrow: "TEST EVIDENCE",
    title: "Reproduce the result",
    copy: "Tests, traces, state changes, and reproduction steps are included where they are safe and technically feasible.",
    detail: "Tied to exact artifacts.",
  },
  {
    eyebrow: "RELEASE RECORD",
    title: "Record exactly what was reviewed",
    copy: "The final package records the baseline, candidate version, scope, environment, assumptions, and upgrade action.",
    detail: "One release on one network.",
  },
  {
    eyebrow: "ONE FIX REVIEW",
    title: "Verify the correction",
    copy: "Submit one stable in-scope fix set. We check the changed code and update the final finding status.",
    detail: "Included in the fixed price.",
  },
] as const;

const process = [
  {
    number: "01",
    label: "SUBMIT",
    title: "Define the next version",
    copy: "Share the previously reviewed version, the version you plan to deploy, the target network, and a clear summary of the change.",
  },
  {
    number: "02",
    label: "FREEZE",
    title: "Lock the review boundary",
    copy: "The service order records the exact release, files, upgrade action, scope, price, and responsibilities before work begins.",
  },
  {
    number: "03",
    label: "REVIEW",
    title: "Analyze and test the change",
    copy: "We inspect code, state, permissions, integrations, and execution, then test the highest-risk behavior in the correct chain environment.",
  },
  {
    number: "04",
    label: "DECIDE",
    title: "Receive the release recommendation",
    copy: "Your team receives findings, evidence, remediation guidance, remaining risks, and the reviewer-signed recommendation.",
  },
] as const;

const ecosystems = [
  "Ethereum and EVM",
  "Solana and SVM",
  "Cosmos and CosmWasm",
  "Sui and Aptos",
  "Starknet",
  "Polkadot and Substrate",
  "Bitcoin and UTXO",
  "Other supported systems",
] as const;

const faqItems = [
  {
    question: "What exactly does Nodezuno review?",
    answer: "One planned smart contract or protocol release that builds on a version covered by a professional audit or security review. We compare the two versions and review the changed code, state, permissions, integrations, and deployment or governance action.",
  },
  {
    question: "Is this another full smart contract audit?",
    answer: "No. A full audit covers a broader codebase. Nodezuno is a focused review of the change between your previously audited version and the next version you plan to deploy. A new or unaudited protocol may need a full audit first.",
  },
  {
    question: "Is the price the same for non-EVM reviews?",
    answer: `Yes. Every supported release review has the same ${reviewPriceLabels.total} fixed price, whether the target is EVM or non-EVM. Preparation, tools, and delivery timing adapt to the selected ecosystem.`,
  },
  {
    question: "When does the review start?",
    answer: `Your private service order and payment instructions open after you submit the form and accept the terms. After you send the ${reviewPriceLabels.deposit} scheduling payment, submit its transaction hash and Telegram username. Sanjay checks the transfer manually and contacts you. Work starts only after payment is recorded, the required files are ready, the scope is confirmed, and reviewer availability is agreed.`,
  },
] as const;

export function HomePage() {
  return (
    <main className={styles.home} id="main-content">
      <section className={styles.hero} aria-labelledby="home-hero-title">
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.grid}>
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}>
              <span className={styles.pulse} aria-hidden="true" />
              SMART CONTRACT + PROTOCOL RELEASE REVIEWS
            </div>
            <h1 id="home-hero-title">
              Your next upgrade.
              <span>Reviewed before release.</span>
            </h1>
            <p className={styles.heroLead}>
              Your last audit covered the previous version. We review the
              changes in your next smart contract or protocol release, so
              your team can understand the risks before deploying.
            </p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryButton} href="/review/start">
                Start a release review
                <span aria-hidden="true">↗</span>
              </Link>
              <Link className={styles.secondaryButton} href="#included">
                See what you receive <span aria-hidden="true">↓</span>
              </Link>
            </div>
            <div className={styles.heroAssurance}>
              <span>EVM + non-EVM</span>
              <span>Human-reviewed findings</span>
              <span>Evidence you can inspect</span>
            </div>
          </div>

          <div className={styles.heroProduct}>
            <ReleasePathVisual />
          </div>
        </div>

        <dl className={styles.metrics} aria-label="Published service facts">
          <div>
            <dt>{reviewPriceLabels.total}</dt>
            <dd>fixed price for every supported review</dd>
          </div>
          <div>
            <dt>{reviewPolicy.evmTargetBusinessDays} business days</dt>
            <dd>target for a ready standard EVM review</dd>
          </div>
          <div>
            <dt>1 release</dt>
            <dd>one release on one network per review</dd>
          </div>
          <div>
            <dt>{reviewPolicy.fixReviews} fix review</dt>
            <dd>included after the initial findings</dd>
          </div>
        </dl>
      </section>

      <nav className={styles.sectionNav} aria-label="Explore the review service">
        <span>THE REVIEW, EXPLAINED</span>
        <a href="#coverage">Coverage <span aria-hidden="true">↘</span></a>
        <a href="#included">Deliverables <span aria-hidden="true">↘</span></a>
        <a href="#process">Process <span aria-hidden="true">↘</span></a>
        <a href="#price">Price & scope <span aria-hidden="true">↘</span></a>
      </nav>

      <section className={styles.riskSection} id="coverage" aria-labelledby="risk-title">
        <div className={styles.sectionIntro}>
          <span className={styles.sectionIndex}>01 / WHY NODEZUNO</span>
          <div>
            <h2 id="risk-title">Small changes can create new risks.</h2>
            <p>
              Even a small upgrade can change who controls the protocol, how existing
              state is interpreted, or what happens when the release transaction runs.
              Nodezuno reviews that exact difference before users and funds depend on it.
            </p>
          </div>
        </div>

        <div className={styles.versionStatement}>
          <div>
            <span>PREVIOUS VERSION</span>
            <strong>Audited</strong>
          </div>
          <div className={styles.versionChange}>
            <span aria-hidden="true">+</span>
            <b>the changes between versions</b>
          </div>
          <div>
            <span>NEXT VERSION</span>
            <strong>Needs its own review</strong>
          </div>
        </div>

        <div className={styles.riskGrid}>
          {reviewAreas.map((area) => (
            <article key={area.title}>
              <div className={styles.areaHeading}><ReviewAreaIcon area={area.area} className={styles.areaIcon} /><span>{area.number}</span></div>
              <h3>{area.title}</h3>
              <p>{area.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.deliverablesSection} id="included" aria-labelledby="deliverables-title">
        <div className={styles.sectionIntro}>
          <span className={styles.sectionIndex}>02 / WHAT YOU RECEIVE</span>
          <div>
            <h2 id="deliverables-title">A report your engineers can act on.</h2>
            <p>
              Your final package explains what changed, what was tested, and what
              remains risky. Every recommendation names the exact version and
              network reviewed, with findings your engineers can act on.
            </p>
          </div>
        </div>

        <div className={styles.deliverableLayout}>
          <div className={styles.reportPreview}><ReleaseReviewPreview /></div>
          <div className={styles.deliverableList}>
            {deliverables.map((item, index) => (
              <article key={item.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><h3>{item.title}</h3><p>{item.copy}</p><small>{item.detail}</small></div>
              </article>
            ))}
          </div>
        </div>

        <div className={styles.textLinks}>
          <Link href="/product#deliverables">Explore the complete deliverable set <span aria-hidden="true">↗</span></Link>
          <Link href="/security#ai-and-human-review">See how evidence and human review work <span aria-hidden="true">↗</span></Link>
        </div>
      </section>

      <section className={styles.processSection} id="process" aria-labelledby="process-title">
        <div className={styles.sectionIntro}>
          <span className={styles.sectionIndex}>03 / HOW IT WORKS</span>
          <div>
            <h2 id="process-title">A clear path from code to recommendation.</h2>
            <p>
              One focused process. The standard EVM package targets five business days
              after Sanjay has manually checked the scheduling payment and confirmed
              that every required input is ready. Non-EVM timing is confirmed at kickoff.
            </p>
          </div>
        </div>

        <ol className={styles.processList}>
          {process.map((step) => (
            <li key={step.number}>
              <div className={styles.processTop}>
                <span>{step.number}</span>
                <i aria-hidden="true" />
                <b>{step.label}</b>
              </div>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </li>
          ))}
        </ol>

        <Link className={styles.inlineButton} href="/methodology">
          Read the complete review process <span aria-hidden="true">↗</span>
        </Link>
      </section>

      <section className={styles.commercialSection} id="price" aria-labelledby="pricing-title">
        <div className={styles.pricePanel}>
          <div className={styles.priceCopy}>
            <span className={styles.sectionIndex}>04 / FIXED PRICE</span>
            <h2 id="pricing-title">One release review. One clear price.</h2>
            <p>
              The fixed price is the same for every supported release review,
              whether the target is EVM or non-EVM. There is no subscription,
              sales call, or hidden platform fee.
            </p>
            <div className={styles.priceValue}>
              <strong>{reviewPriceLabels.total}</strong>
              <span>USD TOTAL</span>
            </div>
            <dl className={styles.paymentSplit}>
              <div>
                <dt>Scheduling payment</dt>
                <dd>{reviewPriceLabels.deposit}</dd>
              </div>
              <div>
                <dt>Before final report</dt>
                <dd>{reviewPriceLabels.balance}</dd>
              </div>
            </dl>
            <Link className={styles.primaryButton} href="/review/start">
              Create your service order <span aria-hidden="true">↗</span>
            </Link>
            <small>Pay in USDC or USDT on Ethereum Mainnet. Submit the transaction hash and Telegram username. Sanjay checks payment manually. No automatic payment verification is used.</small>
          </div>

          <div className={styles.scopePanel}>
            <div>
              <span>STANDARD REVIEW</span>
              <h3>Everything you need to assess one release.</h3>
              <ul>
                <li>Up to {reviewPolicy.affectedComponents.max} affected contracts, programs, or modules</li>
                <li>Up to {reviewPolicy.materiallyChangedLines.max} materially changed protocol code lines</li>
                <li>Prioritized findings and test evidence where feasible</li>
                <li>Reviewer-signed final recommendation</li>
                <li>One in-scope fix review</li>
              </ul>
              <Link href="/pricing#scope">Read the exact scope and payment terms <span aria-hidden="true">↗</span></Link>
            </div>
            <div className={styles.ecosystems}>
              <span>SUPPORTED CATEGORIES</span>
              <div>
                {ecosystems.map((ecosystem) => <b key={ecosystem}>{ecosystem}</b>)}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.faqSection} aria-labelledby="faq-title">
        <div className={styles.faqLayout}>
          <div className={styles.faqIntro}>
            <span className={styles.sectionIndex}>05 / COMMON QUESTIONS</span>
            <h2 id="faq-title">A few useful answers.</h2>
            <p>Scope, pricing, and what happens after you submit.</p>
            <Link href="/faq">View all FAQs <span aria-hidden="true">↗</span></Link>
          </div>
          <HomeFaq items={faqItems} />
        </div>

      </section>
    </main>
  );
}
