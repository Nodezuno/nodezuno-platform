"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  rpcNetworkDescriptor,
  type SelfServiceRpcNetwork,
} from "@/lib/client/rpc-networks";
import {
  isRpcMethodName,
  parsePolicyLines,
  parseRpcAccessPolicyEnvelope,
  rpcPolicyDraftProblem,
  rpcPolicyUpdatePayload,
  type RpcAccessPolicy,
  type RpcAccessPolicySnapshot,
} from "@/lib/client/rpc-access-policy";

type DraftPolicy = {
  allowedOrigins: string;
  allowedIpCidrs: string;
  allowedMethods: string;
};

type PanelState = "loading" | "ready" | "saving" | "error";

const commonMethods: Record<SelfServiceRpcNetwork, readonly string[]> = {
  ethereum: [
    "eth_chainId",
    "eth_blockNumber",
    "eth_getBalance",
    "eth_getBlockByNumber",
    "eth_call",
    "eth_getTransactionReceipt",
    "eth_feeHistory",
    "net_version",
  ],
  base: [
    "eth_chainId",
    "eth_blockNumber",
    "eth_getBalance",
    "eth_getBlockByNumber",
    "eth_call",
    "eth_getTransactionReceipt",
    "eth_feeHistory",
    "net_version",
  ],
  solana: [
    "getHealth",
    "getLatestBlockhash",
    "getBalance",
    "getAccountInfo",
    "getBlock",
    "getTransaction",
    "getSignatureStatuses",
    "sendTransaction",
  ],
};

