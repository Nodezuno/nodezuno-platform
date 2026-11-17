"use client";

import Link from "next/link";
import { useState } from "react";

type AccountDataExportProps = {
  betterAuthManaged: boolean;
};

type ExportState =
  | { status: "idle" | "downloading" }
  | {
      status: "error" | "success";
      message: string;
      reauthenticationRequired?: boolean;
    };

const exportEndpoint = "/api/v1/account/export";

export function AccountDataExport({
  betterAuthManaged,
}: AccountDataExportProps) {
  const [state, setState] = useState<ExportState>({ status: "idle" });

  async function downloadExport() {
    setState({ status: "downloading" });
    try {
      const response = await fetch(exportEndpoint, {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
        },
      });
      if (!response.ok) {
        const problem = await readProblem(response);
        if (
          response.status === 403 &&
          problem.code === "session_not_fresh"
        ) {
          setState({
            status: "error",
            message:
              "Sign in again to confirm it is you, then request a new export.",
            reauthenticationRequired: true,
          });
          return;
        }
        if (response.status === 429) {
          setState({
            status: "error",
            message:
              "The download limit was reached. Try again after the rate-limit window resets.",
          });
          return;
        }
        if (response.status === 401) {
          setState({
            status: "error",
            message: "Your session ended. Sign in before downloading again.",
            reauthenticationRequired: true,
          });
          return;
        }
        throw new Error(
          problem.title || "The account export could not be prepared.",
        );
      }

      const blob = await response.blob();
      if (blob.size === 0 || blob.size > 1024 * 1024) {
        throw new Error("The account export response was not valid.");
      }
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = exportFilename(response);
      anchor.rel = "noopener";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 0);
      setState({
        status: "success",
        message:
          "Your JSON export downloaded. Authentication credentials and private network metadata were excluded.",
      });
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error && error.message
            ? error.message
            : "The account export could not be prepared.",
      });
    }
  }

  async function reauthenticate() {
    setState({ status: "downloading" });
    try {
      const response = await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        throw new Error(
          "The current session could not be closed. Try again.",
        );
      }
      window.location.assign(
        "/login?return_to=%2Faccount%23data-export",
      );
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error && error.message
            ? error.message
            : "The current session could not be closed. Try again.",
        reauthenticationRequired: true,
      });
    }
  }

  return (
    <section
      aria-labelledby="account-data-export-title"
      className="account-security"
      id="data-export"
    >
      <div className="account-security-heading">
        <div>
          <span className="section-kicker">Your data</span>
          <h2 id="account-data-export-title">
            Download a private account export.
          </h2>
        </div>
        <dl>
          <div>
            <dt>Format</dt>
            <dd>Bounded JSON</dd>
          </div>
          <div>
            <dt>Delivery</dt>
            <dd>Direct download</dd>
          </div>
        </dl>
      </div>

      <div className="account-security-grid">
        {betterAuthManaged ? (
          <article className="security-panel security-panel-wide">
            <span className="security-panel-label">Self-service export</span>
            <h3>Take your Nodezuno account data with you.</h3>
            <p>
              Download your account, linked identity, session, request, and
              redacted activity records. Passwords, session credentials,
              authentication secrets, private provider details, and other
              customers are never included.
            </p>
            <div className="security-inline-actions">
              <button
                className="button button-outline"
                disabled={state.status === "downloading"}
                onClick={() => void downloadExport()}
                type="button"
              >
                {state.status === "downloading"
                  ? "Preparing export..."
                  : "Download account data"}
              </button>
              <small>Limited to three downloads per account each hour.</small>
            </div>
            {state.status === "error" || state.status === "success" ? (
              <div
                className={`security-inline-state ${
                  state.status === "success"
                    ? "security-all-clear"
                    : "security-fresh-state"
                }`}
                role={state.status === "error" ? "alert" : "status"}
              >
                <strong>
                  {state.status === "success"
                    ? "Export ready."
                    : "Export needs attention."}
                </strong>
                <p>{state.message}</p>
                {state.reauthenticationRequired ? (
                  <button
                    className="button button-outline"
                    onClick={() => void reauthenticate()}
                    type="button"
                  >
                    Sign in again
                  </button>
                ) : null}
              </div>
            ) : null}
          </article>
        ) : (
          <article className="security-panel security-panel-wide">
            <span className="security-panel-label">Hosted identity</span>
            <h3>Your ChatGPT account stays with ChatGPT.</h3>
            <p>
              This visit uses a verified hosted identity, not a Nodezuno-managed
              account. Nodezuno cannot export ChatGPT profile, credential, or
              session data. Create a Nodezuno account with email, Google, an
              EVM wallet, or a Solana wallet to use self-service exports for
              data stored by Nodezuno.
            </p>
            <Link
              className="button button-outline"
              href="/signup?return_to=%2Faccount%23data-export"
            >
              Create a Nodezuno account
            </Link>
          </article>
        )}
      </div>
    </section>
  );
}

async function readProblem(
  response: Response,
): Promise<{ code: string; title: string }> {
  try {
    const value = (await response.json()) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { code: "", title: "" };
    }
    const record = value as Record<string, unknown>;
    return {
      code: typeof record.code === "string" ? record.code : "",
      title: typeof record.title === "string" ? record.title : "",
    };
  } catch {
    return { code: "", title: "" };
  }
}

function exportFilename(response: Response): string {
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = disposition.match(
    /filename="(nodezuno-account-export-\d{4}-\d{2}-\d{2}\.json)"/,
  );
  return (
    match?.[1] ??
    `nodezuno-account-export-${new Date().toISOString().slice(0, 10)}.json`
  );
}
