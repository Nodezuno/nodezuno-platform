"use client";

import { useState } from "react";
import type { AdminReviewOrderView } from "@/lib/server/review-commerce";

type Action =
  | "request_information"
  | "decline"
  | "schedule"
  | "begin_review"
  | "remediation"
  | "request_balance"
  | "complete"
  | "cancel";

const stateActions: Partial<Record<string, { value: Action; label: string }[]>> = {
  qualification_pending: [
    { value: "request_information", label: "Request information" },
    { value: "decline", label: "Decline" },
  ],
  needs_information: [{ value: "decline", label: "Decline" }],
  proposal_ready: [{ value: "cancel", label: "Cancel proposal" }],
  deposit_pending: [{ value: "cancel", label: "Cancel workflow" }],
  deposit_paid: [{ value: "schedule", label: "Confirm schedule" }],
  scheduled: [{ value: "begin_review", label: "Begin review" }],
  in_review: [
    { value: "remediation", label: "Open remediation" },
    { value: "request_balance", label: "Request final balance" },
  ],
  remediation: [{ value: "request_balance", label: "Request final balance" }],
  paid: [{ value: "complete", label: "Release final report" }],
  payment_refunded: [{ value: "cancel", label: "Acknowledge and close" }],
};

export function AdminReviewOrders({ initialOrders }: { initialOrders: AdminReviewOrderView[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  async function mutate(id: string, payload: Record<string, unknown>) {
    setPending(id);
    setNotice(null);
    try {
      const response = await fetch(`/api/v1/admin/review-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json() as {
        data?: { order?: AdminReviewOrderView };
        detail?: string;
        title?: string;
      };
      if (!response.ok || !body.data?.order) {
        throw new Error(body.title ?? body.detail ?? "The review action failed.");
      }
      setOrders((items) => items.map((item) => item.id === id ? body.data!.order! : item));
      setNotice({ kind: "success", message: "Review order updated and added to the audit trail." });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "The review action failed." });
    } finally {
      setPending(null);
    }
  }

  async function confirmManualPayment(order: AdminReviewOrderView) {
    const note = window.prompt(
      "After checking the transaction on Ethereum Mainnet, record what you verified: token, success status, exact recipient, and amount.",
    )?.trim();
    if (!note) return;
    if (note.length < 12) {
      setNotice({ kind: "error", message: "Record a meaningful manual check note of at least 12 characters." });
      return;
    }
    if (!window.confirm(`Record ${order.reference} as manually checked? This does not use automatic verification.`)) return;
    await mutate(order.id, { action: "confirm_payment_manually", note });
  }

  async function issueProposal(order: AdminReviewOrderView, form: HTMLFormElement) {
    const data = new FormData(form);
    const expiresAt = new Date(String(data.get("expiresAt") ?? ""));
    if (Number.isNaN(expiresAt.getTime())) {
      setNotice({ kind: "error", message: "Choose a valid proposal expiry date and time." });
      return;
    }
    await mutate(order.id, {
      action: "issue_proposal",
      scope: String(data.get("scope") ?? ""),
      exclusions: String(data.get("exclusions") ?? ""),
      reviewer: String(data.get("reviewer") ?? ""),
      expiresAt: expiresAt.toISOString(),
    });
  }

  async function refreshOrders() {
    const response = await fetch("/api/v1/admin/review-orders?limit=100", { cache: "no-store" });
    const body = await response.json() as { data?: { orders?: AdminReviewOrderView[] } };
    if (!response.ok || !body.data?.orders) {
      throw new Error("The updated review orders could not be loaded.");
    }
    setOrders(body.data.orders);
  }

  async function applyReconciliation(
    order: AdminReviewOrderView,
    paymentClaimId: string,
    form: HTMLFormElement,
  ) {
    const note = String(new FormData(form).get("note") ?? "").trim();
    if (note.length < 12) {
      setNotice({ kind: "error", message: "Record a meaningful decision note of at least 12 characters." });
      return;
    }
    if (!window.confirm(`Apply the finalized transfer to ${order.reference}? This creates an immutable payment record.`)) return;
    setPending(order.id);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/v1/admin/review-orders/${order.id}/payment-reconciliations/${paymentClaimId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": `payment-reconciliation-${order.id}-${paymentClaimId}-v1`,
          },
          body: JSON.stringify({ action: "apply_to_obligation", note }),
        },
      );
      const body = await response.json() as { title?: string; detail?: string };
      if (!response.ok) {
        throw new Error(body.title ?? body.detail ?? "The payment reconciliation failed.");
      }
      await refreshOrders();
      setNotice({ kind: "success", message: "The finalized transfer was applied and an immutable payment confirmation was created." });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "The payment reconciliation failed." });
    } finally {
      setPending(null);
    }
  }

  async function uploadDeliverable(order: AdminReviewOrderView, form: HTMLFormElement) {
    const data = new FormData(form);
    const file = data.get("file");
    const kind = String(data.get("kind") ?? "");
    if (!(file instanceof File) || file.size < 1) {
      setNotice({ kind: "error", message: "Choose a non-empty deliverable file." });
      return;
    }
    setPending(order.id);
    setNotice(null);
    try {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const sha256 = [...new Uint8Array(digest)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      const contentType = deliverableContentType(file);
      if (!contentType) {
        throw new Error("Choose a PDF, ZIP, JSON, or plain-text deliverable.");
      }
      const createResponse = await fetch(`/api/v1/admin/review-orders/${order.id}/deliverables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          fileName: file.name,
          contentType,
          sizeBytes: file.size,
          sha256,
        }),
      });
      const created = await createResponse.json() as {
        data?: {
          deliverable?: { id?: string };
          upload?: { method?: string; url?: string; headers?: Record<string, string> };
        };
        title?: string;
        detail?: string;
      };
      const deliverableId = created.data?.deliverable?.id;
      const upload = created.data?.upload;
      if (
        !createResponse.ok ||
        !deliverableId ||
        upload?.method !== "PUT" ||
        !upload.url ||
        !upload.headers
      ) {
        throw new Error(created.title ?? created.detail ?? "The secure upload could not be prepared.");
      }
      const uploadResponse = await fetch(upload.url, {
        method: "PUT",
        headers: upload.headers,
        body: file,
      });
      if (!uploadResponse.ok) {
        const failure = await uploadResponse.json() as { title?: string; detail?: string };
        throw new Error(failure.title ?? failure.detail ?? "The encrypted object upload failed.");
      }
      const finalizeResponse = await fetch(
        `/api/v1/admin/review-orders/${order.id}/deliverables/${deliverableId}/finalize`,
        { method: "POST" },
      );
      const finalized = await finalizeResponse.json() as { title?: string; detail?: string };
      if (!finalizeResponse.ok) {
        throw new Error(finalized.title ?? finalized.detail ?? "The uploaded file could not be verified.");
      }
      await refreshOrders();
      form.reset();
      setNotice({ kind: "success", message: "Deliverable uploaded to private R2 storage and its checksum verified." });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "The deliverable upload failed." });
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="admin-section" id="review-orders">
      <div className="admin-section-head">
        <div>
          <span className="section-kicker">Revenue operations</span>
          <h2>Smart contract and protocol release review orders</h2>
        </div>
        <small>{orders.length} most recent</small>
      </div>
      {notice ? (
        <div className="admin-notice" role={notice.kind === "error" ? "alert" : "status"}>
          {notice.message}
        </div>
      ) : null}
      <div className="admin-table">
        {orders.map((order) => {
          const actions = stateActions[order.status] ?? [];
          const canIssueProposalFromState = order.status === "qualification_pending" || order.status === "needs_information" || order.status === "proposal_ready";
          const canIssueProposal = canIssueProposalFromState && order.fixedPriceCommerceEligible;
          return (
            <article className="admin-row admin-review-order" key={order.id}>
              <div>
                <strong>{order.company}</strong>
                <small>{order.reference} · {order.targetChain}</small>
              </div>
              <p>
                <strong>{order.status.replaceAll("_", " ")}</strong><br />
                {order.nextAction ?? "No buyer action recorded."}
              </p>
              <details className="admin-review-application">
                <summary>Open request evidence</summary>
                <div className="admin-review-application-grid">
                  <dl>
                    <div><dt>Applicant</dt><dd>{order.application.contactName}</dd></div>
                    <div><dt>Email</dt><dd><a href={`mailto:${order.application.workEmail}`}>{order.application.workEmail}</a></dd></div>
                    <div><dt>Team</dt><dd>{order.application.teamType}</dd></div>
                    <div><dt>Affected components</dt><dd>{order.application.affectedContracts}</dd></div>
                    <div><dt>Changed lines</dt><dd>{order.application.changedLines ?? "Not supplied"}</dd></div>
                    <div><dt>Review materials ready on</dt><dd>{order.application.artifactReadyDate ?? "Not supplied"}</dd></div>
                    <div><dt>Target release</dt><dd>{order.application.targetReleaseDate ?? "Not supplied"}</dd></div>
                    <div><dt>Telegram</dt><dd>{order.application.telegramUsername ?? "Not supplied"}</dd></div>
                  </dl>
                  <article><span>Audited baseline</span><p>{order.application.auditedBaseline}</p></article>
                  <article><span>Proposed release</span><p>{order.application.proposedRelease}</p></article>
                  <article className="is-wide"><span>Declared change and invariants</span><p>{order.application.changeSummary}</p></article>
                  {order.application.website ? <article><span>Public website</span><p>{order.application.website}</p></article> : null}
                  {order.application.publicLinks ? <article><span>Public evidence links</span><p>{order.application.publicLinks}</p></article> : null}
                  {order.stablecoinPayment ? (
                    <article className="is-wide admin-payment-evidence">
                      <span>
                        {order.stablecoinPayment.claim?.state === "manual_review"
                          ? "Customer-submitted payment details · manual check required"
                          : "Ethereum payment evidence"}
                      </span>
                      <dl>
                        <div><dt>Phase</dt><dd>{order.stablecoinPayment.intent.phase}</dd></div>
                        <div><dt>Asset</dt><dd>{order.stablecoinPayment.intent.asset}</dd></div>
                        <div><dt>Exact amount</dt><dd>{order.stablecoinPayment.intent.tokenAmount}</dd></div>
                        <div><dt>Intent state</dt><dd>{order.stablecoinPayment.intent.state.replaceAll("_", " ")}</dd></div>
                        <div><dt>Claim state</dt><dd>{order.stablecoinPayment.claim?.state.replaceAll("_", " ") ?? "Not submitted"}</dd></div>
                        {order.stablecoinPayment.claim?.state === "manual_review"
                          ? <div><dt>Automatic verification</dt><dd>Off. Check this transfer manually before starting work.</dd></div>
                          : <div><dt>Confirmations</dt><dd>{order.stablecoinPayment.claim?.confirmations ?? 0}</dd></div>}
                      </dl>
                      {order.stablecoinPayment.claim ? (
                        <p>
                          <strong>{order.stablecoinPayment.claim.telegramUsername}</strong><br />
                          <code>{order.stablecoinPayment.claim.transactionHash}</code><br />
                          <a href={order.stablecoinPayment.claim.explorerUrl} rel="noreferrer" target="_blank">Inspect on Etherscan</a>
                        </p>
                      ) : null}
                    </article>
                  ) : null}
                  {(order.paymentConfirmations ?? []).map((confirmation) => (
                    <article className="is-wide admin-payment-evidence" key={confirmation.id}>
                      <span>Verified Ethereum payment · {confirmation.phase}</span>
                      <dl>
                        <div><dt>Received</dt><dd>{confirmation.receivedAmount} {confirmation.receivedAsset}</dd></div>
                        <div><dt>Record kind</dt><dd>{confirmation.recordKind.replaceAll("_", " ")}</dd></div>
                        <div><dt>Confirmations</dt><dd>{confirmation.confirmationsObserved} / {confirmation.confirmationsRequired}</dd></div>
                        <div><dt>RPC agreement</dt><dd>{confirmation.rpcAgreementCount} providers</dd></div>
                        <div><dt>Receipt</dt><dd>{confirmation.receiptReference}</dd></div>
                        <div>
                          <dt>Confirmed</dt>
                          <dd>
                            {confirmation.confirmedAt
                              ? <time dateTime={confirmation.confirmedAt}>{confirmation.confirmedAt}</time>
                              : "Unavailable"}
                          </dd>
                        </div>
                      </dl>
                      <p>
                        <code>{confirmation.transactionHash}</code><br />
                        <a href={confirmation.explorerUrl} rel="noreferrer" target="_blank">Inspect on Etherscan</a><br />
                        <small>Evidence SHA-256: {confirmation.evidenceHash}</small>
                      </p>
                    </article>
                  ))}
                  {(order.paymentReconciliations ?? []).map((reconciliation) => (
                    <article className="is-wide admin-payment-evidence" key={reconciliation.id}>
                      <span>Payment reconciliation · {reconciliation.caseType.replaceAll("_", " ")}</span>
                      <dl>
                        <div><dt>State</dt><dd>{reconciliation.state.replaceAll("_", " ")}</dd></div>
                        <div><dt>Phase</dt><dd>{reconciliation.phase}</dd></div>
                        <div><dt>Expected</dt><dd>{reconciliation.expected.amountDisplay} {reconciliation.expected.asset}</dd></div>
                        <div><dt>Observed</dt><dd>{reconciliation.observed.amountDisplay ?? "Unavailable"} {reconciliation.observed.asset ?? "unknown token"}</dd></div>
                        <div><dt>RPC agreement</dt><dd>{reconciliation.observed.rpcAgreementCount} providers</dd></div>
                        <div><dt>Confirmations</dt><dd>{reconciliation.observed.confirmations}</dd></div>
                      </dl>
                      <p>
                        <code>{reconciliation.transactionHash}</code><br />
                        <a href={reconciliation.explorerUrl} rel="noreferrer" target="_blank">Inspect on Etherscan</a><br />
                        <small>{reconciliation.eligibility.reason}</small>
                      </p>
                      {reconciliation.eligibility.canApplyToObligation && ["open", "investigating"].includes(reconciliation.state) ? (
                        <form
                          onSubmit={(event) => {
                            event.preventDefault();
                            void applyReconciliation(order, reconciliation.paymentClaimId, event.currentTarget);
                          }}
                        >
                          <label>
                            <span>Immutable operator decision note</span>
                            <textarea
                              maxLength={4000}
                              minLength={12}
                              name="note"
                              placeholder="Record why the finalized transfer satisfies this exact payment obligation."
                              required
                            />
                          </label>
                          <button className="button button-solid" disabled={pending === order.id} type="submit">
                            Apply finalized transfer to obligation
                          </button>
                        </form>
                      ) : null}
                      {reconciliation.resolution ? (
                        <p><strong>Resolution:</strong> {reconciliation.resolution.code.replaceAll("_", " ")}<br />{reconciliation.resolution.note}</p>
                      ) : null}
                    </article>
                  ))}
                  {order.deliverables.length ? (
                    <article className="is-wide admin-deliverables">
                      <span>Secure deliverables</span>
                      <ul>
                        {order.deliverables.map((deliverable) => (
                          <li key={deliverable.id}>
                            <strong>{deliverable.kind.replaceAll("_", " ")}</strong>{" "}
                            {deliverable.fileName} · {deliverable.state.replaceAll("_", " ")} · SHA-256 {deliverable.sha256.slice(0, 12)}…
                          </li>
                        ))}
                      </ul>
                    </article>
                  ) : null}
                </div>
              </details>
              {order.stablecoinPayment?.claim?.state === "manual_review" &&
                ["deposit_pending", "balance_due"].includes(order.status) ? (
                <div className="admin-review-actions">
                  <button
                    className="button button-solid"
                    disabled={pending === order.id}
                    onClick={() => void confirmManualPayment(order)}
                    type="button"
                  >
                    {pending === order.id ? "Saving manual check…" : "Confirm manually checked payment"}
                  </button>
                </div>
              ) : null}
              {["scheduled", "in_review", "remediation", "balance_due", "paid"].includes(order.status) ? (
                <form
                  className="admin-deliverable-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void uploadDeliverable(order, event.currentTarget);
                  }}
                >
                  <label>
                    <span>Deliverable type</span>
                    <select name="kind" required>
                      <option value="final_report">Final report</option>
                      <option value="manifest">Evidence manifest</option>
                      <option value="evidence_archive">Evidence archive</option>
                    </select>
                  </label>
                  <label>
                    <span>Verified file, maximum 90 MiB</span>
                    <input accept=".pdf,.zip,.json,.txt" name="file" required type="file" />
                  </label>
                  <button className="button button-outline" disabled={pending === order.id} type="submit">
                    Upload private deliverable
                  </button>
                </form>
              ) : null}
              {canIssueProposal ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void issueProposal(order, event.currentTarget);
                  }}
                >
                  <label>
                    <span>Included scope</span>
                    <textarea defaultValue="One stable upgrade to an already-audited or reviewed blockchain protocol on the stated target network." minLength={30} name="scope" required />
                  </label>
                  <label>
                    <span>Exclusions</span>
                    <textarea defaultValue="New protocol audit, custody, deployment, incident response, and work outside the frozen release boundary." minLength={20} name="exclusions" required />
                  </label>
                  <label>
                    <span>Named reviewer</span>
                    <input minLength={2} name="reviewer" required />
                  </label>
                  <label>
                    <span>Proposal expiry</span>
                    <input name="expiresAt" required type="datetime-local" />
                  </label>
                  <button className="button button-solid" disabled={pending === order.id} type="submit">
                    {order.status === "proposal_ready" ? "Reissue fixed $7,500 proposal" : "Issue fixed $7,500 proposal"}
                  </button>
                </form>
              ) : null}
              {canIssueProposalFromState && !order.fixedPriceCommerceEligible ? (
                <div className="admin-notice" role="note">
                  <strong>Supported target confirmation required.</strong>{" "}
                  {order.targetChain} is not a recognized review target. Request a
                  corrected network category before issuing the fixed $7,500
                  proposal or a $3,750 Ethereum payment instruction.
                  <button className="button button-solid" disabled type="button">
                    Fixed-price proposal unavailable
                  </button>
                </div>
              ) : null}
              {actions.length ? (
                <div className="admin-review-actions">
                  {actions.map((action) => (
                    <button
                      className="button button-outline"
                      disabled={pending === order.id}
                      key={action.value}
                      onClick={() => {
                        const highImpact = ["decline", "cancel", "request_balance", "complete"].includes(action.value);
                        if (highImpact && !window.confirm(`Confirm ${action.label.toLowerCase()} for ${order.reference}? This action is audited.`)) return;
                        void mutate(order.id, { action: action.value });
                      }}
                      type="button"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </article>
          );
        })}
        {orders.length === 0 ? <p className="admin-empty">No release review orders have been received.</p> : null}
      </div>
    </section>
  );
}

function deliverableContentType(file: File): string | null {
  const accepted = new Set([
    "application/pdf",
    "application/zip",
    "application/json",
    "text/plain",
  ]);
  const browserType = file.type.trim().toLowerCase();
  if (accepted.has(browserType)) return browserType;
  const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return extension === "pdf"
    ? "application/pdf"
    : extension === "zip"
      ? "application/zip"
      : extension === "json"
        ? "application/json"
        : extension === "txt"
          ? "text/plain"
          : null;
}
