"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { secureIdempotencyKey } from "@/lib/client/review-order-request";
import styles from "./review-workspace.module.css";

type ReviewStatus =
  | "qualification_pending"
  | "needs_information"
  | "proposal_ready"
  | "deposit_pending"
  | "deposit_paid"
  | "scheduled"
  | "in_review"
  | "remediation"
  | "balance_due"
  | "paid"
  | "payment_refunded"
  | "completed"
  | "declined"
  | "cancelled";

type ReviewOrder = {
  id: string;
  reference?: string;
  status: ReviewStatus | string;
  company?: string;
  targetChain?: string;
  createdAt?: string;
  updatedAt?: string;
  nextAction?: string | null;
  telegramUsername?: string | null;
  fixedPriceCommerceEligible?: boolean;
  proposal?: {
    id?: string;
    version?: number;
    status?: string;
    title?: string;
    scope?: string;
    exclusions?: string;
    reviewer?: string | null;
    currency?: string;
    totalAmount?: number;
    depositAmount?: number;
    balanceAmount?: number;
    expiresAt?: string;
    acceptedAt?: string | null;
  } | null;
  stablecoinPayment?: {
    intent: {
      id: string;
      phase: "deposit" | "balance";
      state: string;
      asset: "USDC" | "USDT";
      network: string;
      chainId: number;
      tokenContract: string;
      tokenDecimals: number;
      recipient: string;
      amount: number;
      currency: string;
      tokenAmount: string;
      amountAtomic: string;
      referenceUnits: number;
      proposalVersion: number;
      termsAcceptedAt: string;
      expiresAt: string;
      checkedAt: string;
      acceptingTransfers: boolean;
      acceptingClaims: boolean;
      claimSubmissionDeadline: string;
      createdAt: string;
      verifiedAt: string | null;
    };
    claim: {
      id: string;
      state: string;
      transactionHash: string;
      telegramUsername: string;
      failureCode: string | null;
      confirmations: number;
      submittedAt: string;
      verifiedAt: string | null;
      explorerUrl: string;
    } | null;
  } | null;
  paymentConfirmations: Array<{
    id: string;
    receiptReference: string;
    recordHash: string;
    recordKind: "exact_match" | "reconciliation";
    phase: "deposit" | "balance";
    expectedAsset: "USDC" | "USDT";
    receivedAsset: "USDC" | "USDT";
    receivedTokenContract: string;
    recipient: string;
    sender: string;
    expectedAmountAtomic: string;
    receivedAmountAtomic: string;
    receivedAmount: string;
    obligationAmount: number;
    obligationCurrency: string;
    transactionHash: string;
    explorerUrl: string;
    blockNumber: string;
    blockHash: string;
    logIndex: string;
    blockTimestamp: string;
    confirmationsObserved: number;
    confirmationsRequired: number;
    rpcAgreementCount: number;
    evidenceHash: string;
    proposalVersion: number;
    termsVersion: string;
    termsHash: string;
    termsAcceptedAt: string;
    confirmedAt: string;
    recordedAt: string;
    recordedBy: "verifier" | "operator";
    notice: string;
  }>;
  deliverables: Array<{
    id: string;
    kind: "final_report" | "evidence_archive" | "manifest";
    state: "released";
    fileName: string;
    contentType: string;
    sizeBytes: number;
    sha256: string;
    releasedAt: string | null;
  }>;
};

type ReviewEnvelope = {
  data?: {
    order?: ReviewOrder;
    payment?: ReviewOrder["stablecoinPayment"];
    configuration?: {
      paymentExperience?: "manual_ethereum" | "ethereum_mainnet" | "unavailable";
      verificationReady?: boolean;
      confirmationsRequired?: number;
      explorerTxBase?: string;
      seller?: string;
      verification?: string;
    };
  } & Partial<ReviewOrder>;
  title?: string;
  detail?: string;
  requestId?: string;
  code?: string;
};

const REVIEW_REQUEST_TIMEOUT_MS = 15_000;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

async function readReviewEnvelope(response: Response) {
  try {
    const body = await response.json();
    return body && typeof body === "object"
      ? (body as ReviewEnvelope)
      : ({} as ReviewEnvelope);
  } catch {
    return {} as ReviewEnvelope;
  }
}

function reviewResponseError(
  response: Response,
  body: ReviewEnvelope,
  fallback: string,
) {
  const message = body.title ?? body.detail ?? fallback;
  const candidate = body.requestId ?? response.headers.get("x-request-id") ?? "";
  return REQUEST_ID_PATTERN.test(candidate)
    ? `${message} Request ID: ${candidate}.`
    : message;
}

async function fetchReviewEnvelope(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    REVIEW_REQUEST_TIMEOUT_MS,
  );
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    return { response, body: await readReviewEnvelope(response) };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        "The browser did not receive a response within 15 seconds. Reload the private record before retrying because the server remains authoritative.",
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

