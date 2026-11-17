import Link from "next/link";
import type { ReactNode } from "react";
import type { DetailPageData } from "@/lib/site-data";
import styles from "./information-page.module.css";

const titles: Record<string, string> = {
  security: "Security at Nodezuno.",
  "company/careers": "Work with Nodezuno.",
  "company/newsroom": "Newsroom.",
  "company/investor-thesis": "Why we are building Nodezuno.",
  "company/press-kit": "Press kit.",
  "resources/research": "Research and insights.",
};

export function InformationPage({ page, children, showOverview = true }: {
  page: DetailPageData;
  children?: ReactNode;
  showOverview?: boolean;
}) {
  const isSecurity = page.path === "security";
  const links = [page.primaryCta, page.secondaryCta].filter((link) =>
    link && !link.href.startsWith("/review/") && !link.href.startsWith(`/${page.path}#`));
  return (
    <main className={styles.page} id="main-content">
      <div className={styles.container}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><span>{page.eyebrow}</span></nav>
        <header className={styles.intro}>
          <span className={styles.kicker}>{isSecurity ? "TRUST & RESPONSIBILITY" : page.kind}</span>
          <h1>{titles[page.path] ?? page.title}</h1>
          <p>{page.intro}</p>
        </header>
        {isSecurity ? (
          <div className={styles.securityPrinciples} aria-label="Review boundaries">
            <div><span>01</span><strong>Your keys stay with you.</strong><p>Customers retain signing and deployment authority.</p></div>
            <div><span>02</span><strong>Your code stays private.</strong><p>Access and transfer rules belong in the service order.</p></div>
            <div><span>03</span><strong>AI needs your approval.</strong><p>Written permission is required for external AI use.</p></div>
          </div>
        ) : null}
        <div className={`${styles.editorialLayout} ${!showOverview ? styles.fullWidth : ""}`}>
          <aside className={styles.sidebar}>
            <span className={styles.sidebarLabel}>{showOverview ? "ON THIS PAGE" : "RELATED INFORMATION"}</span>
            {showOverview ? page.capabilities.map((item, index) => <a key={item.title} href={`#information-${index + 1}`}>{item.title}<span aria-hidden="true">↘</span></a>) : null}
            {page.workflow && showOverview ? <a href="#information-process">{isSecurity ? "During the engagement" : "Further details"}<span aria-hidden="true">↘</span></a> : null}
            <div className={styles.relatedLinks}>
              {links.map((link) => link ? <Link href={link.href} key={link.href}>{link.label}<span aria-hidden="true">↗</span></Link> : null)}
            </div>
          </aside>
          <div className={styles.body}>
            {children ? <div className={styles.embedded}>{children}</div> : null}
            {showOverview ? (
              <div id={isSecurity ? "ai-and-human-review" : undefined} className={styles.sections}>
                {page.capabilities.map((item, index) => (
                  <section id={`information-${index + 1}`} key={item.title}>
                    <h2>{item.title}</h2><p>{item.description}</p>
                  </section>
                ))}
                {page.workflow ? <section id="information-process" className={styles.lifecycle}>
                  <h2>{isSecurity ? "During the engagement" : "Further details"}</h2>
                  {page.workflow.map((item) => <article key={item.title}><span>{item.label}</span><div><h3>{item.title}</h3><p>{item.description}</p></div></article>)}
                </section> : null}
              </div>
            ) : null}
            {page.note ? <p className={styles.note}>{page.note}</p> : null}
          </div>
        </div>
      </div>
    </main>
  );
}

export function ContactPage({ children }: { children: ReactNode }) {
  return (
    <main className={styles.page} id="main-content">
      <div className={styles.container}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><span>Contact</span></nav>
        <div className={styles.contactLayout}>
          <div className={styles.contactIntro}>
            <span className={styles.kicker}>CONTACT NODEZUNO</span>
            <h1>Let’s talk.</h1>
            <p>Questions, partnerships, or a conversation about what you are building. Send us a message or email the right contact below.</p>
            <div className={styles.emailList}>
              {[
                ["General enquiries", "info@nodezuno.com"],
                ["Press and research", "info@nodezuno.com"],
                ["Security reports", "info@nodezuno.com"],
              ].map(([label, email]) => <a key={email} href={`mailto:${email}`}><span>{label}</span><strong>{email}</strong><i aria-hidden="true">↗</i></a>)}
            </div>
            <p className={styles.contactNote}>For an existing order, use the contact details in your client portal. Please keep private code, credentials, and exploit details out of your first message.</p>
          </div>
          <section className={styles.formCard} aria-labelledby="contact-form-title">
            <div className={styles.formHeading}><h2 id="contact-form-title">Send a message</h2><span>All fields are required</span></div>
            <div className={styles.formHost}>{children}</div>
          </section>
        </div>
      </div>
    </main>
  );
}
