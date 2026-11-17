import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { identitySignOutPath } from "@/app/chatgpt-auth";
import { AccountDataExport } from "@/components/account-data-export";
import { AccountSecurity } from "@/components/account-security";
import { accountIdentityFromHeaders } from "@/lib/server/account-identity";
import { getAuthProviderAvailability } from "@/lib/server/auth";
import {
  listSubmissionsForAccount,
  listSubmissionsForEmail,
  type SubmissionSummary,
} from "@/lib/server/database";
import { listReviewOrdersForAccount } from "@/lib/server/review-commerce";

export const dynamic = "force-dynamic";

const kindLabels: Record<string, string> = {
  sales: "Company enquiry",
  press: "Press enquiry",
  career_interest: "Career interest",
  security_contact: "Security contact",
};

const submissionStatusLabels: Record<string, string> = {
  received: "Received",
  reviewing: "Under review",
  closed: "Closed",
  spam: "Closed",
};

function submissionKindLabel(submission: SubmissionSummary): string {
  if (submission.kind === "sales") {
    if (submission.sourcePath === "/company/contact") return "General enquiry";
    if (submission.sourcePath === "/contact/upgrade-assurance") {
      return "Release review enquiry";
    }
    return "Company enquiry";
  }
  return kindLabels[submission.kind] ?? "Enquiry";
}

const reviewStatusLabels: Record<string, string> = {
  qualification_pending: "Checkout preparing",
  needs_information: "Information needed",
  proposal_ready: "Ready for payment",
  deposit_pending: "Payment in progress",
  deposit_paid: "Payment confirmed",
  scheduled: "Scheduled",
  in_review: "In review",
  remediation: "Remediation",
  balance_due: "Final payment due",
  paid: "Paid",
  payment_refunded: "Payment refunded",
  completed: "Completed",
  declined: "Not accepted",
  cancelled: "Cancelled",
};