const statusCopy: Record<string, { label: string; title: string; copy: string; step: number; tone: string }> = {
  qualification_pending: {
    label: "Complete order details",
    title: "Update the form to open direct checkout.",
    copy: "This older request does not contain the complete bounded scope required for the current service. Create a new order with 1 to 8 affected contracts, programs, or modules and 1 to 500 materially changed code lines. You can then accept the terms and pay immediately, without waiting for Nodezuno approval.",
    step: 1,
    tone: "pending",
  },
  needs_information: {
    label: "Information needed",
    title: "One clarification is needed before work can continue.",
    copy: "Reply through the private contact route provided by Nodezuno. Do not send private code or credentials until an approved secure channel is open.",
    step: 1,
    tone: "attention",
  },
  proposal_ready: {
    label: "Ready for payment",
    title: "Your fixed-price service order is ready.",
    copy: "Review the generated scope and exclusions, accept the service terms, choose USDC or USDT, and continue directly to the scheduling deposit shown in your order.",
    step: 2,
    tone: "ready",
  },
  deposit_pending: {
    label: "Payment in progress",
    title: "Send the exact stablecoin amount and submit its transaction hash.",
    copy: "Only verified Ethereum mainnet evidence can credit the scheduling deposit. A pasted hash, screenshot, or Etherscan page is not enough by itself.",
    step: 3,
    tone: "attention",
  },
  deposit_paid: {
    label: "Payment confirmed",
    title: "Your scheduling payment is confirmed.",
    copy: "Nodezuno has recorded the scheduling payment against this service order. Check your email for the confirmation and next steps. Nodezuno will confirm material readiness, scope, conflicts, and reviewer availability before the review clock begins.",
    step: 4,
    tone: "ready",
  },
  scheduled: {
    label: "Scheduled",
    title: "The review window and reviewer are confirmed.",
    copy: "The delivery target begins from the recorded readiness confirmation, not from the original application or checkout date.",
    step: 4,
    tone: "ready",
  },
  in_review: {
    label: "In review",
    title: "Code review and reproducible testing are active.",
    copy: "Nodezuno is evaluating the exact agreed release boundary. The customer remains the sole release authority.",
    step: 4,
    tone: "active",
  },
  remediation: {
    label: "Remediation",
    title: "A finding needs correction or verification.",
    copy: "The agreed remediation pass is active. Scope changes may require a revised service order or schedule.",
    step: 4,
    tone: "attention",
  },
  balance_due: {
    label: "Final payment due",
    title: "The contractual balance is due before report release.",
    copy: "Use only the exact payment instruction issued inside this portal. A screenshot, Telegram message, or URL parameter never marks an invoice paid.",
    step: 4,
    tone: "attention",
  },
  paid: {
    label: "Paid",
    title: "Required payments are confirmed.",
    copy: "Nodezuno has recorded the required payments against this service order. The final review package will be released according to the accepted scope and delivery state.",
    step: 4,
    tone: "ready",
  },
  payment_refunded: {
    label: "Payment refunded",
    title: "A recorded payment was refunded.",
    copy: "Do not reuse an old payment instruction. Contact Nodezuno with this review reference so the engagement state can be reconciled safely.",
    step: 3,
    tone: "attention",
  },
  completed: {
    label: "Completed",
    title: "The final review package has been released.",
    copy: "Preserve the exact reviewed code, files, and recommendation as the starting point for future changes.",
    step: 4,
    tone: "ready",
  },
  declined: {
    label: "Not accepted",
    title: "Nodezuno cannot responsibly accept this review.",
    copy: "No payment was requested. The decision can reflect scope, expertise, conflicts, readiness, capacity, or another engagement boundary.",
    step: 1,
    tone: "closed",
  },
  cancelled: {
    label: "Cancelled",
    title: "This workflow is no longer active.",
    copy: "Any payment, refund, retention, or delivery obligation is controlled by the accepted written terms.",
    step: 1,
    tone: "closed",
  },
};

function money(amount: number | undefined, currency = "USD") {
  if (!Number.isFinite(amount)) return "Not issued";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format((amount ?? 0) / 100);
}

