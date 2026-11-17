"use client";

import { type FormEvent, useRef, useState } from "react";
import type { SubmissionKind } from "@/lib/server/contracts";
import { solveAbuseChallenge } from "@/lib/client/abuse-challenge";

export type SubmissionFormVariant =
  | "general"
  | "press"
  | "career"
  | "security";

const submissionFormConfig: Record<
  SubmissionFormVariant,
  {
    kind: SubmissionKind;
    kicker: string;
    title: string;
    intro: string;
    question: string;
    placeholder: string;
    successTitle: string;
    contact: string;
    securityNote?: string;
  }
> = {
  general: {
    kind: "sales",
    kicker: "Contact Nodezuno",
    title: "Start with the right conversation.",
    intro:
      "Use this form for partnerships, research, company questions, or another non-sensitive enquiry. Release reviews have a separate structured order path.",
    question: "What would you like to discuss?",
    placeholder:
      "Share the public context, organization, topic, desired next step, and any relevant deadline. Do not include secrets, confidential source, credentials, or exploit material.",
    successTitle: "Thanks for getting in touch.",
    contact: "info@nodezuno.com",
  },
  press: {
    kind: "press",
    kicker: "Press enquiries",
    title: "Send the briefing request.",
    intro:
      "For media, analyst, research, podcast, and speaking enquiries, share the format and deadline.",
    question: "What would you like to discuss?",
    placeholder:
      "Include the publication or event, topic, format, deadline, and any background questions.",
    successTitle: "Your press enquiry is stored.",
    contact: "info@nodezuno.com",
  },
  career: {
    kind: "career_interest",
    kicker: "Future roles",
    title: "Introduce yourself for future opportunities.",
    intro:
      "No role is currently posted. Share the systems you want to build and a portfolio or profile link for future consideration.",
    question: "What work should we know about?",
    placeholder:
      "Describe your strongest relevant work and include a LinkedIn, GitHub, portfolio, or publication URL. Do not upload sensitive documents.",
    successTitle: "Your career interest is stored.",
    contact: "info@nodezuno.com",
  },
  security: {
    kind: "security_contact",
    kicker: "Responsible disclosure",
    title: "Open a secure disclosure conversation.",
    intro:
      "Send only a high-level, non-exploitable summary so the security team can establish a restricted disclosure channel.",
    question: "High-level issue category",
    placeholder:
      "Name the affected surface and potential impact only. Do not include exploit code, credentials, keys, or sensitive reproduction steps here.",
    successTitle: "Your security contact request is stored.",
    contact: "info@nodezuno.com",
    securityNote:
      "This intake intentionally limits technical detail. Nodezuno will establish a restricted channel before accepting sensitive reproduction material.",
  },
};