export function RpcAccessPolicyPanel({
  methodCatalog = [],
  network,
  serviceId,
  serviceName,
}: {
  methodCatalog?: readonly string[];
  network: SelfServiceRpcNetwork;
  serviceId: string;
  serviceName: string;
}) {
  const descriptor = rpcNetworkDescriptor(network);
  const [snapshot, setSnapshot] =
    useState<RpcAccessPolicySnapshot | null>(null);
  const [draft, setDraft] = useState<DraftPolicy>(emptyDraft);
  const [panelState, setPanelState] = useState<PanelState>("loading");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const reloadTriggerRef = useRef<HTMLButtonElement | null>(null);
  const requestController = useRef<AbortController | null>(null);
  const endpoint = `/api/v1/developer/services/${encodeURIComponent(
    serviceId,
  )}/rpc-access-policy`;

  const parsedDraft = useMemo(
    () => ({
      allowedOrigins: parsePolicyLines(draft.allowedOrigins),
      allowedIpCidrs: parsePolicyLines(draft.allowedIpCidrs),
      allowedMethods: parsePolicyLines(draft.allowedMethods),
    }),
    [draft],
  );
  const dirty =
    snapshot !== null &&
    JSON.stringify(parsedDraft) !== JSON.stringify(snapshot.policy);
  const busy =
    panelState === "loading" || panelState === "saving";
  const suggestions =
    methodCatalog.length > 0
      ? [...new Set(methodCatalog)].filter(isRpcMethodName).sort()
      : [...commonMethods[network]];
  const methodSuggestionLabel =
    methodCatalog.length > 0
      ? "Methods reported by this gateway"
      : `Common ${descriptor.label} methods`;

  const loadPolicy = useCallback(
    async (replaceDraft: boolean) => {
      requestController.current?.abort();
      const controller = new AbortController();
      requestController.current = controller;
      setPanelState("loading");
      setError("");

      try {
        const response = await fetch(endpoint, {
          cache: "no-store",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        const payload = await readJson(response);
        if (!response.ok) {
          throw new Error(
            responseProblem(
              payload,
              "The RPC access policy could not be loaded.",
            ),
          );
        }
        const nextSnapshot = parseRpcAccessPolicyEnvelope(
          payload,
          serviceId,
          network,
        );
        setSnapshot(nextSnapshot);
        if (replaceDraft) setDraft(draftFromPolicy(nextSnapshot.policy));
        setConflict(false);
        setConfirmReload(false);
        setPanelState("ready");
      } catch (caught) {
        if (controller.signal.aborted) return;
        setPanelState("error");
        setConfirmReload(false);
        setError(
          caught instanceof Error
            ? caught.message
            : "The RPC access policy could not be loaded.",
        );
      } finally {
        if (requestController.current === controller) {
          requestController.current = null;
        }
      }
    },
    [endpoint, network, serviceId],
  );

  useEffect(() => {
    const task = window.setTimeout(() => {
      void loadPolicy(true);
    }, 0);
    return () => {
      window.clearTimeout(task);
      requestController.current?.abort();
    };
  }, [loadPolicy]);

  function cancelReload() {
    setConfirmReload(false);
    window.requestAnimationFrame(() => {
      reloadTriggerRef.current?.focus();
    });
  }

  async function reloadPolicy(focusTargetId: string) {
    await loadPolicy(true);
    window.requestAnimationFrame(() => {
      document.getElementById(focusTargetId)?.focus();
    });
  }

  function requestReload() {
    if (dirty) {
      setConfirmReload(true);
      return;
    }
    void reloadPolicy("rpc-policy-reload-trigger");
  }

  function discardDraft() {
    if (!snapshot) return;
    setDraft(draftFromPolicy(snapshot.policy));
    setConflict(false);
    setError("");
    window.requestAnimationFrame(() => {
      reloadTriggerRef.current?.focus();
    });
  }

  function addSuggestedMethod(method: string) {
    if (parsedDraft.allowedMethods.includes(method)) return;
    setDraft((current) => ({
      ...current,
      allowedMethods: [current.allowedMethods.trim(), method]
        .filter(Boolean)
        .join("\n"),
    }));
  }

  async function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!snapshot || panelState !== "ready" || !dirty) return;

    const clientProblem = rpcPolicyDraftProblem(parsedDraft);
    if (clientProblem) {
      setError(clientProblem);
      setConflict(false);
      return;
    }

    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setPanelState("saving");
    setError("");
    setConflict(false);

    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          rpcPolicyUpdatePayload(snapshot.revision, parsedDraft),
        ),
        signal: controller.signal,
      });
      const payload = await readJson(response);
      if (response.status === 409) {
        setConflict(true);
        setPanelState("ready");
        setError(
          "This policy changed after you loaded it. Your edits are still here. Reload the latest revision before saving again.",
        );
        return;
      }
      if (!response.ok) {
        throw new Error(
          responseProblem(
            payload,
            "The RPC access policy could not be saved.",
          ),
        );
      }
      const nextSnapshot = parseRpcAccessPolicyEnvelope(
        payload,
        serviceId,
        network,
      );
      setSnapshot(nextSnapshot);
      setDraft(draftFromPolicy(nextSnapshot.policy));
      setPanelState("ready");
    } catch (caught) {
      if (controller.signal.aborted) return;
      setPanelState("ready");
      setError(
        caught instanceof Error
          ? caught.message
          : "The RPC access policy could not be saved.",
      );
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
      }
    }
  }

  return (
    <section
      aria-busy={
        panelState === "loading" || panelState === "saving"
      }
      aria-labelledby="rpc-access-policy-title"
      className="rpc-access-policy"
      id="rpc-access-policy"
    >
      <div className="rpc-access-policy-heading">
        <div>
          <span>Service security</span>
          <h3 id="rpc-access-policy-title" tabIndex={-1}>
            RPC access policy
          </h3>
          <p>
            Restrict {serviceName} by exact web origin, source address,
            and RPC method. These controls apply in addition to the
            platform gateway policy and service-bound API key.
          </p>
        </div>
        <div className="rpc-access-policy-revision">
          <span>
            {snapshot ? `Revision ${snapshot.revision}` : "Loading revision"}
          </span>
          <small>
            {snapshot?.updatedAt
              ? `Updated ${formatDate(snapshot.updatedAt)}`
              : "No saved change timestamp"}
          </small>
        </div>
      </div>

      {panelState === "loading" && !snapshot ? (
        <div className="rpc-access-policy-loading" role="status">
          Loading the saved policy for this service.
        </div>
      ) : panelState === "error" && !snapshot ? (
        <div className="rpc-access-policy-load-error" role="alert">
          <strong>Policy unavailable</strong>
          <p>{error}</p>
          <button
            className="button button-outline"
            onClick={() => void reloadPolicy("rpc-access-policy-title")}
            type="button"
          >
            Retry policy load
          </button>
        </div>
      ) : snapshot ? (
        <form onSubmit={savePolicy}>
          <div className="rpc-access-policy-grid">
            <label>
              <span>Allowed HTTPS origins</span>
              <textarea
                autoCapitalize="none"
                disabled={busy}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    allowedOrigins: event.target.value,
                  }))
                }
                placeholder={"https://app.example.com\nhttps://admin.example.com"}
                spellCheck={false}
                value={draft.allowedOrigins}
              />
              <small>
                One exact HTTPS origin per line. No paths, trailing
                slashes, credentials, or wildcards.
              </small>
            </label>

            <label>
              <span>Allowed IP addresses and CIDRs</span>
              <textarea
                autoCapitalize="none"
                disabled={busy}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    allowedIpCidrs: event.target.value,
                  }))
                }
                placeholder={"203.0.113.10\n198.51.100.0/24\n2001:db8::/48"}
                spellCheck={false}
                value={draft.allowedIpCidrs}
              />
              <small>
                One IPv4, IPv6, or CIDR range per line. Use the address
                seen by the gateway, which may be your NAT egress.
              </small>
            </label>

            <label className="rpc-access-policy-methods">
              <span>Allowed RPC methods</span>
              <textarea
                autoCapitalize="none"
                disabled={busy}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    allowedMethods: event.target.value,
                  }))
                }
                placeholder={
                  network === "solana"
                    ? "getHealth\ngetLatestBlockhash"
                    : "eth_chainId\neth_blockNumber"
                }
                spellCheck={false}
                value={draft.allowedMethods}
              />
              <small>
                One exact method per line. This allowlist cannot enable a
                method blocked by the platform safety policy.
              </small>
            </label>
          </div>

          <div
            aria-label={methodSuggestionLabel}
            className="rpc-access-policy-suggestions"
          >
            <span>{methodSuggestionLabel}</span>
            <div>
              {suggestions.map((method) => (
                <button
                  disabled={
                    busy ||
                    parsedDraft.allowedMethods.includes(method)
                  }
                  key={method}
                  onClick={() => addSuggestedMethod(method)}
                  type="button"
                >
                  {method}
                </button>
              ))}
            </div>
          </div>

          <div className="rpc-access-policy-safety" role="note">
            <strong>Empty means no extra restriction, not public CORS.</strong>
            <p>
              Empty origins, address ranges, or methods leave that policy
              dimension unrestricted at the gateway. An empty origin list
              does not enable cross-origin browser access. Nodezuno never
              offers a wildcard origin option.
            </p>
          </div>

          <div aria-live="polite" className="rpc-access-policy-feedback">
            {error ? (
              <p
                className={conflict ? "is-conflict" : "is-error"}
                role="alert"
              >
                {error}
              </p>
            ) : !dirty && panelState === "ready" ? (
              <p className="is-saved" role="status">
                Policy revision {snapshot.revision} is saved.
              </p>
            ) : dirty ? (
              <p role="status">Unsaved policy changes.</p>
            ) : null}
          </div>

          <div className="rpc-access-policy-actions">
            <button
              className="button button-solid"
              disabled={panelState !== "ready" || !dirty}
              type="submit"
            >
              {panelState === "saving"
                ? "Saving policy..."
                : "Save access policy"}
            </button>
            <button
              className="button button-outline"
              disabled={busy || !dirty}
              onClick={discardDraft}
              type="button"
            >
              Discard edits
            </button>
            <button
              className="button button-outline"
              disabled={busy}
              id="rpc-policy-reload-trigger"
              onClick={requestReload}
              ref={reloadTriggerRef}
              type="button"
            >
              Reload saved policy
            </button>
          </div>

          {confirmReload ? (
            <div
              aria-label="Reload RPC access policy confirmation"
              className="rpc-access-policy-reload-confirm"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelReload();
                }
              }}
              role="group"
            >
              <p id="rpc-policy-reload-warning">
                Reloading replaces your unsaved edits with the latest saved
                policy revision.
              </p>
              <button
                aria-describedby="rpc-policy-reload-warning"
                autoFocus
                className="button button-solid"
                disabled={busy}
                onClick={() =>
                  void reloadPolicy("rpc-policy-reload-trigger")
                }
                type="button"
              >
                Confirm reload
              </button>
              <button
                className="button button-outline"
                disabled={busy}
                onClick={cancelReload}
                type="button"
              >
                Keep editing
              </button>
            </div>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}

function emptyDraft(): DraftPolicy {
  return {
    allowedOrigins: "",
    allowedIpCidrs: "",
    allowedMethods: "",
  };
}

function draftFromPolicy(policy: RpcAccessPolicy): DraftPolicy {
  return {
    allowedOrigins: policy.allowedOrigins.join("\n"),
    allowedIpCidrs: policy.allowedIpCidrs.join("\n"),
    allowedMethods: policy.allowedMethods.join("\n"),
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function responseProblem(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const candidate = payload as Record<string, unknown>;
  for (const key of ["detail", "message", "title", "error"]) {
    if (typeof candidate[key] === "string" && candidate[key].trim()) {
      return candidate[key].trim();
    }
  }
  if (
    candidate.fields &&
    typeof candidate.fields === "object" &&
    !Array.isArray(candidate.fields)
  ) {
    const messages = Object.values(
      candidate.fields as Record<string, unknown>,
    ).filter(
      (value): value is string =>
        typeof value === "string" && Boolean(value.trim()),
    );
    if (messages.length > 0) return messages.join(" ");
  }
  return fallback;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "at an unavailable time";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
