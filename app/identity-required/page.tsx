import Link from "next/link";
import { firstSearchParam, safeRelativeReturnPath } from "@/lib/auth-paths";

export const dynamic = "force-dynamic";

export default async function IdentityRequiredPage({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string | string[] }>;
}) {
  const { return_to: requestedReturnTo } = await searchParams;
  const returnTo = safeRelativeReturnPath(
    firstSearchParam(requestedReturnTo) ?? "/account",
  );
  const loginPath = `/login?return_to=${encodeURIComponent(returnTo)}`;

  return (
    <main id="main-content" className="account-page">
      <section className="account-hero">
        <div className="container account-heading">
          <div>
            <span className="section-kicker">Verified identity required</span>
            <h1>This area is protected.</h1>
            <p>
              Review accounts, private engagement pages, and administration
              tools require a verified identity. Sign in with the account that
              owns the request. Administrators must also use an approved team
              email.
            </p>
          </div>
          <Link className="button button-outline" href={loginPath}>
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
