"use client";

import { type FormEvent, useState } from "react";
import { solveAbuseChallenge } from "@/lib/client/abuse-challenge";

export function NewsletterExperience() {
  const [state, setState] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const abuseProof = await solveAbuseChallenge("newsletter");
      const response = await fetch("/api/v1/newsletter/subscriptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Nodezuno-Challenge": abuseProof,
        },
        body: JSON.stringify({
          email: data.get("email"),
          name: data.get("name"),
          consent: data.get("consent") === "on",
          website: data.get("website"),
          sourcePath: window.location.pathname,
        }),
      });
      const body = (await response.json()) as {
        data?: { message?: string };
        title?: string;
        detail?: string;
      };
      if (!response.ok) {
        throw new Error(body.detail ?? body.title ?? "Subscription failed.");
      }
      setMessage(
        body.data?.message ??
          "Your subscription is saved for the Nodezuno Signal launch.",
      );
      setState("success");
      form.reset();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Subscription failed.",
      );
      setState("error");
    }
  }

  return (
    <section className="special-module newsletter-module" id="newsletter-form">
      <div>
        <span className="section-kicker">Nodezuno Signal</span>
        <h2>One high-signal briefing. Zero noise.</h2>
        <p>
          Request the planned monthly operator briefing, then use the private
          email link to confirm that you want to receive it.
        </p>
      </div>
      {state === "success" ? (
        <div className="form-success compact" role="status">
          <span className="success-mark" aria-hidden="true">
            ✓
          </span>
          <h3>Check your inbox.</h3>
          <p>{message}</p>
          <button
            className="button button-outline"
            onClick={() => setState("idle")}
            type="button"
          >
            Add another email
          </button>
        </div>
      ) : (
        <form className="newsletter-form" onSubmit={submit}>
          <label className="form-trap" aria-hidden="true">
            <span>Website</span>
            <input autoComplete="off" name="website" tabIndex={-1} />
          </label>
          <label>
            <span>Name</span>
            <input autoComplete="name" maxLength={100} name="name" />
          </label>
          <label>
            <span>Email</span>
            <input
              autoComplete="email"
              maxLength={254}
              name="email"
              placeholder="you@company.com"
              required
              type="email"
            />
          </label>
          <label className="check-field">
            <input name="consent" required type="checkbox" />
            <span>I agree to receive Nodezuno Signal and can opt out later.</span>
          </label>
          {state === "error" ? (
            <p className="form-error" role="alert">
              {message}
            </p>
          ) : null}
          <button
            className="button button-solid"
            disabled={state === "submitting"}
            type="submit"
          >
            {state === "submitting" ? "Requesting…" : "Request subscription"}
          </button>
        </form>
      )}
    </section>
  );
}
