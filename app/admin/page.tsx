import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
import { AdminReviewOrders } from "@/components/admin-review-orders";
import { isAdminEmail } from "@/lib/server/admin";
import { accountIdentityFromHeaders } from "@/lib/server/account-identity";
import {
  listAdminSubmissions,
  listPublicChains,
  listPublicStatus,
} from "@/lib/server/database";
import {
  adminReviewOrder,
  type AdminReviewOrderView,
  listAdminReviewOrders,
} from "@/lib/server/review-commerce";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await accountIdentityFromHeaders(await headers());
  if (!user) redirect("/login?return_to=%2Fadmin");
  const email = (
    user.contactEmail ??
    (user.authMethod === "chatgpt" ? user.email : "")
  )
    .trim()
    .toLowerCase();
  const authorized = Boolean(email && (await isAdminEmail(email)));

  if (!authorized) {
    return (
      <main id="main-content" className="account-page">
        <section className="account-hero">
          <div className="container account-heading">
            <div>
              <span className="section-kicker">Restricted operations</span>
              <h1>Admin access is not enabled.</h1>
              <p>
                Your identity is verified, but it is not on the server-side
                Nodezuno administrator allowlist.
              </p>
            </div>
            <Link className="button button-outline" href="/">
              Return home
            </Link>
          </div>
        </section>
      </main>
    );
  }

  let operations:
    | {
        submissions: Awaited<ReturnType<typeof listAdminSubmissions>>;
        status: Awaited<ReturnType<typeof listPublicStatus>>;
        chains: Awaited<ReturnType<typeof listPublicChains>>;
        reviewOrders: AdminReviewOrderView[];
      }
    | undefined;

  try {
    const [submissions, status, chains, reviewOrderRows] = await Promise.all([
      listAdminSubmissions(),
      listPublicStatus(),
      listPublicChains(),
      listAdminReviewOrders(),
    ]);
    operations = {
      submissions,
      status,
      chains,
      reviewOrders: await Promise.all(reviewOrderRows.map(adminReviewOrder)),
    };
  } catch {
    return (
      <main id="main-content" className="account-page">
        <section className="account-hero">
          <div className="container account-heading">
            <div>
              <span className="section-kicker">Restricted operations</span>
              <h1>The control center is temporarily unavailable.</h1>
              <p>
                Your administrator identity is valid, but the website database
                could not be read safely. No changes were attempted.
              </p>
            </div>
            <Link className="button button-outline" href="/api/v1/health">
              Check backend health
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main id="main-content" className="account-page admin-page">
      <section className="account-hero">
        <div className="container account-heading">
          <div>
            <span className="section-kicker">Nodezuno operations</span>
            <h1>Platform operations center.</h1>
            <p>
              Verify operator-attached infrastructure, review stored
              requests, and control the public status and chain truth
              surfaces. Signed in as <strong>{email}</strong>.
            </p>
          </div>
          <Link className="button button-outline" href="/developers/status">
            View public status
          </Link>
        </div>
      </section>
      <section className="section-pad">
        <div className="container">
          <AdminDashboard
            initialChains={operations.chains}
            initialServices={operations.status.services}
            initialSubmissions={operations.submissions}
          />
          <AdminReviewOrders initialOrders={operations.reviewOrders} />
        </div>
      </section>
    </main>
  );
}
