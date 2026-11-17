"use client";

import Link from "next/link";
import {
  type FormEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type AuthMethod = "email" | "google" | "evm" | "solana" | "chatgpt";

type AccountSecurityProps = {
  authMethod: AuthMethod;
  betterAuthManaged: boolean;
  emailRecoveryAvailable: boolean;
  hostSignOutPath: string | null;
  identifier: string;
};

type StoredSession = {
  createdAt: string;
  expiresAt: string;
  id: string;
  ipAddress?: string | null;
  token: string;
  updatedAt: string;
  userAgent?: string | null;
  userId: string;
};

type CurrentSessionPayload = {
  session: StoredSession;
  user: {
    email: string;
    id: string;
    name: string;
  };
};

type SessionHistoryState =
  | { status: "idle" | "loading" }
  | {
      current: StoredSession | null;
      historyLocked: boolean;
      sessions: StoredSession[];
      status: "ready";
    }
  | { message: string; status: "error" };

type Notice = {
  message: string;
  tone: "error" | "success";
};

const requestTimeoutMs = 15_000;

export function AccountSecurity({
  authMethod,
  betterAuthManaged,
  emailRecoveryAvailable,
  hostSignOutPath,
  identifier,
}: AccountSecurityProps) {
  const [sessionState, setSessionState] =
    useState<SessionHistoryState>({
      status: betterAuthManaged ? "loading" : "idle",
    });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [confirmSessionToken, setConfirmSessionToken] =
    useState<string | null>(null);
  const [confirmEverywhere, setConfirmEverywhere] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [revokeAfterPasswordChange, setRevokeAfterPasswordChange] =
    useState(true);
  const revokeConfirmRef = useRef<HTMLButtonElement | null>(null);
  const revokeEverywhereConfirmRef = useRef<HTMLButtonElement | null>(null);
  const confirmationTriggerRef = useRef<HTMLButtonElement | null>(null);

  const loadSessions = useCallback(async () => {
    if (!betterAuthManaged) return;
    setSessionState({ status: "loading" });
    try {
      const currentResponse = await authFetch("/api/auth/get-session");
      if (currentResponse.status === 401 || currentResponse.status === 403) {
        throw new AuthRequestError(
          currentResponse.status,
          "Your session has expired. Sign in again to continue.",
        );
      }
      const currentPayload =
        (await readResponse<CurrentSessionPayload | null>(
          currentResponse,
          "We could not load this session.",
        )) ?? null;

      const historyResponse = await authFetch("/api/auth/list-sessions");
      if (historyResponse.status === 403) {
        setSessionState({
          current: currentPayload?.session ?? null,
          historyLocked: true,
          sessions: currentPayload?.session
            ? [currentPayload.session]
            : [],
          status: "ready",
        });
        return;
      }
      if (historyResponse.status === 401) {
        throw new AuthRequestError(
          historyResponse.status,
          "Your session has expired. Sign in again to continue.",
        );
      }
      const sessions = await readResponse<StoredSession[]>(
        historyResponse,
        "We could not load your active sessions.",
      );
      setSessionState({
        current: currentPayload?.session ?? null,
        historyLocked: false,
        sessions: sortSessions(sessions),
        status: "ready",
      });
    } catch (error) {
      setSessionState({
        message: errorMessage(
          error,
          "We could not load your security information.",
        ),
        status: "error",
      });
    }
  }, [betterAuthManaged]);

  useEffect(() => {
    if (!betterAuthManaged) return;
    const timer = window.setTimeout(() => void loadSessions(), 0);
    return () => window.clearTimeout(timer);
  }, [betterAuthManaged, loadSessions]);

  useEffect(() => {
    if (confirmSessionToken) revokeConfirmRef.current?.focus();
  }, [confirmSessionToken]);

  useEffect(() => {
    if (confirmEverywhere) revokeEverywhereConfirmRef.current?.focus();
  }, [confirmEverywhere]);

  useEffect(() => {
    function cancelConfirmation(event: KeyboardEvent) {
      if (
        event.key !== "Escape" ||
        (!confirmSessionToken && !confirmEverywhere)
      ) {
        return;
      }
      setConfirmSessionToken(null);
      setConfirmEverywhere(false);
      const trigger = confirmationTriggerRef.current;
      confirmationTriggerRef.current = null;
      window.requestAnimationFrame(() => trigger?.focus());
    }
    document.addEventListener("keydown", cancelConfirmation);
    return () => document.removeEventListener("keydown", cancelConfirmation);
  }, [confirmEverywhere, confirmSessionToken]);

  function closeConfirmation() {
    setConfirmSessionToken(null);
    setConfirmEverywhere(false);
    const trigger = confirmationTriggerRef.current;
    confirmationTriggerRef.current = null;
    window.requestAnimationFrame(() => trigger?.focus());
  }

  async function revokeSession(session: StoredSession) {
    setPendingAction(session.token);
    setNotice(null);
    try {
      await postAuth(
        "/api/auth/revoke-session",
        { token: session.token },
        "We could not revoke that session.",
      );
      setConfirmSessionToken(null);
      confirmationTriggerRef.current = null;
      setNotice({
        message: "The selected session was signed out.",
        tone: "success",
      });
      await loadSessions();
    } catch (error) {
      setNotice({
        message: errorMessage(error, "We could not revoke that session."),
        tone: "error",
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function revokeOtherSessions() {
    setPendingAction("others");
    setNotice(null);
    try {
      await postAuth(
        "/api/auth/revoke-other-sessions",
        {},
        "We could not sign out the other sessions.",
      );
      setNotice({
        message: "Every other Nodezuno session was signed out.",
        tone: "success",
      });
      await loadSessions();
    } catch (error) {
      setNotice({
        message: errorMessage(
          error,
          "We could not sign out the other sessions.",
        ),
        tone: "error",
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function revokeEverySession() {
    setPendingAction("everywhere");
    setNotice(null);
    try {
      await postAuth(
        "/api/auth/revoke-sessions",
        {},
        "We could not sign out every session.",
      );
      await postAuth(
        "/api/auth/sign-out",
        {},
        "Your sessions were revoked, but the browser cookie could not be cleared.",
      );
      window.location.assign("/login?return_to=%2Faccount");
    } catch (error) {
      setNotice({
        message: errorMessage(
          error,
          "We could not sign out every session.",
        ),
        tone: "error",
      });
      setPendingAction(null);
    }
  }

  async function reauthenticate() {
    setPendingAction("reauthenticate");
    setNotice(null);
    try {
      await postAuth(
        "/api/auth/sign-out",
        {},
        "We could not close this session.",
      );
      window.location.assign("/login?return_to=%2Faccount");
    } catch (error) {
      setNotice({
        message: errorMessage(
          error,
          "We could not close this session.",
        ),
        tone: "error",
      });
      setPendingAction(null);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    if (newPassword.length < 12 || newPassword.length > 128) {
      setNotice({
        message: "Choose a password between 12 and 128 characters.",
        tone: "error",
      });
      return;
    }
    if (newPassword === currentPassword) {
      setNotice({
        message: "Choose a new password that differs from the current one.",
        tone: "error",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setNotice({
        message: "The new password and confirmation do not match.",
        tone: "error",
      });
      return;
    }

    setPendingAction("password");
    try {
      await postAuth(
        "/api/auth/change-password",
        {
          currentPassword,
          newPassword,
          revokeOtherSessions: revokeAfterPasswordChange,
        },
        "We could not change your password.",
      );
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice({
        message: revokeAfterPasswordChange
          ? "Your password changed and every other session was signed out."
          : "Your password changed.",
        tone: "success",
      });
      await loadSessions();
    } catch (error) {
      setNotice({
        message: passwordErrorMessage(error),
        tone: "error",
      });
    } finally {
      setPendingAction(null);
    }
  }

  if (!betterAuthManaged) {
    return (
      <section
        aria-labelledby="account-security-title"
        className="account-security"
        id="security"
      >
        <SecurityHeading authMethod={authMethod} identifier={identifier} />
        <div className="account-security-grid">
          <article className="security-panel security-panel-wide">
            <span className="security-panel-label">Hosted identity</span>
            <h3>ChatGPT manages this session.</h3>
            <p>
              Nodezuno receives a verified hosted identity for this visit. Your
              password, recovery methods, and session controls remain in your
              ChatGPT account.
            </p>
            {hostSignOutPath ? (
              <Link className="button button-outline" href={hostSignOutPath}>
                Sign out of this session
              </Link>
            ) : null}
          </article>
          <ProviderGuidance
            authMethod={authMethod}
            emailRecoveryAvailable={emailRecoveryAvailable}
          />
        </div>
      </section>
    );
  }

  const currentSession =
    sessionState.status === "ready" ? sessionState.current : null;
  const otherSessions =
    sessionState.status === "ready"
      ? sessionState.sessions.filter(
          (session) => !isCurrentSession(session, currentSession),
        )
      : [];
  const historyLocked =
    sessionState.status === "ready" && sessionState.historyLocked;

  return (
    <section
      aria-labelledby="account-security-title"
      className="account-security"
      id="security"
    >
      <SecurityHeading authMethod={authMethod} identifier={identifier} />

      {notice ? (
        <div
          className={`security-notice security-notice-${notice.tone}`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          <span aria-hidden="true" />
          <p>{notice.message}</p>
          <button
            aria-label="Dismiss security message"
            onClick={() => setNotice(null)}
            type="button"
          >
            ×
          </button>
        </div>
      ) : null}

      <div className="account-security-grid">
        <article className="security-panel security-panel-wide">
          <div className="security-panel-heading">
            <div>
              <span className="security-panel-label">Active sessions</span>
              <h3>Know where your account is open.</h3>
            </div>
            {sessionState.status === "ready" &&
            !sessionState.historyLocked ? (
              <button
                className="security-text-button"
                disabled={pendingAction !== null}
                onClick={() => void loadSessions()}
                type="button"
              >
                Refresh
              </button>
            ) : null}
          </div>

          {sessionState.status === "idle" ||
          sessionState.status === "loading" ? (
            <div className="security-loading" role="status">
              <span aria-hidden="true" />
              <p>Loading active sessions</p>
            </div>
          ) : sessionState.status === "error" ? (
            <div className="security-inline-state" role="alert">
              <strong>Session details are unavailable.</strong>
              <p>{sessionState.message}</p>
              <div className="security-inline-actions">
                <button
                  className="button button-outline"
                  disabled={pendingAction !== null}
                  onClick={() => void loadSessions()}
                  type="button"
                >
                  Retry
                </button>
                <button
                  className="security-text-link"
                  disabled={pendingAction !== null}
                  onClick={() => void reauthenticate()}
                  type="button"
                >
                  {pendingAction === "reauthenticate"
                    ? "Closing session..."
                    : "Sign in again"}
                </button>
              </div>
            </div>
          ) : (
            <>
              {currentSession ? (
                <SessionRow
                  current
                  session={currentSession}
                />
              ) : (
                <div className="security-inline-state">
                  <strong>Current session details are unavailable.</strong>
                  <p>You can still sign out this account below.</p>
                </div>
              )}

              {historyLocked ? (
                <div className="security-inline-state security-fresh-state">
                  <strong>Sign in again to review every session.</strong>
                  <p>
                    For your protection, Nodezuno only reveals full session
                    history shortly after authentication. Your current session
                    remains visible above.
                  </p>
                  <button
                    className="button button-outline"
                    disabled={pendingAction !== null}
                    onClick={() => void reauthenticate()}
                    type="button"
                  >
                    {pendingAction === "reauthenticate"
                      ? "Closing session..."
                      : "Sign in again"}
                  </button>
                </div>
              ) : otherSessions.length ? (
                <div
                  aria-label="Other active sessions"
                  className="security-session-list"
                  role="list"
                >
                  {otherSessions.map((session) => (
                    <SessionRow
                      confirmationOpen={
                        confirmSessionToken === session.token
                      }
                      disabled={pendingAction !== null}
                      key={session.id}
                      onCancel={closeConfirmation}
                      onConfirm={() => void revokeSession(session)}
                      onRequestConfirmation={() => {
                        confirmationTriggerRef.current =
                          document.activeElement instanceof HTMLButtonElement
                            ? document.activeElement
                            : null;
                        setConfirmEverywhere(false);
                        setConfirmSessionToken(session.token);
                      }}
                      pending={pendingAction === session.token}
                      session={session}
                      confirmRef={
                        confirmSessionToken === session.token
                          ? revokeConfirmRef
                          : undefined
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="security-inline-state security-all-clear">
                  <strong>No other active sessions.</strong>
                  <p>This account is open only in the session shown above.</p>
                </div>
              )}

              {!historyLocked && otherSessions.length ? (
                <div className="security-session-actions">
                  <button
                    className="button button-outline"
                    disabled={pendingAction !== null}
                    onClick={() => void revokeOtherSessions()}
                    type="button"
                  >
                    {pendingAction === "others"
                      ? "Signing out..."
                      : "Sign out other sessions"}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </article>

        {authMethod === "email" ? (
          <article className="security-panel">
            <span className="security-panel-label">Password</span>
            <h3>Change your password.</h3>
            <p>
              Use a unique password with 12 to 128 characters. Nodezuno will
              verify your current password before saving a replacement.
            </p>
            <form
              className="security-password-form"
              onSubmit={(event) => void changePassword(event)}
            >
              <label>
                <span>Current password</span>
                <input
                  autoComplete="current-password"
                  disabled={pendingAction !== null}
                  maxLength={128}
                  minLength={12}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                  type="password"
                  value={currentPassword}
                />
              </label>
              <label>
                <span>New password</span>
                <input
                  aria-describedby="new-password-guidance"
                  autoComplete="new-password"
                  disabled={pendingAction !== null}
                  maxLength={128}
                  minLength={12}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                  type="password"
                  value={newPassword}
                />
              </label>
              <label>
                <span>Confirm new password</span>
                <input
                  autoComplete="new-password"
                  disabled={pendingAction !== null}
                  maxLength={128}
                  minLength={12}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  type="password"
                  value={confirmPassword}
                />
              </label>
              <small id="new-password-guidance">
                Passwords can include spaces and symbols. Store the new value
                in a password manager.
              </small>
              <label className="security-check-field">
                <input
                  checked={revokeAfterPasswordChange}
                  disabled={pendingAction !== null}
                  onChange={(event) =>
                    setRevokeAfterPasswordChange(event.target.checked)
                  }
                  type="checkbox"
                />
                <span>Sign out every other session after this change</span>
              </label>
              <button
                className="button button-solid"
                disabled={pendingAction !== null}
                type="submit"
              >
                {pendingAction === "password"
                  ? "Changing password..."
                  : "Change password"}
              </button>
            </form>
          </article>
        ) : (
          <ProviderGuidance
            authMethod={authMethod}
            emailRecoveryAvailable={emailRecoveryAvailable}
          />
        )}

        {authMethod === "email" ? (
          <ProviderGuidance
            authMethod={authMethod}
            emailRecoveryAvailable={emailRecoveryAvailable}
          />
        ) : null}

        <article className="security-panel security-danger-panel">
          <span className="security-panel-label">Account-wide sign out</span>
          <h3>Sign out everywhere.</h3>
          <p>
            Revoke every Nodezuno session, including this browser. Use this if
            a device is lost or any session looks unfamiliar.
          </p>
          {confirmEverywhere ? (
            <div className="security-confirmation" role="group">
              <p>
                Confirm sign out everywhere. You will return to the sign-in
                page.
              </p>
              <div>
                <button
                  className="button security-danger-button"
                  disabled={pendingAction !== null}
                  onClick={() => void revokeEverySession()}
                  ref={revokeEverywhereConfirmRef}
                  type="button"
                >
                  {pendingAction === "everywhere"
                    ? "Signing out..."
                    : "Confirm sign out"}
                </button>
                <button
                  className="security-text-button"
                  disabled={pendingAction !== null}
                  onClick={closeConfirmation}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              className="button security-danger-button"
              disabled={pendingAction !== null}
              onClick={() => {
                confirmationTriggerRef.current =
                  document.activeElement instanceof HTMLButtonElement
                    ? document.activeElement
                    : null;
                setConfirmSessionToken(null);
                setConfirmEverywhere(true);
              }}
              type="button"
            >
              Sign out everywhere
            </button>
          )}
        </article>
      </div>
    </section>
  );
}

function SecurityHeading({
  authMethod,
  identifier,
}: {
  authMethod: AuthMethod;
  identifier: string;
}) {
  return (
    <div className="account-security-heading">
      <div>
        <span className="section-kicker">Account security</span>
        <h2 id="account-security-title">Protect the account you build with.</h2>
      </div>
      <dl>
        <div>
          <dt>Identity</dt>
          <dd>{authMethodLabel(authMethod)}</dd>
        </div>
        <div>
          <dt>Signed in as</dt>
          <dd>{identifier}</dd>
        </div>
      </dl>
    </div>
  );
}

function ProviderGuidance({
  authMethod,
  emailRecoveryAvailable,
}: {
  authMethod: AuthMethod;
  emailRecoveryAvailable: boolean;
}) {
  if (authMethod === "email") {
    return (
      <article className="security-panel">
        <span className="security-panel-label">Recovery</span>
        <h3>
          {emailRecoveryAvailable
            ? "Recovery email is available."
            : "Protect your only recovery path."}
        </h3>
        <p>
          {emailRecoveryAvailable
            ? "Nodezuno can send a time-limited password recovery link to this account email."
            : "Automated recovery email is not configured on this deployment. Confirm your password before signing out and keep it in a trusted password manager."}
        </p>
        {emailRecoveryAvailable ? (
          <Link
            className="security-text-link"
            href="/forgot-password?return_to=%2Faccount"
          >
            Start password recovery
          </Link>
        ) : null}
        <small>
          Additional provider linking is not available in the review portal yet. Use
          this same email identity when you return.
        </small>
      </article>
    );
  }

  if (authMethod === "google") {
    return (
      <article className="security-panel">
        <span className="security-panel-label">Google identity</span>
        <h3>Google controls password and recovery.</h3>
        <p>
          Nodezuno does not store a local password for this identity. Review
          recovery methods and suspicious activity in the Google account used
          here.
        </p>
        <a
          className="security-text-link"
          href="https://myaccount.google.com/security"
          rel="noreferrer"
          target="_blank"
        >
          Open Google security <span aria-hidden="true">↗</span>
        </a>
        <small>
          Provider linking is not available in the review portal yet. Continue with
          this same Google identity to avoid creating a separate account.
        </small>
      </article>
    );
  }

  if (authMethod === "evm" || authMethod === "solana") {
    return (
      <article className="security-panel">
        <span className="security-panel-label">Wallet identity</span>
        <h3>Your wallet signature is the credential.</h3>
        <p>
          Nodezuno sign-in never needs a seed phrase, token approval, gas, or a
          transaction. Keep the wallet recovery material offline and reject any
          request that asks for more than the sign-in message.
        </p>
        <small>
          Email password recovery does not apply to this account. Provider
          linking is not available in the review portal yet, so return with the same
          wallet.
        </small>
      </article>
    );
  }

  return (
    <article className="security-panel">
      <span className="security-panel-label">Hosted provider</span>
      <h3>Recovery stays with ChatGPT.</h3>
      <p>
        Review password, multifactor authentication, and recovery settings in
        the ChatGPT account that opened this Nodezuno session.
      </p>
    </article>
  );
}

function SessionRow({
  confirmRef,
  confirmationOpen = false,
  current = false,
  disabled = false,
  onCancel,
  onConfirm,
  onRequestConfirmation,
  pending = false,
  session,
}: {
  confirmRef?: RefObject<HTMLButtonElement | null>;
  confirmationOpen?: boolean;
  current?: boolean;
  disabled?: boolean;
  onCancel?: () => void;
  onConfirm?: () => void;
  onRequestConfirmation?: () => void;
  pending?: boolean;
  session: StoredSession;
}) {
  const sessionLabel = describeUserAgent(session.userAgent);
  return (
    <article
      className={`security-session-row${current ? " security-current-session" : ""}`}
      role={current ? undefined : "listitem"}
    >
      <div className="security-session-icon" aria-hidden="true">
        {current ? "●" : "○"}
      </div>
      <div className="security-session-main">
        <div>
          <strong>{sessionLabel}</strong>
          {current ? <span>This session</span> : null}
        </div>
        <dl>
          <div>
            <dt>Started</dt>
            <dd>{formatDate(session.createdAt)}</dd>
          </div>
          <div>
            <dt>Last refreshed</dt>
            <dd>{formatDate(session.updatedAt)}</dd>
          </div>
          <div>
            <dt>Expires</dt>
            <dd>{formatDate(session.expiresAt)}</dd>
          </div>
          <div>
            <dt>Network</dt>
            <dd>{session.ipAddress?.trim() || "Unavailable"}</dd>
          </div>
        </dl>
      </div>
      {!current && onRequestConfirmation ? (
        <div className="security-session-control">
          {confirmationOpen ? (
            <div className="security-session-confirm" role="group">
              <span>Sign out this session?</span>
              <div>
                <button
                  className="security-danger-link"
                  disabled={pending || disabled}
                  onClick={onConfirm}
                  ref={confirmRef}
                  type="button"
                >
                  {pending ? "Signing out..." : "Confirm"}
                </button>
                <button
                  className="security-text-button"
                  disabled={pending || disabled}
                  onClick={onCancel}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              className="security-text-button"
              disabled={disabled}
              onClick={onRequestConfirmation}
              type="button"
            >
              Sign out
            </button>
          )}
        </div>
      ) : null}
    </article>
  );
}

function authMethodLabel(authMethod: AuthMethod): string {
  const labels: Record<AuthMethod, string> = {
    chatgpt: "ChatGPT hosted identity",
    email: "Email and password",
    evm: "EVM wallet",
    google: "Google",
    solana: "Solana wallet",
  };
  return labels[authMethod];
}

function describeUserAgent(userAgent?: string | null): string {
  if (!userAgent?.trim()) return "Unknown browser";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Chrome\//.test(userAgent) && !/Chromium\//.test(userAgent)
      ? "Chrome"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Safari\//.test(userAgent) && /Version\//.test(userAgent)
          ? "Safari"
          : "Browser";
  const platform = /iPhone/.test(userAgent)
    ? "iPhone"
    : /iPad/.test(userAgent)
      ? "iPad"
      : /Android/.test(userAgent)
        ? "Android"
        : /Macintosh|Mac OS X/.test(userAgent)
          ? "macOS"
          : /Windows/.test(userAgent)
            ? "Windows"
            : /Linux/.test(userAgent)
              ? "Linux"
              : null;
  return platform ? `${browser} on ${platform}` : browser;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function isCurrentSession(
  session: StoredSession,
  current: StoredSession | null,
): boolean {
  if (!current) return false;
  return session.id === current.id || session.token === current.token;
}

function sortSessions(sessions: StoredSession[]): StoredSession[] {
  return [...sessions].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() -
      new Date(left.updatedAt).getTime(),
  );
}

async function authFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    requestTimeoutMs,
  );
  try {
    return await fetch(path, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...init?.headers,
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        "The security request timed out. Check your connection and try again.",
      );
    }
    if (error instanceof TypeError) {
      throw new Error(
        "Nodezuno could not be reached. Check your connection and try again.",
        { cause: error },
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function postAuth(
  path: string,
  body: Record<string, unknown>,
  fallback: string,
): Promise<unknown> {
  const response = await authFetch(path, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return readResponse(response, fallback);
}

async function readResponse<T>(
  response: Response,
  fallback: string,
): Promise<T> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new AuthRequestError(
      response.status,
      problemMessage(payload, fallback),
      problemCode(payload),
    );
  }
  return payload as T;
}

class AuthRequestError extends Error {
  code: string | null;
  status: number;

  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.name = "AuthRequestError";
    this.status = status;
    this.code = code;
  }
}

function problemCode(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>).code;
  return typeof value === "string" ? value : null;
}

function problemMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const candidate = payload as Record<string, unknown>;
  for (const key of ["message", "detail", "title", "error"]) {
    const value = candidate[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

function passwordErrorMessage(error: unknown): string {
  if (error instanceof AuthRequestError) {
    if (error.code === "INVALID_PASSWORD") {
      return "The current password is incorrect.";
    }
    if (error.code === "PASSWORD_TOO_SHORT") {
      return "Choose a password with at least 12 characters.";
    }
    if (error.code === "PASSWORD_TOO_LONG") {
      return "Choose a password with no more than 128 characters.";
    }
    if (error.code === "CREDENTIAL_ACCOUNT_NOT_FOUND") {
      return "This identity does not have a Nodezuno password.";
    }
  }
  return errorMessage(error, "We could not change your password.");
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}
