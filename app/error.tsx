"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Nodezuno route boundary failed", {
      digest: error.digest,
      name: error.name,
    });
  }, [error]);

  return (
    <main id="main-content" className="error-page">
      <div className="detail-hero-grid" aria-hidden="true" />
      <div>
        <span className="section-kicker">Recoverable route failure</span>
        <h1>This view could not be resolved safely.</h1>
        <p>
          The failure was contained at the page boundary. Retry the request or
          return to a known route; no form should be resubmitted automatically.
        </p>
        <div className="hero-actions">
          <button className="button button-solid" onClick={reset} type="button">
            Retry this view
          </button>
          <Link className="button button-outline" href="/">
            Return home
          </Link>
        </div>
      </div>
    </main>
  );
}
