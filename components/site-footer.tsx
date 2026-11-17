import Link from "next/link";
import { footerGroups } from "@/lib/site-data";
import { Brand } from "./brand";
import styles from "./site-footer.module.css";

export function SiteFooter() {
  return (
    <footer className={"site-footer " + styles.footer}>
      <div className="footer-top">
        <div className="footer-brand">
          <Link href="/" aria-label="Nodezuno home">
            <Brand />
          </Link>
          <p>
            Independent security reviews for the changes between your last
            audit and your next smart contract or protocol release.
          </p>
          <div className="footer-availability">
            <Link href="/status">
              <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 20 20" width="16">
                <path d="M2 10h4l2-5 4 10 2-5h4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
              </svg>
              Service status
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>

        <nav aria-label="Footer navigation" className="footer-nav">
          {footerGroups.map((group) => (
            <div className="footer-column" key={group.label}>
              <h2>{group.label}</h2>
              {group.items.map((item) => {
                const external = item.href.startsWith("mailto:");
                return external ? (
                  <a href={item.href} key={item.href}>
                    {item.title}
                  </a>
                ) : (
                  <Link href={item.href} key={item.href}>
                    {item.title}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      <div className="footer-bottom">
        <span>© 2026 Nodezuno.</span>
        <div>
          <Link href="/legal">Legal overview</Link>
        </div>
        <span>Security for the version you ship.</span>
      </div>
    </footer>
  );
}