function date(value: string | null | undefined) {
  if (!value) return "Not set";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Not set"
    : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function safeReceiptUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" &&
      parsed.hostname === "etherscan.io" &&
      /^\/tx\/0x[0-9a-f]{64}$/i.test(parsed.pathname) &&
      !parsed.search &&
      !parsed.hash
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function paymentPhaseForStatus(
  status: ReviewStatus | string,
): "deposit" | "balance" | null {
  if (
    [
      "proposal_ready",
      "deposit_pending",
      "deposit_paid",
      "scheduled",
      "in_review",
      "remediation",
    ].includes(status)
  ) {
    return "deposit";
  }
  if (["balance_due", "paid", "completed"].includes(status)) {
    return "balance";
  }
  return null;
}

function readAccessToken() {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  return hash.get("access");
}

const claimCopy: Record<string, { label: string; title: string; copy: string }> = {
  submitted: {
    label: "Transaction submitted",
    title: "The transaction is queued for independent verification.",
    copy: "Do not send a second transfer. Submission does not mean the payment has been credited.",
  },
  checking: {
    label: "Checking Ethereum",
    title: "The receipt and token transfer are being checked.",
    copy: "Nodezuno is validating the official token contract, exact recipient, exact amount, canonical block, and finality.",
  },
  confirming: {
    label: "Confirming",
    title: "The transfer was found and is waiting for finality.",
    copy: "This page refreshes automatically. The order remains unpaid until every verification rule passes.",
  },
  verified: {
    label: "Verified",
    title: "Ethereum evidence confirms this payment.",
    copy: "The exact server-issued transfer reached the Nodezuno wallet and passed finality checks.",
  },
  manual_review: {
    label: "Manual check pending",
    title: "We received your transaction details.",
    copy: "This is not confirmation that funds arrived. Sanjay will check the transfer manually and contact you by email or Telegram. Do not send another transfer.",
  },
  rejected: {
    label: "Not verified",
    title: "This transaction does not match the issued instruction.",
    copy: "Review the network, token contract, recipient, and exact amount before submitting another transaction.",
  },
};

const paymentFailureCopy: Record<string, string> = {
  amount_mismatch: "Funds reached the Nodezuno wallet, but the amount differs from the issued instruction. Operator reconciliation is required. Do not send another transfer.",
  asset_mismatch: "Funds reached the Nodezuno wallet in a different official stablecoin. Operator reconciliation is required. Do not send another transfer.",
  recipient_mismatch: "The selected token was transferred to a different recipient.",
  token_transfer_not_found: "No matching official token transfer was found in this transaction.",
  transaction_failed: "The Ethereum transaction reverted or failed.",
  transfer_predates_instruction: "The transaction was mined before this payment instruction was issued.",
  transfer_after_expiry: "Funds reached the Nodezuno wallet after this instruction expired. Operator reconciliation is required. Do not send another transfer.",
  transfer_ambiguous: "The receipt contains more than one seller-directed transfer. Operator reconciliation is required. Do not send another transfer.",
};

export function ReviewOrderExperience({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<ReviewOrder | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [expiredIntentId, setExpiredIntentId] = useState<string | null>(null);
  const [closedClaimsIntentId, setClosedClaimsIntentId] = useState<string | null>(null);
  const [paymentPending, setPaymentPending] = useState(false);
  const [claimPending, setClaimPending] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [asset, setAsset] = useState<"USDC" | "USDT">("USDC");
  const [transactionHash, setTransactionHash] = useState("");
  const [telegramUsername, setTelegramUsername] = useState("");
  const [copiedField, setCopiedField] = useState<"amount" | "recipient" | null>(null);
  const [confirmationsRequired, setConfirmationsRequired] = useState(12);
  const [paymentExperience, setPaymentExperience] = useState<
    "manual_ethereum" | "ethereum_mainnet" | "unavailable"
  >("unavailable");
  const accessToken = useRef<string | null>(null);
  const claimErrorRef = useRef<HTMLParagraphElement>(null);
  const paymentInstructionErrorRef = useRef<HTMLParagraphElement>(null);
  const readInFlight = useRef(false);
  const mutationInFlight = useRef(false);
  const readVersion = useRef(0);
  const paymentRequestKey = useRef<{ scope: string; key: string } | null>(null);

  const fetchOrder = useCallback(async (token: string | null, background = false) => {
    if (readInFlight.current || mutationInFlight.current) return;
    readInFlight.current = true;
    const version = ++readVersion.current;
    if (background) setRefreshing(true);
    try {
      if (token) {
        const { response: exchangeResponse, body: exchangeBody } = await fetchReviewEnvelope(
          `/api/v1/review-orders/${encodeURIComponent(orderId)}/access`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({ accessToken: token }),
          },
        );
        if (!exchangeResponse.ok) {
          throw new Error(
            reviewResponseError(
              exchangeResponse,
              exchangeBody,
              "This private review link is invalid or expired.",
            ),
          );
        }
        window.history.replaceState(null, "", window.location.pathname);
        accessToken.current = null;
      }
      const { response, body } = await fetchReviewEnvelope(`/api/v1/review-orders/${encodeURIComponent(orderId)}`, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const loaded = body.data?.order ?? body.data;
      if (!response.ok || !loaded?.id || !loaded.status) {
        throw new Error(
          reviewResponseError(
            response,
            body,
            "This private service order is unavailable.",
          ),
        );
      }
      // A response started before a mutation must not replace its newer state.
      if (version !== readVersion.current) return;
      setOrder(loaded as ReviewOrder);
      setTelegramUsername((current) => current || (loaded as ReviewOrder).telegramUsername || "");
      setPaymentExperience(body.data?.configuration?.paymentExperience ?? "unavailable");
      setConfirmationsRequired(body.data?.configuration?.confirmationsRequired ?? 12);
      if (!background) setError(null);
      setRefreshError(null);
      setLastChecked(new Date().toISOString());
      setState("ready");
    } catch (caught) {
      if (version !== readVersion.current) return;
      const message = caught instanceof Error ? caught.message : "This private service order is unavailable.";
      if (background) setRefreshError(message);
      else { setState("error"); setError(message); }
    } finally {
      readInFlight.current = false;
      setRefreshing(false);
    }
  }, [orderId]);

  useEffect(() => {
    const token = readAccessToken();
    accessToken.current = token;
    const task = window.setTimeout(() => void fetchOrder(token), 0);
    return () => window.clearTimeout(task);
  }, [fetchOrder]);

  useEffect(() => {
    const claimState = order?.stablecoinPayment?.claim?.state;
    if (!claimState || !["submitted", "checking", "confirming"].includes(claimState)) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void fetchOrder(null, true);
    };
    const timer = window.setInterval(refreshWhenVisible, 15_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [fetchOrder, order?.stablecoinPayment?.claim?.state]);

  const displayedIntent = order?.stablecoinPayment?.intent;
  useEffect(() => {
    if (!displayedIntent || (!displayedIntent.acceptingTransfers && !displayedIntent.acceptingClaims)) return;
    // Use the server's clock to calculate validity, not the buyer's clock.
    const deadline = displayedIntent.acceptingTransfers ? displayedIntent.expiresAt : displayedIntent.claimSubmissionDeadline;
    const remaining = Date.parse(deadline) - Date.parse(displayedIntent.checkedAt);
    const timer = window.setTimeout(() => {
      if (displayedIntent.acceptingTransfers) setExpiredIntentId(displayedIntent.id);
      else setClosedClaimsIntentId(displayedIntent.id);
      void fetchOrder(null, true);
    }, Number.isFinite(remaining) ? Math.max(0, remaining) : 0);
    return () => window.clearTimeout(timer);
  }, [displayedIntent, fetchOrder]);

  const presentation = useMemo(() => {
    const current = statusCopy[order?.status ?? ""] ?? statusCopy.qualification_pending;
    if (paymentExperience !== "manual_ethereum") return current;
    if (order?.status === "deposit_paid") {
      return {
        ...current,
        label: "Payment checked manually",
        title: "Sanjay checked your scheduling payment.",
        copy: "Your payment was checked manually and recorded against this order. Automatic verification was not used. Check your email for the next steps. The review schedule begins only after the required files, scope, and reviewer availability are confirmed.",
      };
    }
    if (order?.status === "paid") {
      return {
        ...current,
        label: "Payments checked manually",
        title: "Your payments have been checked and recorded.",
        copy: "Sanjay checked the submitted Ethereum transactions manually. Automatic verification was not used. Final delivery follows the accepted service order.",
      };
    }
    return current;
  }, [order?.status, paymentExperience]);

  async function beginPayment() {
    if (!termsAccepted || !order?.proposal?.version || mutationInFlight.current) return;
    mutationInFlight.current = true;
    readVersion.current += 1;
    setPaymentPending(true);
    setError(null);
    try {
      const phase = order.status === "balance_due" ? "balance" : "deposit";
      const scope = `${order.id}-${phase}-${order.proposal.version}-${asset}`;
      if (paymentRequestKey.current?.scope !== scope) {
        paymentRequestKey.current = { scope, key: secureIdempotencyKey() };
      }
      if (paymentExperience === "unavailable") {
        throw new Error(
          "Payment instructions are not enabled for this deployment. Nothing was accepted or charged.",
        );
      }
      const { response, body } = await fetchReviewEnvelope(`/api/v1/review-orders/${encodeURIComponent(orderId)}/payment-intents`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Idempotency-Key": paymentRequestKey.current.key,
        },
        body: JSON.stringify({
          acceptTerms: true,
          proposalVersion: order?.proposal?.version,
          phase,
          asset,
        }),
      });
      if (!response.ok || !body.data?.payment?.intent) {
        if (body.code === "payment_instruction_expired") paymentRequestKey.current = null;
        throw new Error(
          reviewResponseError(
            response,
            body,
            "Ethereum payment instructions could not be created.",
          ),
        );
      }
      setOrder((current) => body.data?.order ?? (current ? { ...current, stablecoinPayment: body.data?.payment } : current));
      setConfirmationsRequired(body.data.configuration?.confirmationsRequired ?? 12);
      setTermsAccepted(true);
      paymentRequestKey.current = null;
      setRefreshError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ethereum payment instructions could not be created.");
      requestAnimationFrame(() => paymentInstructionErrorRef.current?.focus());
    } finally {
      mutationInFlight.current = false;
      setPaymentPending(false);
    }
  }

  async function submitClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const intent = order?.stablecoinPayment?.intent;
    if (!intent || !intent.acceptingClaims || mutationInFlight.current) return;
    mutationInFlight.current = true;
    readVersion.current += 1;
    setClaimPending(true);
    setError(null);
    try {
      const { response, body } = await fetchReviewEnvelope(
        `/api/v1/review-orders/${encodeURIComponent(orderId)}/payment-intents/${encodeURIComponent(intent.id)}/claims`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ transactionHash: transactionHash.trim(), telegramUsername: telegramUsername.trim() }),
        },
      );
      if (!response.ok || !body.data?.payment?.claim) {
        throw new Error(
          reviewResponseError(
            response,
            body,
            "The transaction could not be submitted for verification.",
          ),
        );
      }
      setOrder((current) => current ? {
        ...current,
        telegramUsername: body.data?.payment?.claim?.telegramUsername ?? current.telegramUsername,
        stablecoinPayment: body.data?.payment,
      } : current);
      setConfirmationsRequired(body.data.configuration?.confirmationsRequired ?? confirmationsRequired);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The transaction could not be submitted for verification.");
      requestAnimationFrame(() => claimErrorRef.current?.focus());
    } finally {
      mutationInFlight.current = false;
      setClaimPending(false);
    }
  }

  async function copyValue(label: "amount" | "recipient", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(label);
      window.setTimeout(() => setCopiedField((current) => current === label ? null : current), 1_800);
    } catch {
      setError("Copy was blocked by this browser. Select the complete value manually.");
      requestAnimationFrame(() => claimErrorRef.current?.focus());
    }
  }

  if (state === "loading") {
    return (
      <main className="review-flow" id="main-content">
        <section className="review-loading" aria-live="polite">
          <span className="review-loader" aria-hidden="true" />
          <p>Opening the private review record...</p>
        </section>
      </main>
    );
  }

  if (state === "error" || !order) {
    return (
      <main className="review-flow" id="main-content">
        <section className="review-error-card" aria-labelledby="review-error-title">
          <span className="review-overline">PRIVATE REVIEW PORTAL</span>
          <h1 id="review-error-title">This review link could not be opened.</h1>
          <p>{error}</p>
          <div>
            <button className="review-submit" onClick={() => { setState("loading"); void fetchOrder(readAccessToken()); }} type="button">Try again</button>
            <Link href="/review/start">Start another review request</Link>
          </div>
        </section>
      </main>
    );
  }

  const canPay = order.fixedPriceCommerceEligible === true && (
    order.status === "proposal_ready" ||
    order.status === "deposit_pending" ||
    order.status === "balance_due"
  );
  const reference = order.reference ?? `NZ-${order.id.slice(0, 8).toUpperCase()}`;
  const currency = order.proposal?.currency ?? "USD";
  const paymentAmount = order.status === "balance_due"
    ? order.proposal?.balanceAmount
    : order.proposal?.depositAmount;
  const stablecoin = order.stablecoinPayment;
  const intent = stablecoin?.intent ?? null;
  const claim = stablecoin?.claim ?? null;
  const showClaimForm = Boolean(intent?.acceptingClaims) && intent?.id !== closedClaimsIntentId && (!claim || claim.state === "rejected");
  const maySendTransfer = Boolean(intent?.acceptingTransfers) && intent?.id !== expiredIntentId;
  const paymentConfirmations = order.paymentConfirmations ?? [];
  const displayedPaymentPhase = paymentPhaseForStatus(order.status);
  const manualPaymentRecorded = paymentExperience === "manual_ethereum" && (
    displayedPaymentPhase === "deposit"
      ? ["deposit_paid", "scheduled", "in_review", "remediation", "balance_due", "paid", "completed"].includes(order.status)
      : displayedPaymentPhase === "balance" && ["paid", "completed"].includes(order.status)
  );
  const phaseConfirmation = displayedPaymentPhase
    ? [...paymentConfirmations].reverse().find(
        (item) => item.phase === displayedPaymentPhase,
      ) ?? null
    : null;
  const currentConfirmation = claim && displayedPaymentPhase
    ? paymentConfirmations.find(
        (item) =>
          item.phase === displayedPaymentPhase &&
          item.transactionHash === claim.transactionHash,
      ) ?? null
    : null;
  const claimPresentation = claim && !currentConfirmation && !manualPaymentRecorded
    ? claim.state === "manual_review" && paymentExperience === "manual_ethereum"
      ? {
        label: "Manual check pending",
        title: "We received your transaction details.",
        copy: "This is not confirmation that funds arrived. Sanjay will check the transfer manually and contact you by email or Telegram. Do not send another transfer.",
      }
      : claimCopy[claim.state] ?? claimCopy.submitted
    : null;
  const receiptUrl = safeReceiptUrl(claim?.explorerUrl);
  const isBalancePayment = displayedPaymentPhase === "balance";
  const ethereumVerified = Boolean(
    intent &&
    intent.phase === displayedPaymentPhase &&
    claim?.state === "verified",
  );
  const paymentVerified = Boolean(phaseConfirmation) || ethereumVerified;
  const paymentRecorded = paymentVerified || manualPaymentRecorded;
  const progressStep = order.status === "proposal_ready"
    ? 2
    : order.status === "deposit_pending"
      ? claim && ["submitted", "checking", "confirming", "manual_review"].includes(claim.state)
        ? 3
        : 2
      : order.status === "deposit_paid"
        ? 3
      : ["qualification_pending", "needs_information", "declined", "cancelled"].includes(order.status)
        ? 1
        : 4;

  return (
    <main className={`review-flow ${styles.portal}`} id="main-content">
      <section className="review-portal-shell">
        <header className="review-portal-header">
          <div>
            <span className="review-overline">PRIVATE REVIEW PORTAL</span>
            <h1>{order.company ?? "Smart contract or protocol release review"}</h1>
            <p>{reference} <span aria-hidden="true">·</span> {order.targetChain ?? "Target network"}</p>
          </div>
          <div className={styles.portalTools}>
            <Link href="/security">Privacy and security</Link>
            <button disabled={refreshing || paymentPending || claimPending} onClick={() => void fetchOrder(null, true)} type="button">{refreshing ? "Refreshing…" : "Refresh status"}</button>
          </div>
        </header>
        <p aria-live="polite" className={styles.syncStatus}>{lastChecked ? `Last checked ${date(lastChecked)}. ${paymentExperience === "manual_ethereum" ? "Use Refresh status to check for updates. Submitted transfers are checked by a person, not automatically." : "Payment verification updates automatically while this tab is visible."}` : "Loading the latest order status."}</p>
        {refreshError ? <p className={styles.syncWarning} role="status">The latest status could not be loaded. The details below may be out of date. Do not send another transfer. {refreshError}</p> : null}

        <ol className="review-progress" aria-label="Service order progress">
          {["Details", "Payment", "Payment check", "Work"].map((label, index) => (
            <li aria-current={index + 1 === progressStep ? "step" : undefined} className={index + 1 < progressStep ? "is-complete" : index + 1 === progressStep ? "is-current" : ""} key={label}>
              <span>{index + 1 < progressStep ? "✓" : String(index + 1).padStart(2, "0")}</span>
              <strong>{label}</strong>
            </li>
          ))}
        </ol>

        <section className={`review-state-card is-${presentation.tone}`} aria-labelledby="review-state-title">
          <div>
            <span>{presentation.label}</span>
            <h2 id="review-state-title">{order.status === "deposit_pending" && intent && !maySendTransfer
              ? claim && claim.state !== "rejected"
                ? paymentExperience === "manual_ethereum" ? "Your transaction details are awaiting a manual check." : "Your transaction is being verified."
                : "Check your payment instruction before continuing."
              : presentation.title}</h2>
            <p>{presentation.copy}</p>
            {order.nextAction ? <p className="review-next-action"><strong>Next action:</strong> {intent && !maySendTransfer && !paymentRecorded ? "Do not send another transfer. Follow the transaction instructions below or refresh the latest status." : order.nextAction}</p> : null}
            {order.status === "qualification_pending" && !order.proposal ? (
              <Link className="button button-solid" href="/review/start">Complete order details <span aria-hidden="true">↗</span></Link>
            ) : null}
          </div>
          <dl>
            <div><dt>Reference</dt><dd>{reference}</dd></div>
            <div><dt>Last updated</dt><dd>{date(order.updatedAt ?? order.createdAt)}</dd></div>
          </dl>
        </section>

        {order.proposal ? (
          <section className="review-proposal" aria-labelledby="review-proposal-title">
            <header>
              <div>
                <span className="review-overline">FIXED SERVICE ORDER</span>
                <h2 id="review-proposal-title">{order.proposal.title ?? "Smart contract and protocol release security review"}</h2>
              </div>
              <span className="review-proposal-state">{order.proposal.status === "accepted" ? "Accepted" : "Ready"}</span>
            </header>
            <div className="review-proposal-grid">
              <article>
                <span>INCLUDED SCOPE</span>
                <p>{order.proposal.scope ?? "See the fixed scope recorded with this service order."}</p>
              </article>
              <article>
                <span>EXCLUSIONS</span>
                <p>{order.proposal.exclusions ?? "Work outside the exact accepted boundary requires written change control."}</p>
              </article>
            </div>
            <dl className="review-commercials">
              <div><dt>Total</dt><dd>{money(order.proposal.totalAmount, currency)}</dd></div>
              <div><dt>Scheduling deposit</dt><dd>{money(order.proposal.depositAmount, currency)}</dd></div>
              <div><dt>Remaining balance</dt><dd>{money(order.proposal.balanceAmount, currency)}</dd></div>
              <div><dt>Checkout expires</dt><dd>{date(order.proposal.expiresAt)}</dd></div>
            </dl>
            {!order.fixedPriceCommerceEligible ? (
              <div className="review-payment-mode-note is-unavailable" role="note">
                <strong>Target confirmation required</strong>
                <span>
                  This order has an unrecognized target classification. Nodezuno
                  must correct the target before the fixed service order can
                  create a new Ethereum payment instruction.
                </span>
              </div>
            ) : null}
            {canPay && !intent ? (
              <div className="review-checkout-panel review-asset-start">
                <div>
                  <span>{order.status === "balance_due" ? "FINAL BALANCE" : "SCHEDULING DEPOSIT"}</span>
                  <strong>{money(paymentAmount, currency)}</strong>
                  <p>
                    {paymentExperience === "manual_ethereum"
                      ? "Pay with USDC or USDT on Ethereum Mainnet only. Nodezuno checks submitted transfers manually and will contact you after reviewing the transaction details."
                      : paymentExperience === "ethereum_mainnet"
                      ? "Pay with USDC or USDT on Ethereum Mainnet only. The next step shows the exact amount and the recipient wallet address. No wallet connection or third-party checkout is used."
                      : "Live payment instructions are not enabled for this deployment. The service order remains unchanged and no payment can be accepted here."}
                  </p>
                </div>
                <div className="review-checkout-action">
                  {paymentExperience !== "unavailable" ? (
                    <fieldset className="review-token-picker">
                      <legend>Choose the Ethereum token</legend>
                      <label className={asset === "USDC" ? "is-selected" : ""}>
                        <input checked={asset === "USDC"} name="paymentAsset" onChange={() => setAsset("USDC")} type="radio" value="USDC" />
                        <span><strong>USDC</strong><small>Ethereum Mainnet only</small></span>
                      </label>
                      <label className={asset === "USDT" ? "is-selected" : ""}>
                        <input checked={asset === "USDT"} name="paymentAsset" onChange={() => setAsset("USDT")} type="radio" value="USDT" />
                        <span><strong>USDT</strong><small>Ethereum Mainnet only</small></span>
                      </label>
                    </fieldset>
                  ) : (
                    <div className="review-payment-mode-note is-unavailable" role="note">
                      <strong>Live payment is not enabled</strong>
                      <span>
                        Payment instructions are not enabled for this deployment.
                      </span>
                    </div>
                  )}
                  <label className="review-consent">
                    <input checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} type="checkbox" />
                    <span>
                      I accept fixed service order version {order.proposal.version} and the{" "}
                      <Link href="/legal/terms" rel="noreferrer" target="_blank">Nodezuno service terms</Link>.
                    </span>
                  </label>
                  <button aria-describedby={error ? "payment-instruction-error" : undefined} className="review-submit" disabled={paymentPending || !termsAccepted || !order.proposal?.version || paymentExperience === "unavailable"} onClick={() => void beginPayment()} type="button">
                    {paymentPending
                      ? "Creating exact instruction..."
                      : paymentExperience !== "unavailable"
                        ? "Accept terms and view payment instructions"
                        : "Live payment not enabled"}
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {intent ? (
          <section className="review-crypto-payment" aria-labelledby="crypto-payment-title">
            <header>
              <div>
                <span className="review-overline">ETHEREUM MAINNET PAYMENT</span>
                <h2 id="crypto-payment-title">{maySendTransfer && !paymentRecorded ? "Your payment instructions." : "Your payment record."}</h2>
                <p>
                  {intent.asset} on Ethereum Mainnet. Order {reference}. Transfer deadline: {date(intent.expiresAt)}.
                </p>
              </div>
              <span className="review-network-badge"><i aria-hidden="true" /> Chain ID {intent.chainId}</span>
            </header>

            {maySendTransfer && !paymentRecorded && !refreshError ? <>
            <section className="review-payment-recipient" aria-labelledby="payment-recipient-title">
              <h3 id="payment-recipient-title">Recipient address</h3>
              <p id="payment-recipient-help">Send {intent.asset} on Ethereum Mainnet to this Nodezuno wallet only.</p>
              <div className="review-payment-recipient-value">
                <code dir="ltr">{intent.recipient}</code>
                <button
                  aria-describedby="payment-recipient-help"
                  aria-label="Copy recipient wallet address"
                  onClick={() => void copyValue("recipient", intent.recipient)}
                  type="button"
                >
                  {copiedField === "recipient" ? "Recipient copied" : "Copy recipient address"}
                </button>
              </div>
              <p className="review-payment-recipient-note">This is the payment destination. Never send funds to a token contract address.</p>
            </section>

            <div className="review-payment-amount">
              <span>EXACT ONCHAIN AMOUNT</span>
              <strong>{intent.tokenAmount} <small>{intent.asset}</small></strong>
              <p>
                The fractional digits are a unique order reference smaller than one cent. They prevent another public transaction from being credited to this order. Do not round the amount.
              </p>
              <button aria-label={`Copy exact ${intent.asset} amount`} onClick={() => void copyValue("amount", intent.tokenAmount)} type="button">
                {copiedField === "amount" ? "Copied" : "Copy exact amount"}
              </button>
            </div>

            <dl className="review-payment-instructions">
              <div>
                <dt>Network</dt>
                <dd><code>Ethereum Mainnet</code><span>Not Base, Arbitrum, Polygon, BNB Chain, or another network</span></dd>
              </div>
              <div>
                <dt>Seller</dt>
                <dd><span>Sanjay Sudagani, sole proprietor trading as Nodezuno</span></dd>
              </div>
            </dl>

            <div className="review-payment-warning" id="payment-safety-warning" role="note">
              <strong>Check every field before sending.</strong>
              <p>
                Send no ETH, bridged tokens, lookalike tokens, or assets on another network. Wrong-network, wrong-token, wrong-address, or rounded transfers may be unrecoverable. Nodezuno will never ask for your seed phrase or private key.
              </p>
              <p>Your wallet may require ETH for its network fee. That gas fee is separate and must not be added to the amount sent to Nodezuno.</p>
            </div>
            </> : (
              <div className={styles.paymentNotice} id="payment-safety-warning" role="note">
                <h3>{manualPaymentRecorded ? "Payment checked manually. Do not send another payment." : paymentVerified ? "Payment received. Do not pay again." : claim && claim.state !== "rejected" ? paymentExperience === "manual_ethereum" ? "Transaction details received. Do not pay again." : "Your transaction is being handled. Do not pay again." : "Do not send funds using this instruction."}</h3>
                <p>{showClaimForm
                  ? `If you already sent the transfer, submit its original transaction hash below before ${date(intent.claimSubmissionDeadline)}. This window is for evidence only, not for sending a new payment.`
                  : manualPaymentRecorded ? "Sanjay checked the submitted Ethereum transfer manually and recorded it against this order. Automatic verification was not used. Check your email for the next steps."
                    : paymentVerified ? "Keep the confirmation record below with your order. You do not need to submit this payment again."
                    : "Refresh the status to check the latest result. If you sent a transfer but cannot submit its hash, contact info@nodezuno.com with your order reference. Do not send a replacement payment."}</p>
                {!paymentRecorded && !showClaimForm && (!claim || claim.state === "rejected") ? <p><a href="mailto:info@nodezuno.com">Contact payment support</a></p> : null}
              </div>
            )}

            {manualPaymentRecorded && claim ? (
              <section className={`review-claim-status is-manual`} aria-labelledby="manual-payment-status-title">
                <div>
                  <span>Manual check recorded</span>
                  <h3 id="manual-payment-status-title">This payment is recorded on your service order.</h3>
                  <p>Sanjay checked the submitted transaction manually. This is an operator record, not automatic onchain verification.</p>
                </div>
                <dl>
                  <div><dt>Check method</dt><dd>Manual</dd></div>
                  <div><dt>Transaction</dt><dd><code dir="ltr">{claim.transactionHash}</code></dd></div>
                </dl>
                {receiptUrl ? <a href={receiptUrl} rel="noreferrer" target="_blank">View transaction on Etherscan <span aria-hidden="true">↗</span></a> : null}
              </section>
            ) : null}

            {claim && claimPresentation ? (
              <section className={`review-claim-status is-${claim.state}`} aria-live="polite" aria-labelledby="claim-status-title">
                <div>
                  <span>{claimPresentation.label}</span>
                  <h3 id="claim-status-title">{claimPresentation.title}</h3>
                  <p>{paymentFailureCopy[claim.failureCode ?? ""] ?? claimPresentation.copy}</p>
                </div>
                <dl>
                  <div><dt>{paymentExperience === "manual_ethereum" ? "Payment check" : "Confirmations observed"}</dt><dd>{paymentExperience === "manual_ethereum" ? "Automatic verification is off. Nodezuno will check manually." : `${claim.confirmations} / ${confirmationsRequired} minimum, plus finality`}</dd></div>
                  <div><dt>Telegram</dt><dd>{claim.telegramUsername}</dd></div>
                  <div><dt>Transaction</dt><dd><code dir="ltr">{claim.transactionHash}</code></dd></div>
                </dl>
                {receiptUrl ? <a href={receiptUrl} rel="noreferrer" target="_blank">View on Etherscan <span aria-hidden="true">↗</span></a> : null}
              </section>
            ) : null}

            {showClaimForm ? (
              <form aria-busy={claimPending} className="review-payment-claim" onSubmit={submitClaim}>
                <header>
                  <span>AFTER YOU SEND THE TRANSFER</span>
                  <h3>{paymentExperience === "manual_ethereum" ? "Send us the transaction details." : "Submit the transaction for verification."}</h3>
                  <p>
                    Open the transaction in your wallet or <a href="https://etherscan.io/" rel="noreferrer" target="_blank">Etherscan</a>, then copy its full transaction hash. {paymentExperience === "manual_ethereum" ? "Sanjay will check the transaction manually and contact you. Submitting a hash does not confirm payment." : "Nodezuno verifies through Ethereum RPC, not through Etherscan."}
                  </p>
                </header>
                <fieldset className="review-claim-fields">
                  <legend className="sr-only">Transaction evidence and required contact</legend>
                  <label>
                    <span>Ethereum transaction hash *</span>
                    <input
                      aria-describedby={`payment-safety-warning transaction-hash-help${error ? " payment-claim-error" : ""}`}
                      autoCapitalize="none"
                      autoCorrect="off"
                      maxLength={66}
                      minLength={66}
                      onChange={(event) => setTransactionHash(event.target.value)}
                      pattern="0x[0-9a-fA-F]{64}"
                      placeholder="0x followed by 64 characters"
                      required
                      spellCheck={false}
                      value={transactionHash}
                    />
                    <small id="transaction-hash-help">The hash is public. {paymentExperience === "manual_ethereum" ? "Submitting it does not confirm payment. Nodezuno will check it manually." : "Submitting it does not credit the order until verification finishes."}</small>
                  </label>
                  <label>
                    <span>Telegram username *</span>
                    <input
                      aria-describedby={`telegram-help${error ? " payment-claim-error" : ""}`}
                      autoCapitalize="none"
                      autoComplete="off"
                      autoCorrect="off"
                      maxLength={33}
                      minLength={5}
                      onChange={(event) => setTelegramUsername(event.target.value)}
                      pattern="@?[A-Za-z][A-Za-z0-9_]{4,31}"
                      placeholder="@protocolops"
                      required
                      spellCheck={false}
                      value={telegramUsername}
                    />
                    <small id="telegram-help">Required so Sanjay can contact you if the transaction needs clarification.</small>
                  </label>
                </fieldset>
                {error ? <p className="review-submit-error" id="payment-claim-error" ref={claimErrorRef} role="alert" tabIndex={-1}>{error}</p> : null}
                <button className="review-submit" disabled={claimPending} type="submit">
                  {claimPending ? "Submitting securely..." : paymentExperience === "manual_ethereum" ? "Submit transaction details" : "Submit transaction for verification"}
                  <span aria-hidden="true">→</span>
                </button>
              </form>
            ) : null}
            {!showClaimForm && error ? (
              <p className="review-submit-error" id="payment-claim-error" ref={claimErrorRef} role="alert" tabIndex={-1}>
                {error}
              </p>
            ) : null}
            <p aria-live="polite" className="review-copy-status">{copiedField === "recipient" ? "Recipient address copied." : copiedField === "amount" ? "Exact amount copied." : ""}</p>
          </section>
        ) : null}

        {!intent && error ? <p className="review-submit-error review-portal-error" id="payment-instruction-error" ref={paymentInstructionErrorRef} role="alert" tabIndex={-1}>{error}</p> : null}

        {paymentVerified ? (
          <section className="review-payment-confirmation" aria-labelledby="review-payment-title">
            <span aria-hidden="true">✓</span>
            <div>
              <span className="review-overline">VERIFIED PAYMENT EVIDENCE</span>
              <h2 id="review-payment-title">
                {isBalancePayment ? "Final balance received." : "Scheduling deposit received."}
              </h2>
              <p>
                {phaseConfirmation
                  ? `${phaseConfirmation.receivedAmount} ${phaseConfirmation.receivedAsset} was confirmed from finalized Ethereum evidence. `
                  : ethereumVerified
                    ? `${intent?.tokenAmount} ${intent?.asset} was confirmed from finalized Ethereum evidence. `
                  : "Finalized Ethereum evidence confirms this payment. "}
                {isBalancePayment
                  ? "Final delivery remains controlled by the accepted service order and recorded review state."
                  : "A detailed confirmation email is queued to the work email on this order. Nodezuno will begin work and contact you for any required private artifacts."}
              </p>
            </div>
            {phaseConfirmation ? (
              <a href={`/api/v1/review-orders/${encodeURIComponent(order.id)}/payment-confirmations/${encodeURIComponent(phaseConfirmation.id)}`}>
                Download confirmation record ↓
              </a>
            ) : receiptUrl ? <a href={receiptUrl} rel="noreferrer" target="_blank">Inspect Ethereum evidence ↗</a> : null}
          </section>
        ) : null}

        {paymentConfirmations.length ? (
          <section className="review-deliverables" aria-labelledby="payment-records-title">
            <header>
              <span className="review-overline">PAYMENT CONFIRMATION RECORDS</span>
              <h2 id="payment-records-title">Verified Ethereum payments.</h2>
              <p>These records preserve the finalized transfer evidence and accepted service order policy. They are payment confirmations, not tax invoices or custody receipts.</p>
            </header>
            <div className="review-deliverable-list">
              {paymentConfirmations.map((confirmation) => (
                <article key={confirmation.id}>
                  <div>
                    <strong>{confirmation.phase === "deposit" ? "Scheduling deposit" : "Final balance"}</strong>
                    <span>{confirmation.receivedAmount} {confirmation.receivedAsset} · {confirmation.receiptReference}</span>
                    <code>Record SHA-256 {confirmation.recordHash}</code>
                  </div>
                  <a href={`/api/v1/review-orders/${encodeURIComponent(order.id)}/payment-confirmations/${encodeURIComponent(confirmation.id)}`}>
                    Download JSON record <span aria-hidden="true">↓</span>
                  </a>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {order.deliverables.length ? (
          <section className="review-deliverables" aria-labelledby="review-deliverables-title">
            <header>
              <span className="review-overline">FINAL REVIEW PACKAGE</span>
              <h2 id="review-deliverables-title">Download your review files.</h2>
              <p>Each link is private and short lived. Keep the SHA-256 values with the exact release that was reviewed.</p>
            </header>
            <div className="review-deliverable-list">
              {order.deliverables.map((deliverable) => (
                <article key={deliverable.id}>
                  <div>
                    <strong>{deliverable.kind.replaceAll("_", " ")}</strong>
                    <span>{deliverable.fileName} · {(deliverable.sizeBytes / 1024 / 1024).toFixed(2)} MB</span>
                    <code>SHA-256 {deliverable.sha256}</code>
                  </div>
                  <a href={`/api/v1/review-orders/${encodeURIComponent(order.id)}/deliverables/${encodeURIComponent(deliverable.id)}/download`}>
                    Download securely <span aria-hidden="true">↓</span>
                  </a>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <footer className="review-portal-footer">
          <p>Keep this private tracking link secure. Do not forward it or place it in tickets, public chat, or analytics tools.</p>
          <div><a href="mailto:info@nodezuno.com">info@nodezuno.com</a><Link href="/legal/privacy">Privacy</Link><Link href="/legal/terms">Terms</Link></div>
        </footer>
      </section>
    </main>
  );
}
