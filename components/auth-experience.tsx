"use client";

import { getWallets } from "@wallet-standard/app";
import type { Wallet } from "@wallet-standard/base";
import {
  SolanaSignIn,
  SolanaSignMessage,
  type SolanaSignInFeature,
  type SolanaSignMessageFeature,
} from "@solana/wallet-standard-features";
import { StandardConnect, type StandardConnectFeature } from "@wallet-standard/features";
import { createSignInMessage } from "@solana/wallet-standard-util";
import type { Address, Hex } from "viem";
import { createSiweMessage } from "viem/siwe";
import Link from "next/link";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AuthProviderAvailability } from "@/lib/server/auth";
import styles from "./auth-experience.module.css";

type AuthMode = "login" | "signup";
type SubmissionState =
  | "idle"
  | "email"
  | "google"
  | "evm"
  | `solana:${string}`;

type EthereumProvider = {
  request(options: {
    method: string;
    params?: readonly unknown[];
  }): Promise<unknown>;
};

type AuthExperienceProps = {
  mode: AuthMode;
  providers: AuthProviderAvailability;
  returnTo: string;
  initialError?: string;
};

type SolanaChallenge = {
  input: {
    domain?: string;
    address?: string;
    statement?: string;
    uri?: string;
    version?: string;
    chainId?: string;
    nonce?: string;
    issuedAt?: string;
    expirationTime?: string;
    requestId?: string;
    resources?: readonly string[];
  };
};

const SIWE_STATEMENT =
  "Sign in to Nodezuno. This request does not create a transaction or cost gas.";

