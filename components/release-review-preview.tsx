import Link from "next/link";
import styles from "./release-review-preview.module.css";

const reviewChecks = [
  ["01", "Compare versions", "Code, dependencies, and runtime behavior"],
  ["02", "Challenge the change", "State, permissions, and release execution"],
  ["03", "Record the evidence", "Findings, reproduction steps, and limitations"],
] as const;

/** A description of the review output, without fabricated customer results. */
export function ReleaseReviewPreview() {
  return (
    <figure className={styles.preview} aria-labelledby="review-preview-title">
      <div className={styles.document}>
        <header className={styles.header}>
          <span className={styles.mark} aria-hidden="true">NZ</span>
          <div><span>WHAT YOU RECEIVE</span><h2 id="review-preview-title">Release review package</h2></div>
          <span className={styles.private}>Private</span>
        </header>
        <div className={styles.versions} aria-label="The two versions in scope">
          <div><span>STARTING POINT</span><strong>Your audited version</strong><small>Recorded baseline</small></div>
          <span className={styles.arrow} aria-hidden="true">→</span>
          <div><span>REVIEW TARGET</span><strong>Your next version</strong><small>One release, one network</small></div>
        </div>
        <ol className={styles.checks}>
          {reviewChecks.map(([number, title, detail]) => (
            <li key={number}><span>{number}</span><div><strong>{title}</strong><p>{detail}</p></div><span className={styles.checkArrow} aria-hidden="true">↗</span></li>
          ))}
        </ol>
        <section className={styles.recommendation} aria-label="Final recommendation options">
          <span>HUMAN-SIGNED RECOMMENDATION</span>
          <div><strong>Proceed</strong><i aria-hidden="true">/</i><strong>Remediate</strong><i aria-hidden="true">/</i><strong>Hold</strong></div>
          <p>A clear conclusion tied to the exact release, findings, and remaining risks.</p>
        </section>
        <footer className={styles.footer}><span>One fix review included</span><span>Your team controls deployment</span></footer>
      </div>
      <figcaption>Explore the method behind the report. <Link href="/whitepaper">Read the technical whitepaper <span aria-hidden="true">↗</span></Link></figcaption>
    </figure>
  );
}
