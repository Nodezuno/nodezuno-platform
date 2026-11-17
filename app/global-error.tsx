"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main className="error-page">
          <div>
            <span className="section-kicker">Contained application failure</span>
            <h1>Nodezuno could not render this request.</h1>
            <p>
              Retry once. If the problem persists, use the public health
              endpoint or contact support with the time of the failure.
            </p>
            <button className="button button-solid" onClick={reset} type="button">
              Retry application
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
