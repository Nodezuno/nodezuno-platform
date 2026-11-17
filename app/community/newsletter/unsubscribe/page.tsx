import Link from "next/link";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Newsletter subscription control | Nodezuno",
  referrer: "no-referrer",
  robots: { index: false, follow: false, noarchive: true },
};

type UnsubscribePageProps = {
  searchParams: Promise<{
    state?: string | string[];
    token?: string | string[];
  }>;
};

export default async function NewsletterUnsubscribePage({
  searchParams,
}: UnsubscribePageProps) {
  const params = await searchParams;
  const state = typeof params.state === "string" ? params.state : "";
  const token = typeof params.token === "string" ? params.token : "";
  const validToken = /^[A-Za-z0-9_-]{40,200}$/.test(token);

  return (
    <main id="main-content" className="account-page">
      <section className="account-hero">
        <div className="container account-heading">
          <div>
            <span className="section-kicker">Nodezuno Signal</span>
            <h1>Subscription control.</h1>
            <p>
              Confirm once to stop future Nodezuno Signal email delivery.
            </p>
          </div>
        </div>
      </section>
      <section className="section-pad">
        <div className="container">
          <div className="account-empty">
            {state === "complete" ? (
              <>
                <span className="section-kicker">Request complete</span>
                <h2>You have been unsubscribed.</h2>
                <p>
                  If the link matched a subscription, its state is now
                  unsubscribed and the delivery outbox has been updated.
                </p>
                <Link className="button button-outline" href="/">
                  Return home
                </Link>
              </>
            ) : validToken ? (
              <>
                <span className="section-kicker">Confirmation required</span>
                <h2>Stop Nodezuno Signal emails?</h2>
                <p>
                  This action affects only the subscription associated with
                  this private link.
                </p>
                <form
                  action="/api/v1/newsletter/unsubscribe"
                  method="post"
                >
                  <input name="token" type="hidden" value={token} />
                  <button className="button button-solid" type="submit">
                    Confirm unsubscribe
                  </button>
                </form>
              </>
            ) : (
              <>
                <span className="section-kicker">Invalid link</span>
                <h2>This unsubscribe link is incomplete.</h2>
                <p>
                  Use the full private link from a Nodezuno Signal email or
                  contact info@nodezuno.com.
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
