import Link from "next/link";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Confirm newsletter subscription | Nodezuno",
  referrer: "no-referrer",
  robots: { index: false, follow: false, noarchive: true },
};

type ConfirmationPageProps = {
  searchParams: Promise<{
    state?: string | string[];
    token?: string | string[];
  }>;
};

const CONFIRMATION_TOKEN_PATTERN = /^[a-f0-9]{32}\.[a-f0-9]{64}$/;

export default async function NewsletterConfirmationPage({
  searchParams,
}: ConfirmationPageProps) {
  const params = await searchParams;
  const state = typeof params.state === "string" ? params.state : "";
  const token = typeof params.token === "string" ? params.token : "";
  const validToken = CONFIRMATION_TOKEN_PATTERN.test(token);

  return (
    <main id="main-content" className="account-page">
      <section className="account-hero">
        <div className="container account-heading">
          <div>
            <span className="section-kicker">Nodezuno Signal</span>
            <h1>Confirm your subscription.</h1>
            <p>
              One deliberate confirmation keeps the newsletter list private,
              permissioned, and useful.
            </p>
          </div>
        </div>
      </section>
      <section className="section-pad">
        <div className="container">
          <div className="account-empty">
            {state === "subscribed" ? (
              <>
                <span className="section-kicker">Email confirmed</span>
                <h2>You are subscribed to Nodezuno Signal.</h2>
                <p>
                  Your permission is recorded. You can unsubscribe from any
                  newsletter email at any time.
                </p>
                <Link className="button button-outline" href="/">
                  Return home
                </Link>
              </>
            ) : state === "expired" ? (
              <>
                <span className="section-kicker">Link expired</span>
                <h2>Request a fresh confirmation link.</h2>
                <p>
                  Confirmation links expire after 72 hours. Submit the
                  newsletter form again to receive a new private link.
                </p>
                <Link
                  className="button button-solid"
                  href="/community/newsletter"
                >
                  Return to newsletter
                </Link>
              </>
            ) : state === "invalid" ? (
              <>
                <span className="section-kicker">Invalid link</span>
                <h2>This confirmation link cannot be used.</h2>
                <p>
                  It may be incomplete, replaced by a newer request, or tied
                  to a subscription that was already withdrawn.
                </p>
                <Link
                  className="button button-outline"
                  href="/community/newsletter"
                >
                  Newsletter overview
                </Link>
              </>
            ) : validToken ? (
              <>
                <span className="section-kicker">Action required</span>
                <h2>Join Nodezuno Signal?</h2>
                <p>
                  Email scanners can open this page safely. Your subscription
                  changes only after you press the confirmation button.
                </p>
                <form action="/api/v1/newsletter/confirm" method="post">
                  <input name="token" type="hidden" value={token} />
                  <button className="button button-solid" type="submit">
                    Confirm subscription
                  </button>
                </form>
              </>
            ) : (
              <>
                <span className="section-kicker">Invalid link</span>
                <h2>This confirmation link is incomplete.</h2>
                <p>
                  Use the full private link from your Nodezuno Signal email or
                  submit the newsletter form again.
                </p>
                <Link
                  className="button button-outline"
                  href="/community/newsletter"
                >
                  Newsletter overview
                </Link>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