export function AuthExperience({
  mode,
  providers,
  returnTo,
  initialError = "",
}: AuthExperienceProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submission, setSubmission] =
    useState<SubmissionState>("idle");
  const [error, setError] = useState(initialError);
  const [walletPanel, setWalletPanel] = useState(false);
  const [solanaWallets, setSolanaWallets] = useState<readonly Wallet[]>([]);
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  const walletPanelRef = useRef<HTMLDivElement | null>(null);
  const walletToggleRef = useRef<HTMLButtonElement | null>(null);
  const isSubmitting = submission !== "idle";
  const submissionMessage =
    submission === "email"
      ? mode === "signup"
        ? "Creating your account."
        : "Signing in to your review portal."
      : submission === "google"
        ? "Opening Google sign-in."
        : submission === "evm"
          ? "Waiting for your EVM wallet signature."
          : submission.startsWith("solana:")
            ? "Waiting for your Solana wallet signature."
            : "";
  const title =
    mode === "signup"
      ? "Create your account."
      : "Welcome back.";

  useEffect(() => {
    const registry = getWallets();
    const refresh = () => setSolanaWallets(registry.get().filter(isSolanaWallet));
    refresh();
    const offRegister = registry.on("register", refresh);
    const offUnregister = registry.on("unregister", refresh);
    return () => {
      offRegister();
      offUnregister();
    };
  }, []);

  useEffect(() => {
    if (!error) return;
    const task = window.requestAnimationFrame(() => {
      errorRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(task);
  }, [error]);

  useEffect(() => {
    if (!walletPanel) return;
    const task = window.requestAnimationFrame(() => {
      walletPanelRef.current
        ?.querySelector<HTMLButtonElement>("button")
        ?.focus();
    });
    return () => window.cancelAnimationFrame(task);
  }, [walletPanel]);

  const alternatePath = useMemo(() => {
    const pathname = mode === "signup" ? "/login" : "/signup";
    return `${pathname}?return_to=${encodeURIComponent(returnTo)}`;
  }, [mode, returnTo]);

  function closeWalletPanel() {
    setWalletPanel(false);
    window.requestAnimationFrame(() => {
      walletToggleRef.current?.focus();
    });
  }

  async function authenticateWithEmail(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (!providers.email) {
      setError(
        "Email authentication is unavailable until verified mailbox delivery is configured.",
      );
      return;
    }
    setSubmission("email");
    setError("");
    try {
      const path =
        mode === "signup" ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email";
      await postJson(path, {
        ...(mode === "signup" ? { name: name.trim() } : {}),
        email: email.trim().toLowerCase(),
        password,
        callbackURL: returnTo,
      });
      window.location.assign(
        mode === "signup" && providers.emailVerification
          ? `/login?error=verify_email&return_to=${encodeURIComponent(returnTo)}`
          : returnTo,
      );
    } catch (caught) {
      setError(errorMessage(caught));
      setSubmission("idle");
    }
  }

  async function authenticateWithGoogle() {
    if (!providers.google) return;
    setSubmission("google");
    setError("");
    try {
      const response = await postJson<{ url?: string }>(
        "/api/auth/sign-in/social",
        {
          provider: "google",
          callbackURL: returnTo,
          newUserCallbackURL: returnTo,
          errorCallbackURL: `${
            mode === "signup" ? "/signup" : "/login"
          }?error=google&return_to=${encodeURIComponent(returnTo)}`,
        },
      );
      if (!response.url) {
        throw new Error("Google sign-in could not be started.");
      }
      window.location.assign(response.url);
    } catch (caught) {
      setError(errorMessage(caught));
      setSubmission("idle");
    }
  }

  async function authenticateWithEvm() {
    setSubmission("evm");
    setError("");
    try {
      const ethereum = (window as Window & { ethereum?: EthereumProvider })
        .ethereum;
      if (!ethereum) {
        throw new Error(
          "No browser EVM wallet was detected. Install or unlock a compatible wallet and try again.",
        );
      }
      const accounts = await ethereum.request({
        method: "eth_requestAccounts",
      });
      const address = Array.isArray(accounts) ? accounts[0] : null;
      if (
        typeof address !== "string" ||
        !/^0x[0-9a-fA-F]{40}$/.test(address)
      ) {
        throw new Error("The wallet did not return a valid EVM account.");
      }
      const rawChainId = await ethereum.request({ method: "eth_chainId" });
      const chainId =
        typeof rawChainId === "string" ? Number.parseInt(rawChainId, 16) : NaN;
      if (!providers.evmChainIds.includes(chainId)) {
        throw new Error(
          "Switch to Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain, Avalanche, or a supported testnet.",
        );
      }

      const challenge = await postJson<{ nonce: string }>(
        "/api/auth/siwe/nonce",
        {},
      );
      const issuedAt = new Date();
      const expirationTime = new Date(issuedAt.getTime() + 5 * 60 * 1000);
      const scheme = window.location.protocol.slice(0, -1);
      const message = createSiweMessage({
        address: address as Address,
        chainId,
        domain: window.location.host,
        scheme,
        nonce: challenge.nonce,
        uri: window.location.origin,
        version: "1",
        statement: SIWE_STATEMENT,
        issuedAt,
        expirationTime,
      });
      const signature = await ethereum.request({
        method: "personal_sign",
        params: [message, address],
      });
      if (
        typeof signature !== "string" ||
        !/^0x[0-9a-fA-F]{130}$/.test(signature)
      ) {
        throw new Error("The wallet did not return a valid signature.");
      }
      await postJson("/api/auth/siwe/verify", {
        message,
        signature: signature as Hex,
      });
      window.location.assign(returnTo);
    } catch (caught) {
      setError(errorMessage(caught, true));
      setSubmission("idle");
    }
  }

  async function authenticateWithSolana(wallet: Wallet) {
    setSubmission(`solana:${wallet.name}`);
    setError("");
    try {
      let address: string;
      let signedMessage: Uint8Array;
      let signature: Uint8Array;
      let signatureType: "ed25519" | undefined;

      if (SolanaSignIn in wallet.features) {
        const challenge = await postJson<SolanaChallenge>(
          "/api/auth/solana/nonce",
          {},
        );
        const feature = wallet.features[
          SolanaSignIn
        ] as SolanaSignInFeature[typeof SolanaSignIn];
        const [output] = await feature.signIn(challenge.input);
        if (!output) throw new Error("The wallet did not sign the request.");
        address = output.account.address;
        signedMessage = output.signedMessage;
        signature = output.signature;
        signatureType = output.signatureType;
      } else {
        const connectFeature = wallet.features[
          StandardConnect
        ] as StandardConnectFeature[typeof StandardConnect];
        const { accounts } = await connectFeature.connect();
        const account = accounts.find((candidate) =>
          candidate.chains.some((chain) => chain.startsWith("solana:")),
        );
        if (!account) {
          throw new Error("The wallet did not return a Solana account.");
        }
        const challenge = await postJson<SolanaChallenge>(
          "/api/auth/solana/nonce",
          { address: account.address },
        );
        const signMessageFeature = wallet.features[
          SolanaSignMessage
        ] as SolanaSignMessageFeature[typeof SolanaSignMessage];
        const [output] = await signMessageFeature.signMessage({
          account,
          message: createSignInMessage({
            ...challenge.input,
            address: account.address,
            domain: challenge.input.domain!,
          }),
        });
        if (!output) throw new Error("The wallet did not sign the request.");
        address = account.address;
        signedMessage = output.signedMessage;
        signature = output.signature;
        signatureType = output.signatureType;
      }

      await postJson("/api/auth/solana/verify", {
        address,
        signedMessage: encodeBase64Url(signedMessage),
        signature: encodeBase64Url(signature),
        signatureType,
      });
      window.location.assign(returnTo);
    } catch (caught) {
      setError(errorMessage(caught, true));
      setSubmission("idle");
    }
  }

  return (
    <main id="main-content" className={styles.page}>
      <section className={styles.shell} aria-labelledby="auth-title">
        <div className={styles.story}>
          <span className={styles.eyebrow}>CLIENT PORTAL</span>
          <h1 id="auth-title">{title}</h1>
          <p>
            Track your release reviews, payments, and reports in one private
            place.
          </p>
          <ul>
            <li>
              <span aria-hidden="true">01</span>
              Service orders and review progress
            </li>
            <li>
              <span aria-hidden="true">02</span>
              Payment confirmations
            </li>
            <li>
              <span aria-hidden="true">03</span>
              Reports released to your account
            </li>
          </ul>
          <p className={styles.serviceLink}>
            New to Nodezuno? <Link href="/product">Explore the review service</Link>.
          </p>
        </div>

        <div aria-busy={isSubmitting} className={`${styles.card} auth-card`}>
          <div className="auth-card-heading">
            <h2>
              {mode === "signup"
                ? "Choose how to join."
                : "Sign in to your account."}
            </h2>
            <p>Choose an available sign-in method below.</p>
          </div>
          <p
            aria-live="polite"
            className="sr-only"
            role="status"
          >
            {submissionMessage}
          </p>

          {providers.google ? (
            <button
              className="auth-provider-button auth-google"
              disabled={isSubmitting}
              onClick={() => void authenticateWithGoogle()}
              type="button"
            >
              <span aria-hidden="true"><GoogleMark /></span>
              {submission === "google"
                ? "Opening Google..."
                : "Continue with Google"}
            </button>
          ) : null}

          <button
            aria-controls="auth-wallet-options"
            aria-describedby="auth-wallet-help"
            aria-expanded={walletPanel}
            className="auth-provider-button auth-wallet"
            disabled={isSubmitting}
            onClick={() => setWalletPanel((current) => !current)}
            ref={walletToggleRef}
            type="button"
          >
            <span aria-hidden="true"><WalletMark /></span>
            Continue with a wallet
            <i aria-hidden="true">{walletPanel ? "−" : "+"}</i>
          </button>
          <p className="auth-provider-help" id="auth-wallet-help">
            {providers.email
              ? "Email works without a wallet. Wallet sign-in only proves ownership with a message signature and never sends a transaction."
              : "Email authentication is not enabled on this deployment. Wallet sign-in proves ownership with a message signature and never sends a transaction."}
          </p>

          {walletPanel ? (
            <div
              aria-label="Wallet sign-in options"
              className="auth-wallet-panel"
              id="auth-wallet-options"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeWalletPanel();
                }
              }}
              ref={walletPanelRef}
              role="region"
            >
              <button
                disabled={isSubmitting}
                onClick={() => void authenticateWithEvm()}
                type="button"
              >
                <span className="wallet-network-mark">EVM</span>
                <strong>Browser EVM wallet</strong>
                <small>
                  MetaMask, Coinbase Wallet, Rabby, and compatible wallets
                </small>
                <i>{submission === "evm" ? "Signing..." : "No gas"}</i>
              </button>
              {solanaWallets.map((wallet) => (
                <button
                  disabled={isSubmitting}
                  key={wallet.name}
                  onClick={() => void authenticateWithSolana(wallet)}
                  type="button"
                >
                  <span className="wallet-network-mark">SOL</span>
                  <strong>{wallet.name}</strong>
                  <small>Sign in with a Solana account</small>
                  <i>
                    {submission === `solana:${wallet.name}`
                      ? "Signing..."
                      : "No gas"}
                  </i>
                </button>
              ))}
              {solanaWallets.length === 0 ? (
                <p>
                  No compatible Solana wallet is visible in this browser.
                  Unlock Phantom, Backpack, Solflare, or another Wallet
                  Standard wallet, then refresh.
                </p>
              ) : null}
              <p className="wallet-security-note">
                Signing proves account ownership only. Nodezuno will not ask
                for a transaction, token approval, or seed phrase.
              </p>
            </div>
          ) : null}

          {error ? (
            <p
              className="auth-error"
              ref={errorRef}
              role="alert"
              tabIndex={-1}
            >
              {error}
            </p>
          ) : null}

          {providers.email ? (
            <>
              <div className="auth-divider">
                <span>email and password</span>
              </div>

              <form
                aria-describedby="auth-form-help"
                className="auth-email-form"
                onSubmit={authenticateWithEmail}
              >
            <p className="auth-form-help" id="auth-form-help">
              {mode === "signup"
                ? "Create the account here, then continue to your review request or portal."
                : "Use the identity associated with your Nodezuno review request."}
            </p>
            {mode === "signup" ? (
              <label>
                <span>Your name</span>
                <input
                  aria-describedby="auth-name-help"
                  autoComplete="name"
                  disabled={isSubmitting}
                  maxLength={80}
                  minLength={2}
                  onChange={(event) => {
                    setName(event.target.value);
                    if (error) setError("");
                  }}
                  placeholder="Your full name"
                  required
                  value={name}
                />
                <small className="auth-field-help" id="auth-name-help">
                  This name identifies you in review requests and engagement records.
                </small>
              </label>
            ) : null}
            <label>
              <span>Email address</span>
              <input
                aria-describedby="auth-email-help"
                autoCapitalize="none"
                autoComplete="email"
                disabled={isSubmitting}
                maxLength={254}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (error) setError("");
                }}
                placeholder="you@example.com"
                required
                spellCheck={false}
                type="email"
                value={email}
              />
              <small className="auth-field-help" id="auth-email-help">
                {mode === "signup" && providers.emailVerification
                  ? "Use an address you can verify before the first sign-in."
                  : "Use an address you can access for account recovery."}
              </small>
            </label>
            <label>
              <span>Password</span>
              <div className="auth-password-field">
                <input
                  aria-describedby="auth-password-help"
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  disabled={isSubmitting}
                  maxLength={128}
                  minLength={12}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (error) setError("");
                  }}
                  placeholder="At least 12 characters"
                  required
                  type={showPassword ? "text" : "password"}
                  value={password}
                />
                <button
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  disabled={isSubmitting}
                  onClick={() => setShowPassword((current) => !current)}
                  type="button"
                >
                  {showPassword ? "Hide" : "Show"}
                  </button>
              </div>
              <small className="auth-field-help" id="auth-password-help">
                12 to 128 characters. A password manager is recommended.
              </small>
            </label>

            {mode === "login" && providers.emailVerification ? (
              <p className="auth-recovery-link">
                <Link
                  href={`/forgot-password?return_to=${encodeURIComponent(returnTo)}`}
                >
                  Forgot your password?
                </Link>
              </p>
            ) : null}

            <button
              className="button button-solid auth-submit"
              disabled={
                isSubmitting ||
                password.length < 12 ||
                email.trim().length < 3 ||
                (mode === "signup" && name.trim().length < 2)
              }
              type="submit"
            >
              {submission === "email"
                ? mode === "signup"
                  ? "Creating account..."
                  : "Signing in..."
                : mode === "signup"
                  ? "Create account and continue"
                  : "Sign in"}
            </button>
              </form>
            </>
          ) : (
            <div className="auth-email-unavailable" role="status">
              <strong>Email signup is temporarily unavailable.</strong>
              <p>
                This deployment has not configured verified mailbox delivery.
                Use Google when offered or sign in with a wallet.
              </p>
            </div>
          )}

          <p className="auth-switch">
            {mode === "signup"
              ? "Already have an account?"
              : "New to Nodezuno?"}{" "}
            <Link href={alternatePath}>
              {mode === "signup" ? "Sign in" : "Create an account"}
            </Link>
          </p>
          <p className="auth-legal">
            By continuing, you acknowledge the Nodezuno{" "}
            <Link href="/legal/terms">Terms</Link> and{" "}
            <Link href="/legal/privacy">Privacy Summary</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}

