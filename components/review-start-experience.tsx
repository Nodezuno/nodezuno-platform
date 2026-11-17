"use client";

import Link from "next/link";
import { type FormEvent, useRef, useState } from "react";
import { solveAbuseChallenge } from "@/lib/client/abuse-challenge";
import { postReviewRequest, reviewRequestError, secureIdempotencyKey, trackingDestination } from "@/lib/client/review-order-request";
import { reviewTargetOptions } from "@/lib/review-targets";
import { publicReviewScope, reviewPolicy, reviewPriceLabels } from "@/lib/review-policy";
import styles from "./review-workspace.module.css";

const teamOptions = [
  "DeFi protocol",
  "Stablecoin issuer",
  "RWA / tokenized assets",
  "Protocol engineering team",
  "Governance / risk team",
  "Audit / security firm",
  "Other",
] as const;

type SubmissionState = "idle" | "submitting" | "error";


function fieldErrorId(name: string) {
  return `review-${name}-error`;
}

function value(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}

function positiveInteger(form: FormData, name: string) {
  const raw = value(form, name);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : raw;
}


export function ReviewStartExperience() {
  const [state, setState] = useState<SubmissionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const errorRef = useRef<HTMLParagraphElement>(null);
  const idempotencyKey = useRef<string | null>(null);
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setState("submitting");
    setError(null);
    setFieldErrors({});
    let firstInvalidField: string | null = null;

    try {
      idempotencyKey.current ??= secureIdempotencyKey();
      const challenge = await solveAbuseChallenge("submission");
      const { response, body } = await postReviewRequest("/api/v1/review-orders", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current,
          "X-Nodezuno-Challenge": challenge,
        },
        body: JSON.stringify({
          contactName: value(form, "contactName"),
          workEmail: value(form, "workEmail"),
          company: value(form, "company"),
          website: value(form, "website") || null,
          teamType: value(form, "teamType"),
          targetChain: value(form, "targetChain"),
          auditedBaseline: value(form, "auditedBaseline"),
          proposedRelease: value(form, "proposedRelease"),
          changeSummary: value(form, "changeSummary"),
          affectedContracts: positiveInteger(form, "affectedContracts"),
          changedLines: positiveInteger(form, "changedLines"),
          artifactReadyDate: value(form, "artifactReadyDate") || null,
          targetReleaseDate: value(form, "targetReleaseDate") || null,
          publicLinks: value(form, "publicLinks") || null,
          consent: form.get("consent") === "on",
          sourcePath: window.location.pathname,
        }),
      });
      const order = body.data?.order ?? body.data;
      if (!response.ok || !order?.id) {
        setFieldErrors(body.fields ?? {});
        firstInvalidField = [
          "contactName",
          "workEmail",
          "company",
          "website",
          "teamType",
          "targetChain",
          "auditedBaseline",
          "proposedRelease",
          "affectedContracts",
          "changedLines",
          "artifactReadyDate",
          "targetReleaseDate",
          "changeSummary",
          "publicLinks",
          "consent",
        ].find((field) => Boolean(body.fields?.[field])) ?? null;
        if (response.status < 500) idempotencyKey.current = null;
        throw new Error(
          reviewRequestError(
            response,
            body,
            "Your service order could not be created.",
          ),
        );
      }

      window.location.assign(trackingDestination(order));
    } catch (caught) {
      setState("error");
      setError(
        caught instanceof Error
          ? caught.message
          : "Your secure service order could not be created.",
      );
      requestAnimationFrame(() => {
        const field = firstInvalidField
          ? formElement.elements.namedItem(firstInvalidField)
          : null;
        if (field instanceof HTMLElement) {
          field.focus();
        } else {
          errorRef.current?.focus();
        }
      });
    } finally {
      submitting.current = false;
    }
  }

  function fieldError(name: string) {
    const message = fieldErrors[name];
    return message ? (
      <small className="review-field-error" id={fieldErrorId(name)}>
        {message}
      </small>
    ) : null;
  }

  function fieldErrorAttributes(name: string, helperId?: string) {
    const invalid = Boolean(fieldErrors[name]);
    const describedBy = [
      helperId,
      invalid ? fieldErrorId(name) : undefined,
    ].filter(Boolean).join(" ");
    return {
      "aria-describedby": describedBy || undefined,
      "aria-invalid": invalid,
    } as const;
  }

  return (
    <main className={`review-flow ${styles.intake}`} id="main-content">
      <section className="review-start-shell" aria-labelledby="review-start-title">
        <aside className="review-start-aside">
          <Link className="review-back" href="/pricing">
            <span aria-hidden="true">←</span> Pricing and scope
          </Link>
          <span className="review-overline">YOUR NEXT RELEASE</span>
          <h1 id="review-start-title">Let’s get your review underway.</h1>
          <p>
            Share the details of one smart contract or protocol upgrade. Your
            private order opens immediately, with no sales call required.
          </p>
          <div className={styles.orderSummary}>
            <span>Fixed service price</span>
            <strong>{reviewPriceLabels.total}<small> USD</small></strong>
            <p>The same price for supported EVM and non-EVM releases.</p>
            <dl>
              <div><dt>Scheduling deposit</dt><dd>{reviewPriceLabels.deposit}</dd></div>
              <div><dt>Final balance</dt><dd>{reviewPriceLabels.balance}</dd></div>
              <div><dt>Scope</dt><dd>One release, one network</dd></div>
            </dl>
            <Link href="/pricing">See what’s included <span aria-hidden="true">↗</span></Link>
          </div>
          <ol className={styles.nextSteps} aria-label="What happens next">
            <li aria-current="step"><span>1</span><div><strong>Describe your release</strong><p>Use public or non-confidential details.</p></div></li>
            <li><span>2</span><div><strong>Accept terms and pay</strong><p>USDC or USDT on Ethereum Mainnet.</p></div></li>
            <li><span>3</span><div><strong>Prepare for kickoff</strong><p>After Sanjay manually checks your payment and confirms the required files.</p></div></li>
          </ol>
          <p className="review-security-note">
            Do not submit private repositories, credentials, private RPC URLs,
            exploit material, keys, or production secrets here.
          </p>
        </aside>

        <div className="review-form-card">
          <header>
            <span>RELEASE DETAILS</span>
            <h2>Tell us what’s changing.</h2>
            <p>Fields marked * are required. No funds move when you submit this form.</p>
          </header>
          <form aria-busy={state === "submitting"} onSubmit={submit}>
            <fieldset disabled={state === "submitting"}>
              <legend><span>01</span> Your team</legend>
              <div className="review-form-grid">
                <label>
                  <span>Contact name *</span>
                  <input {...fieldErrorAttributes("contactName")} autoComplete="name" maxLength={100} name="contactName" placeholder="Your name" required />
                  {fieldError("contactName")}
                </label>
                <label>
                  <span>Work email *</span>
                  <input {...fieldErrorAttributes("workEmail")} autoComplete="email" maxLength={254} name="workEmail" placeholder="you@protocol.org" required type="email" />
                  {fieldError("workEmail")}
                </label>
                <label>
                  <span>Company or protocol *</span>
                  <input {...fieldErrorAttributes("company")} autoComplete="organization" maxLength={160} name="company" placeholder="Protocol name" required />
                  {fieldError("company")}
                </label>
                <label>
                  <span>Public website</span>
                  <input {...fieldErrorAttributes("website")} inputMode="url" maxLength={500} name="website" placeholder="https://" type="url" />
                  {fieldError("website")}
                </label>
                <label className="review-field-wide">
                  <span>Team type *</span>
                  <select {...fieldErrorAttributes("teamType")} defaultValue="" name="teamType" required>
                    <option disabled value="">Choose the closest fit</option>
                    {teamOptions.map((option) => <option key={option}>{option}</option>)}
                  </select>
                  {fieldError("teamType")}
                </label>
              </div>
            </fieldset>

            <fieldset disabled={state === "submitting"}>
              <legend><span>02</span> Your release</legend>
              <div className="review-form-grid">
                <label>
                  <span>Target blockchain network *</span>
                  <select {...fieldErrorAttributes("targetChain")} defaultValue="" name="targetChain" required>
                    <option disabled value="">Choose a network</option>
                    {reviewTargetOptions.map((option) => <option key={option}>{option}</option>)}
                  </select>
                  {fieldError("targetChain")}
                </label>
                <label>
                  <span>Prior audit or security review *</span>
                  <input {...fieldErrorAttributes("auditedBaseline")} maxLength={500} name="auditedBaseline" placeholder="Audit link, firm, date, or commit" required />
                  {fieldError("auditedBaseline")}
                </label>
                <label className="review-field-wide">
                  <span>Next version or release identifier *</span>
                  <input {...fieldErrorAttributes("proposedRelease")} maxLength={500} name="proposedRelease" placeholder="Public commit, proposal, or release identifier" required />
                  {fieldError("proposedRelease")}
                </label>
              </div>
            </fieldset>

            <fieldset disabled={state === "submitting"}>
              <legend><span>03</span> Scope and timing</legend>
              <p className={styles.sectionHelp}>Up to {reviewPolicy.affectedComponents.max} affected components and {reviewPolicy.materiallyChangedLines.max} materially changed lines. Standard EVM reviews target {reviewPolicy.evmTargetBusinessDays} business days after readiness; non-EVM timing depends on the runtime and review method.</p>
              <div className="review-form-grid">
                <label>
                  <span>Affected contracts, programs, or modules *</span>
                  <input {...fieldErrorAttributes("affectedContracts", "review-affected-components-help")} max={reviewPolicy.affectedComponents.max} min={reviewPolicy.affectedComponents.min} name="affectedContracts" placeholder={`Maximum ${reviewPolicy.affectedComponents.max}`} required type="number" />
                  <small className="review-field-help" id="review-affected-components-help">
                    {publicReviewScope.affectedComponentsLabel}. The opening
                    order limit is {reviewPolicy.affectedComponents.max}.
                  </small>
                  {fieldError("affectedContracts")}
                </label>
                <label>
                  <span>Lines of protocol code changed *</span>
                  <input {...fieldErrorAttributes("changedLines", "review-changed-lines-help")} max={reviewPolicy.materiallyChangedLines.max} min={reviewPolicy.materiallyChangedLines.min} name="changedLines" placeholder={`Maximum ${reviewPolicy.materiallyChangedLines.max} across in-scope code`} required type="number" />
                  <small className="review-field-help" id="review-changed-lines-help">
                    {publicReviewScope.changedLinesLabel}. The opening order
                    limit is {reviewPolicy.materiallyChangedLines.max}.
                  </small>
                  {fieldError("changedLines")}
                </label>
                <label>
                  <span>Review materials ready on</span>
                  <input {...fieldErrorAttributes("artifactReadyDate")} name="artifactReadyDate" type="date" />
                  {fieldError("artifactReadyDate")}
                </label>
                <label>
                  <span>Target release date</span>
                  <input {...fieldErrorAttributes("targetReleaseDate")} name="targetReleaseDate" type="date" />
                  {fieldError("targetReleaseDate")}
                </label>
                <label className="review-field-wide">
                  <span>What changes, and what must remain true? *</span>
                  <textarea {...fieldErrorAttributes("changeSummary")} maxLength={5000} minLength={30} name="changeSummary" placeholder="Describe the new behavior, language or runtime, deployment action, and any permissions or integrations that change. Include the security or financial rules that must still hold." required rows={5} />
                  {fieldError("changeSummary")}
                </label>
                <label className="review-field-wide">
                  <span>Public repository or governance links</span>
                  <textarea {...fieldErrorAttributes("publicLinks")} maxLength={2000} name="publicLinks" placeholder="One public URL per line" rows={3} />
                  {fieldError("publicLinks")}
                </label>
              </div>
            </fieldset>

            <label className="review-consent">
              <input {...fieldErrorAttributes("consent")} disabled={state === "submitting"} name="consent" required type="checkbox" />
              <span>
                I confirm these service order details are accurate and agree that
                Nodezuno may store and use them to provide the requested service.
                I have not included secrets or confidential source.
              </span>
            </label>
            {fieldError("consent")}
            {error ? <p className="review-submit-error" ref={errorRef} role="alert" tabIndex={-1}>{error}</p> : null}
            <button className="review-submit" disabled={state === "submitting"} type="submit">
              {state === "submitting" ? "Creating your order..." : "Continue to payment"}
              <span aria-hidden="true">↗</span>
            </button>
            <p className="review-form-foot">
              Next: read your service order and accept the terms to see the exact
              deposit amount and recipient address. <Link href="/legal/privacy">How we handle your information</Link>.
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}