function requestDate(value: number): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export default async function AccountPage() {
  const user = await accountIdentityFromHeaders(await headers());
  if (!user) redirect("/login?return_to=%2Faccount");
  const contactEmail = user.contactEmail ?? (
    user.authMethod === "chatgpt" ? user.email : null
  );
  const accountIdentifier =
    contactEmail ?? user.walletAddress ?? "Secure Nodezuno account";
  const providers = await getAuthProviderAvailability();
  let reviewOrdersUnavailable = false;
  let submissionsUnavailable = false;
  let reviewOrders: Awaited<
    ReturnType<typeof listReviewOrdersForAccount>
  > = [];
  let submissions: SubmissionSummary[] = [];
  if (user.accountId) {
    try {
      reviewOrders = await listReviewOrdersForAccount(user.accountId);
    } catch {
      reviewOrdersUnavailable = true;
    }
  }
  if (user.accountId || contactEmail) {
    try {
      submissions = user.accountId
        ? await listSubmissionsForAccount(user.accountId)
        : await listSubmissionsForEmail(contactEmail!);
    } catch {
      submissionsUnavailable = true;
    }
  }

  return (
    <main id="main-content" className="account-page">
      <section className="account-hero">
        <div className="container">
          <nav className="console-navigation" aria-label="Review account">
            <Link aria-current="page" href="/account">
              Review portal
            </Link>
            <Link href="/account#data-export">Data export</Link>
            <Link href="/account#security">Security</Link>
            <Link href="/review/start">Start a review</Link>
            <Link href="/docs">Documentation</Link>
          </nav>
          <div className="account-heading">
            <div>
              <span className="section-kicker">Smart contract and protocol release review portal</span>
              <h1>Service orders, payments, and deliverables.</h1>
              <p>
                Open private service orders, complete payment, track work, and
                download reports released to{" "}
                <strong>{accountIdentifier}</strong>.
              </p>
            </div>
            <div className="account-actions">
              <Link className="button button-solid" href="/review/start">
                Start a review <span aria-hidden="true">↗</span>
              </Link>
              <Link className="button button-outline" href="/methodology">
                Review methodology
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section-pad" id="requests">
        <div className="container">
          {reviewOrdersUnavailable || submissionsUnavailable ? (
            <div className="account-empty account-partial-warning" role="status">
              <span className="section-kicker">Partial availability</span>
              <h2>Some request records could not be loaded.</h2>
              <p>
                The available records remain below. Retry shortly to restore the
                complete account view.
              </p>
            </div>
          ) : null}

          {reviewOrdersUnavailable && submissionsUnavailable ? (
            <div className="account-empty">
              <span className="section-kicker">Temporarily unavailable</span>
              <h2>We could not load your requests.</h2>
              <p>
                Please retry shortly. New submissions remain protected by the
                same secure system.
              </p>
            </div>
          ) : !reviewOrdersUnavailable &&
            !submissionsUnavailable &&
            reviewOrders.length === 0 &&
            submissions.length === 0 ? (
            <div className="account-empty">
              <span className="section-kicker">No requests yet</span>
              <h2>Have a smart contract or protocol release to review?</h2>
              <p>
                Submit public details about one bounded protocol upgrade, then
                continue directly to the secure scheduling-deposit checkout.
              </p>
              <Link className="button button-solid" href="/review/start">
                Start a review
              </Link>
            </div>
          ) : reviewOrders.length > 0 || submissions.length > 0 ? (
            <div className="request-list">
              <div className="request-list-head">
                <span>
                  {reviewOrders.length + submissions.length} request
                  {reviewOrders.length + submissions.length === 1 ? "" : "s"}
                </span>
                <small>
                  Only requests owned by this authenticated account are shown.
                </small>
              </div>
              {reviewOrders.map((order) => (
                <article className="request-card" key={order.id}>
                  <div>
                    <span className="section-kicker">
                      Release review service order
                    </span>
                    <h2>{order.company}</h2>
                    <p>
                      {order.nextAction ??
                        `Open the private review record for ${order.targetChain}.`}
                    </p>
                    <Link
                      className="button button-outline"
                      href={`/review/${encodeURIComponent(order.id)}`}
                    >
                      Open service order
                    </Link>
                  </div>
                  <dl>
                    <div>
                      <dt>Status</dt>
                      <dd className={`request-status status-${order.status}`}>
                        {reviewStatusLabels[order.status] ?? "Status unavailable"}
                      </dd>
                    </div>
                    <div>
                      <dt>Received</dt>
                      <dd>{requestDate(order.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>Reference</dt>
                      <dd>
                        <code>{order.reference}</code>
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
              {submissions.map((submission) => (
                <article className="request-card" key={submission.id}>
                  <div>
                    <span className="section-kicker">
                      {submissionKindLabel(submission)}
                    </span>
                    <h2>{submission.company}</h2>
                    <p>{submission.message}</p>
                  </div>
                  <dl>
                    <div>
                      <dt>Status</dt>
                      <dd className={`request-status status-${submission.status}`}>
                        {submissionStatusLabels[submission.status] ??
                          "Status unavailable"}
                      </dd>
                    </div>
                    <div>
                      <dt>Received</dt>
                      <dd>{requestDate(submission.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>Request ID</dt>
                      <dd>
                        <code>{submission.id}</code>
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          ) : (
            <div className="account-empty">
              <span className="section-kicker">Available records checked</span>
              <h2>No requests were returned by the available source.</h2>
              <p>
                Retry shortly before creating or following up on another request.
              </p>
            </div>
          )}

          <AccountDataExport
            betterAuthManaged={Boolean(user.accountId)}
          />

          <AccountSecurity
            authMethod={user.authMethod ?? "chatgpt"}
            betterAuthManaged={Boolean(user.accountId)}
            emailRecoveryAvailable={providers.emailVerification}
            hostSignOutPath={
              user.accountId ? null : identitySignOutPath("/")
            }
            identifier={accountIdentifier}
          />
        </div>
      </section>
    </main>
  );
}