function isSolanaWallet(wallet: Wallet): boolean {
  return (
    SolanaSignIn in wallet.features ||
    (StandardConnect in wallet.features &&
      SolanaSignMessage in wallet.features)
  );
}

async function postJson<T = Record<string, unknown>>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(path, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      if (controller.signal.aborted) {
        throw new Error(
          "Authentication timed out. Check your connection and try again.",
        );
      }
      payload = null;
    }
    if (!response.ok) {
      throw new Error(problemMessage(payload, response));
    }
    return payload as T;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        "Authentication timed out. Check your connection and try again.",
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

function problemMessage(payload: unknown, response: Response): string {
  let message = "Authentication could not be completed. Please try again.";
  let requestId = response.headers.get("x-request-id") ?? "";
  if (payload && typeof payload === "object") {
    const candidate = payload as Record<string, unknown>;
    if (typeof candidate.requestId === "string") {
      requestId = candidate.requestId;
    }
    for (const key of ["message", "title", "detail", "error"]) {
      if (typeof candidate[key] === "string" && candidate[key].trim()) {
        message = candidate[key].trim();
        break;
      }
    }
  }
  return /^[A-Za-z0-9._:-]{1,128}$/.test(requestId)
    ? `${message} Request ID: ${requestId}.`
    : message;
}

