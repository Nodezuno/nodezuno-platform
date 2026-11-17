import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found" id="main-content">
      <div className="not-found-grid" aria-hidden="true" />
      <div>
        <span className="section-kicker">404 / route not found</span>
        <h1>This path is outside the review scope.</h1>
        <p>
          The page may have moved or the route may no longer be published.
          Return to the Nodezuno product site.
        </p>
        <Link className="button button-solid button-large" href="/">
          Back to Nodezuno <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </main>
  );
}