export function ContactExperience({
  variant,
  compact = false,
}: {
  variant: SubmissionFormVariant;
  compact?: boolean;
}) {
  const config = submissionFormConfig[variant];
  const [state, setState] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [receipt, setReceipt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const idempotencyKey = useRef<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  function fieldErrorId(name: string) {
    return `contact-${name}-error`;
  }

  function fieldErrorAttributes(name: string) {
    const invalid = Boolean(fieldErrors[name]);
    return {
      "aria-describedby": invalid ? fieldErrorId(name) : undefined,
      "aria-invalid": invalid,
    } as const;
  }

  function fieldError(name: string, className?: string) {
    const message = fieldErrors[name];
    return message ? (
      <small className={className} id={fieldErrorId(name)}>
        {message}
      </small>
    ) : null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setError(null);
    setFieldErrors({});
    const form = event.currentTarget;
    const data = new FormData(form);
    idempotencyKey.current ??= crypto.randomUUID();
    const search = new URLSearchParams(window.location.search);
    let firstInvalidField: string | null = null;

    try {
      const abuseProof = await solveAbuseChallenge("submission");
      const response = await fetch("/api/v1/submissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current,
          "X-Nodezuno-Challenge": abuseProof,
        },
        body: JSON.stringify({
          kind: config.kind,
          name: data.get("name"),
          email: data.get("email"),
          company: data.get("company"),
          team: data.get("team"),
          message: data.get("message"),
          consent: data.get("consent") === "on",
          website: data.get("website"),
          sourcePath: window.location.pathname,
          utmSource: search.get("utm_source")?.slice(0, 100) ?? null,
          utmMedium: search.get("utm_medium")?.slice(0, 100) ?? null,
          utmCampaign:
            search.get("utm_campaign")?.slice(0, 100) ?? null,
        }),
      });
      const body = (await response.json()) as {
        data?: { id: string; status: string };
        title?: string;
        detail?: string;
        fields?: Record<string, string>;
      };
      if (!response.ok || !body.data) {
        if (response.status < 500) idempotencyKey.current = null;
        setFieldErrors(body.fields ?? {});
        firstInvalidField = [
          "name",
          "email",
          "company",
          "team",
          "message",
          "consent",
        ].find((field) => Boolean(body.fields?.[field])) ?? null;
        const hiddenFieldError = Object.entries(body.fields ?? {}).find(
          ([field]) =>
            ![
              "name",
              "email",
              "company",
              "team",
              "message",
              "consent",
            ].includes(field),
        )?.[1];
        throw new Error(
          body.detail ??
            hiddenFieldError ??
            body.title ??
            "The request could not be stored.",
        );
      }

      setReceipt(body.data.id);
      setState("success");
      idempotencyKey.current = null;
      form.reset();
    } catch (submissionError) {
      setState("error");
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "The request could not be stored.",
      );
      requestAnimationFrame(() => {
        const field = firstInvalidField
          ? form.elements.namedItem(firstInvalidField)
          : null;
        if (field instanceof HTMLElement) {
          field.focus();
        } else {
          errorRef.current?.focus();
        }
      });
    }
  }

  return (
    <section className="special-module form-module" id="request-form">
      {!compact ? <div className="form-intro">
        <span className="section-kicker">{config.kicker}</span>
        <h2>{config.title}</h2>
        <p>{config.intro}</p>
        {config.securityNote ? (
          <p className="form-security-note">{config.securityNote}</p>
        ) : null}
        <div className="form-contact-lines">
          <a href={`mailto:${config.contact}`}>
            {config.contact} ↗
          </a>
          <span>Global / remote</span>
        </div>
      </div> : null}
      {state === "success" ? (
        <div className="form-success" role="status">
          <span className="success-mark" aria-hidden="true">
            ✓
          </span>
          <span className="section-kicker">Message received</span>
          <h3>{config.successTitle}</h3>
          <p>
            Your message has been received. Save this reference number if you
            need to follow up.
          </p>
          {receipt ? <code className="receipt-code">{receipt}</code> : null}
          <button
            className="button button-outline"
            onClick={() => {
              setState("idle");
              setReceipt(null);
            }}
            type="button"
          >
            Submit another
          </button>
        </div>
      ) : (
        <form className="contact-form" onSubmit={submit}>
          <label className="form-trap" aria-hidden="true">
            <span>Website</span>
            <input
              autoComplete="off"
              name="website"
              tabIndex={-1}
              type="text"
            />
          </label>
          <div className="form-row">
            <label>
              <span>Name</span>
              <input
                {...fieldErrorAttributes("name")}
                autoComplete="name"
                maxLength={100}
                name="name"
                placeholder="Your name"
                required
              />
              {fieldError("name")}
            </label>
            <label>
              <span>Work email</span>
              <input
                {...fieldErrorAttributes("email")}
                autoComplete="email"
                maxLength={254}
                name="email"
                placeholder="you@company.com"
                required
                type="email"
              />
              {fieldError("email")}
            </label>
          </div>
          <div className="form-row">
            <label>
              <span>Company</span>
              <input
                {...fieldErrorAttributes("company")}
                autoComplete="organization"
                maxLength={160}
                name="company"
                placeholder="Company or independent"
                required
              />
              {fieldError("company")}
            </label>
            <label>
              <span>Team type</span>
              <select
                {...fieldErrorAttributes("team")}
                defaultValue=""
                name="team"
                required
              >
                <option disabled value="">
                  Choose one
                </option>
                <option>DeFi protocol</option>
                <option>Stablecoin issuer</option>
                <option>RWA / tokenized assets</option>
                <option>Audit / security firm</option>
                <option>Protocol engineering team</option>
                <option>Governance / risk team</option>
                <option>Media / analyst</option>
                <option>Independent researcher</option>
                <option>Other</option>
              </select>
              {fieldError("team")}
            </label>
          </div>
          <label>
            <span>{config.question}</span>
            <textarea
              {...fieldErrorAttributes("message")}
              maxLength={config.kind === "security_contact" ? 1500 : 5000}
              name="message"
              placeholder={config.placeholder}
              required
              rows={5}
            />
            {fieldError("message")}
          </label>
          <label className="check-field">
            <input {...fieldErrorAttributes("consent")} name="consent" required type="checkbox" />
            <span>
              I agree that Nodezuno may use these details to respond to my
              request.
            </span>
          </label>
          {fieldError("consent", "form-field-error")}
          {error ? (
            <p className="form-error" ref={errorRef} role="alert" tabIndex={-1}>
              {error}
            </p>
          ) : null}
          <button
            className="button button-solid button-large"
            disabled={state === "submitting"}
            type="submit"
          >
            {state === "submitting" ? "Sending…" : compact ? "Send message" : config.kicker}{" "}
            <span aria-hidden="true">↗</span>
          </button>
        </form>
      )}
    </section>
  );
}