function errorMessage(error: unknown, walletRequest = false): string {
  if (
    walletRequest &&
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === 4001
  ) {
    return "Wallet sign-in was cancelled. You can try again.";
  }
  if (error instanceof Error) {
    if (walletRequest && /user rejected|user denied|user cancelled|user canceled/i.test(error.message)) {
      return "Wallet sign-in was cancelled. You can try again.";
    }
    return error.message;
  }
  return "Authentication could not be completed. Please try again.";
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" height="20" viewBox="0 0 24 24" width="20">
      <path d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.01v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.35Z" fill="#4285f4" />
      <path d="M12 22c2.7 0 4.96-.9 6.62-2.42l-3.24-2.51c-.9.6-2.05.97-3.38.97-2.6 0-4.81-1.75-5.6-4.1H3.05v2.59A10 10 0 0 0 12 22Z" fill="#34a853" />
      <path d="M6.4 13.94a6 6 0 0 1 0-3.88V7.47H3.05a10 10 0 0 0 0 9.06l3.35-2.59Z" fill="#fbbc05" />
      <path d="M12 5.96c1.47 0 2.79.5 3.82 1.5l2.87-2.86A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.95 5.47l3.35 2.59A5.97 5.97 0 0 1 12 5.96Z" fill="#ea4335" />
    </svg>
  );
}

function WalletMark() {
  return (
    <svg aria-hidden="true" fill="none" height="21" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" width="21">
      <path d="M19 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6" />
      <path d="M21 12h-5a2 2 0 0 0 0 4h5" />
      <circle cx="16.5" cy="14" fill="currentColor" r=".7" stroke="none" />
    </svg>
  );
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = "";
  value.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
