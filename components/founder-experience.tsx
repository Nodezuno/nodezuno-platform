import Image from "next/image";
import Link from "next/link";
import styles from "./founder-experience.module.css";

const principles = [
  {
    title: "Evidence before claims",
    copy: "Security conclusions should be clear, reproducible where possible, and honest about what was not tested.",
  },
  {
    title: "Stay close to builders",
    copy: "The service should be shaped by real releases, real failure modes, and the people accountable for production systems.",
  },
  {
    title: "Build trust slowly",
    copy: "Nodezuno will make narrow commitments, protect customer information, and publish results only when they can be verified.",
  },
] as const;

export function FounderExperience() {
  return (
    <article className={styles.page} aria-labelledby="founder-title">
      <div className={styles.container}>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">About</span></nav>
      <div className={styles.profile}>
        <div className={styles.intro}>
          <span className={styles.kicker}><i aria-hidden="true" /> THE PERSON BEHIND NODEZUNO</span>
          <h1 id="founder-title">Sanjay<br />Sudagani.</h1>
          <p className={styles.role}>Founder of Nodezuno <span aria-hidden="true">·</span> Crypto since 2020</p>
          <h2>Crypto feels like home.</h2>
          <p>I entered crypto in 2020 and stayed for the people and the systems they are building. Protocols, wallets, exchanges, DeFi, and infrastructure became more than an interest. They became the world I wanted to build in.</p>
          <Link className={styles.contact} href="/company/contact">Get in touch <span aria-hidden="true">↗</span></Link>
        </div>
        <figure className={styles.photoFrame}>
          <Image
            className={styles.photo}
            src="/sanjay-sudagani-founder.webp"
            width={1200}
            height={1600}
            sizes="(max-width: 760px) 90vw, (max-width: 1000px) 40vw, 460px"
            alt="Sanjay Sudagani"
            priority
            unoptimized
          />
          <figcaption>
            <span>Sanjay Sudagani<small>Founder, Nodezuno</small></span>
            <span className={styles.photoCaptionMark} aria-hidden="true">NZ / 01</span>
          </figcaption>
        </figure>
      </div>
      <section className={styles.story} aria-labelledby="founder-story-title">
        <div><span className={styles.kicker}>01 / WHY NODEZUNO</span><h2 id="founder-story-title">An audit is a beginning.<br />The next release still matters.</h2></div>
          <div>
            <p>
              I love crypto because it lets people build new financial and
              coordination systems from first principles. But those systems keep
              changing after launch. A protocol can be audited and still introduce
              serious risk in its next upgrade.
            </p>
            <p>
              I am building Nodezuno to help smart contract and protocol teams
              understand exactly what changed, test the behavior most likely to
              fail, and make their own deployment decision with clear evidence.
            </p>
          <div className={styles.signature}>
            <span>Sanjay</span>
            <small>Nodezuno, 2026</small>
          </div>
          </div>
      </section>

      <section className={styles.principles} aria-labelledby="founder-principles-title">
        <div className={styles.sectionHead}>
          <span className={styles.kicker}>02 / HOW I WANT TO BUILD</span>
          <h2 id="founder-principles-title">A few things I believe in.</h2>
        </div>
        <div className={styles.principleList}>
          {principles.map((principle, index) => (
            <article key={principle.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{principle.title}</h3>
              <p>{principle.copy}</p>
            </article>
          ))}
        </div>
      </section>
      </div>
    </article>
  );
}
