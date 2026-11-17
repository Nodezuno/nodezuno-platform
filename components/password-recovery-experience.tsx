"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { Brand } from "./brand";

type PasswordRecoveryExperienceProps = {
  available: boolean;
  mode: "request" | "reset";
  returnTo: string;
  token?: string;
};

export function PasswordRecoveryExperience({
  available,
  mode,
  returnTo,
  token = "",
}: PasswordRecoveryExperienceProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const loginPath = `/login?return_to=${encodeURIComponent(returnTo)}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      if (!available) {
        throw new Error(
          "Password recovery is temporarily unavailable. Contact info@nodezuno.com.",
        );
      }
      if (mode === "reset" && (!token || password !== confirmation)) {
        throw new Error(
          token
            ? "The password confirmation does not match."
            : "This password reset link is invalid or incomplete.",
        );
      }

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 20_000);
      let response: Response;
      try {
        response = await fetch(
          mode === "request"
            ? "/api/auth/request-password-reset"
            : "/api/auth/reset-password",
          {
            method: "POST",
            credentials: "same-origin",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(
              mode === "request"
                ? {
                    email: email.trim().toLowerCase(),
                    redirectTo: `/reset-password?return_to=${encodeURIComponent(returnTo)}`,
                  }
                : { newPassword: password, token },
            ),
            signal: controller.signal,
          },
        );
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          throw new Error(
            "Account recovery did not respond within 20 seconds. Check your inbox before trying again.",
          );
        }
        throw caught;
      } finally {
        window.clearTimeout(timeout);
      }
      if (!response.ok) {
        const requestId = response.headers.get("x-request-id") ?? "";
        const suffix = /^[A-Za-z0-9._:-]{1,128}$/.test(requestId)
          ? ` Request ID: ${requestId}.`
          : "";
        throw new Error(
          mode === "request"
            ? `The recovery request could not be completed.${suffix}`
            : `This reset link is invalid or expired.${suffix}`,
        );
      }
      if (mode === "reset") {
        window.location.assign(
          `${loginPath}&error=password_reset`,
        );
        return;
      }
      setComplete(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Password recovery could not be completed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main id="main-content" className="auth-page">
      <div className="auth-grid" aria-hidden="true" />
      <header className="auth-header">
        <Link href="/" aria-label="Nodezuno home">
          <Brand />
        </Link>
        <Link href="/methodology">Read the methodology</Link>
      </header>

      <section
        className="auth-shell password-recovery-shell"
        aria-labelledby="recovery-title"
      >
        <div className="auth-story">
          <span className="section-kicker">Account recovery</span>
          <h1 id="recovery-title">
            {mode === "request"
              ? "Recover your review portal."
              : "Choose a new password."}
          </h1>
          <p>
            {mode === "request"
              ? "We send a short-lived link without revealing whether an account exists."
              : "Reset the credential, revoke existing sessions, and return to your Nodezuno review portal."}
          </p>
        </div>

        <div className="auth-card">
          <div className="auth-card-heading">
            <span>{mode === "request" ? "Password help" : "Secure reset"}</span>
            <h2>
              {complete
                ? "Check your inbox."
                : mode === "request"
                  ? "Request a recovery link."
                  : "Set your new password."}
            </h2>
          </div>

          {complete ? (
            <div className="recovery-complete" role="status">
              <p>
                If that address belongs to an account, a short-lived recovery
                link is on its way.
              </p>
              <Link className="button button-solid" href={loginPath}>
                Return to sign in
              </Link>
            </div>
          ) : (
            <form className="auth-email-form" onSubmit={submit}>
              {mode === "request" ? (
                <label>
                  <span>Account email</span>
                  <input
                    autoCapitalize="none"
                    autoComplete="email"
                    disabled={submitting}
                    maxLength={254}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@company.com"
                    required
                    spellCheck={false}
                    type="email"
                    value={email}
                  />
                </label>
              ) : (
                <>
                  <label>
                    <span>New password</span>
                    <input
                      autoComplete="new-password"
                      disabled={submitting}
                      maxLength={128}
                      minLength={12}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="At least 12 characters"
                      required
                      type="password"
                      value={password}
                    />
                  </label>
                  <label>
                    <span>Confirm password</span>
                    <input
                      autoComplete="new-password"
                      disabled={submitting}
                      maxLength={128}
                      minLength={12}
                      onChange={(event) =>
                        setConfirmation(event.target.value)
                      }
                      placeholder="Repeat the new password"
                      required
                      type="password"
                      value={confirmation}
                    />
                  </label>
                </>
              )}

              {error ? (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              ) : null}

              <button
                className="button button-solid auth-submit"
                disabled={
                  submitting ||
                  (mode === "request"
                    ? email.trim().length < 3
                    : password.length < 12 ||
                      confirmation.length < 12)
                }
                type="submit"
              >
                {submitting
                  ? "Securing request..."
                  : mode === "request"
                    ? "Send recovery link"
                    : "Reset password"}
              </button>
            </form>
          )}

          <p className="auth-switch">
            Remembered it? <Link href={loginPath}>Return to sign in</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
