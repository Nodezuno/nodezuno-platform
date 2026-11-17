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
  parseRpcGuardrailEnvelope,
  rpcGuardrailUpdatePayload,
  type RpcGuardrailProduct,
  type RpcGuardrailSnapshot,
} from "@/lib/client/rpc-guardrail";
import type { SelfServiceRpcNetwork } from "@/lib/client/rpc-networks";
import {
  RPC_GUARDRAIL_MAX_HOURLY_QUOTA,
  RPC_GUARDRAIL_MAX_WARNING_PERCENT,
  RPC_GUARDRAIL_MIN_HOURLY_QUOTA,
  RPC_GUARDRAIL_MIN_WARNING_PERCENT,
} from "@/lib/server/rpc-guardrail";

type WorkspaceRole = "owner" | "admin" | "developer";
type PanelState = "loading" | "ready" | "saving" | "error";
type GuardrailDraft = {
  inheritWorkspaceLimit: boolean;
  hourlyQuotaLimit: string;
  warningThresholdPercent: string;
};

export function RpcGuardrailPanel({
  network,
  product,
  serviceId,
  serviceName,
  workspaceRole,
}: {
  network: SelfServiceRpcNetwork;
  product: RpcGuardrailProduct;
  serviceId: string;
  serviceName: string;
  workspaceRole: WorkspaceRole;
}) {
  const [snapshot, setSnapshot] =
    useState<RpcGuardrailSnapshot | null>(null);
  const [draft, setDraft] = useState<GuardrailDraft>(emptyDraft);
  const [panelState, setPanelState] = useState<PanelState>("loading");
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const requestController = useRef<AbortController | null>(null);
  const endpoint = `/api/v1/developer/services/${encodeURIComponent(
    serviceId,
  )}/quota-guardrail`;
  const canEdit =
    workspaceRole === "owner" || workspaceRole === "admin";
  const parsedDraft = useMemo(() => parseDraft(draft), [draft]);
  const dirty =
    snapshot !== null &&
    parsedDraft.ok &&
    (parsedDraft.hourlyQuotaLimit !== snapshot.hourlyQuotaLimit ||
      parsedDraft.warningThresholdPercent !==
        snapshot.warningThresholdPercent);
  const busy =
    panelState === "loading" || panelState === "saving";

  const loadGuardrail = useCallback(async () => {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setPanelState("loading");
    setError("");
    setSavedMessage("");
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
            "The service quota guardrail could not be loaded.",
          ),
        );
      }
      const next = parseRpcGuardrailEnvelope(payload, {
        serviceId,
        product,
        network,
      });
      setSnapshot(next);
      setDraft(draftFromSnapshot(next));
      setConflict(false);
      setPanelState("ready");
    } catch (caught) {
      if (controller.signal.aborted) return;
      setPanelState("error");
      setError(
        caught instanceof Error
          ? caught.message
          : "The service quota guardrail could not be loaded.",
      );
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
      }
    }
  }, [endpoint, network, product, serviceId]);

  useEffect(() => {
    const task = window.setTimeout(() => {
      void loadGuardrail();
    }, 0);
    return () => {
      window.clearTimeout(task);
      requestController.current?.abort();
    };
  }, [loadGuardrail]);

  async function saveGuardrail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!snapshot || !canEdit || !dirty || !parsedDraft.ok) {
      if (!parsedDraft.ok) setError(parsedDraft.message);
      return;
    }
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setPanelState("saving");
    setError("");
    setSavedMessage("");
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
          rpcGuardrailUpdatePayload({
            hourlyQuotaLimit: parsedDraft.hourlyQuotaLimit,
            warningThresholdPercent:
              parsedDraft.warningThresholdPercent,
            revision: snapshot.revision,
          }),
        ),
        signal: controller.signal,
      });
      const payload = await readJson(response);
      if (response.status === 409) {
        setConflict(true);
        setPanelState("ready");
        setError(
          "This guardrail changed after you loaded it. Your edits are still here. Reload the latest revision before saving again.",
        );
        return;
      }
      if (!response.ok) {
        throw new Error(
          responseProblem(
            payload,
            "The service quota guardrail could not be saved.",
          ),
        );
      }
      const next = parseRpcGuardrailEnvelope(payload, {
        serviceId,
        product,
        network,
      });
      setSnapshot(next);
      setDraft(draftFromSnapshot(next));
      setPanelState("ready");
      setSavedMessage("Guardrail saved and active for new requests.");
    } catch (caught) {
      if (controller.signal.aborted) return;
      setPanelState("ready");
      setError(
        caught instanceof Error
          ? caught.message
          : "The service quota guardrail could not be saved.",
      );
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
      }
    }
  }

  return (
    <section
      aria-busy={busy}
      aria-labelledby={`rpc-guardrail-title-${serviceId}`}
      className="rpc-guardrail"
    >
      <header className="rpc-guardrail-header">
        <div>
          <span>Cost and traffic control</span>
          <h3 id={`rpc-guardrail-title-${serviceId}`} tabIndex={-1}>
            Hourly service guardrail
          </h3>
          <p>
            Set a service safety ceiling for {serviceName}. It applies to
            authenticated {product === "grpc-api" ? "gRPC" : "RPC"} calls
            and can reduce, but never increase, the platform workspace
            ceiling.
          </p>
        </div>
        <div className="rpc-guardrail-revision">
          <span>{snapshot ? `Revision ${snapshot.revision}` : "Loading"}</span>
          <small>
            {snapshot?.updatedAt
              ? `Updated ${formatDate(snapshot.updatedAt)}`
              : "No saved override"}
          </small>
        </div>
      </header>

      {panelState === "loading" && !snapshot ? (
        <div className="rpc-guardrail-state" role="status">
          Loading the current service guardrail.
        </div>
      ) : panelState === "error" && !snapshot ? (
        <div className="rpc-guardrail-state is-error" role="alert">
          <strong>Guardrail unavailable</strong>
          <p>{error}</p>
          <button
            className="button button-outline"
            onClick={() => void loadGuardrail()}
            type="button"
          >
            Retry guardrail load
          </button>
        </div>
      ) : snapshot ? (
        <>
          <dl className="rpc-guardrail-summary">
            <div>
              <dt>Mode</dt>
              <dd>{snapshot.inherited ? "Inherited" : "Configured"}</dd>
            </div>
            <div>
              <dt>Effective service limit</dt>
              <dd>{formatWhole(snapshot.effectiveHourlyQuotaLimit)} / hour</dd>
            </div>
            <div>
              <dt>Workspace ceiling</dt>
              <dd>
                {formatWhole(
                  snapshot.platformWorkspaceHourlyQuotaLimit,
                )}{" "}
                / hour
              </dd>
            </div>
            <div>
              <dt>Warning threshold</dt>
              <dd>{snapshot.warningThresholdPercent}%</dd>
            </div>
          </dl>

          <form className="rpc-guardrail-form" onSubmit={saveGuardrail}>
            <label className="rpc-guardrail-inherit">
              <input
                checked={draft.inheritWorkspaceLimit}
                disabled={!canEdit || busy}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    inheritWorkspaceLimit: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              <span>
                <strong>Inherit the workspace ceiling</strong>
                <small>
                  Keep this service at the platform workspace limit.
                </small>
              </span>
            </label>

            <div className="rpc-guardrail-fields">
              <label>
                <span>Service calls per hour</span>
                <input
                  disabled={
                    !canEdit || busy || draft.inheritWorkspaceLimit
                  }
                  inputMode="numeric"
                  max={RPC_GUARDRAIL_MAX_HOURLY_QUOTA}
                  min={RPC_GUARDRAIL_MIN_HOURLY_QUOTA}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      hourlyQuotaLimit: event.target.value,
                    }))
                  }
                  required={!draft.inheritWorkspaceLimit}
                  step="1"
                  type="number"
                  value={draft.hourlyQuotaLimit}
                />
                <small>
                  {formatWhole(RPC_GUARDRAIL_MIN_HOURLY_QUOTA)} to{" "}
                  {formatWhole(RPC_GUARDRAIL_MAX_HOURLY_QUOTA)}
                </small>
              </label>
              <label>
                <span>Warning at percent used</span>
                <input
                  disabled={!canEdit || busy}
                  inputMode="numeric"
                  max={RPC_GUARDRAIL_MAX_WARNING_PERCENT}
                  min={RPC_GUARDRAIL_MIN_WARNING_PERCENT}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      warningThresholdPercent: event.target.value,
                    }))
                  }
                  required
                  step="1"
                  type="number"
                  value={draft.warningThresholdPercent}
                />
                <small>
                  {RPC_GUARDRAIL_MIN_WARNING_PERCENT}% to{" "}
                  {RPC_GUARDRAIL_MAX_WARNING_PERCENT}%
                </small>
              </label>
            </div>

            {!canEdit ? (
              <p className="rpc-guardrail-role-note">
                Your developer role can inspect this guardrail. Ask a
                workspace owner or administrator to change it.
              </p>
            ) : null}
            <div className="rpc-guardrail-actions">
              <button
                className="button button-solid"
                disabled={!dirty || !parsedDraft.ok || busy || !canEdit}
                type="submit"
              >
                {panelState === "saving"
                  ? "Saving guardrail..."
                  : "Save guardrail"}
              </button>
              {conflict ? (
                <button
                  className="button button-outline"
                  disabled={busy}
                  onClick={() => void loadGuardrail()}
                  type="button"
                >
                  Reload latest revision
                </button>
              ) : null}
            </div>
            <div aria-live="polite" className="rpc-guardrail-feedback">
              {error ? <p className="is-error">{error}</p> : null}
              {savedMessage ? (
                <p className="is-success">{savedMessage}</p>
              ) : null}
            </div>
          </form>
        </>
      ) : null}
    </section>
  );
}

function draftFromSnapshot(
  snapshot: RpcGuardrailSnapshot,
): GuardrailDraft {
  return {
    inheritWorkspaceLimit: snapshot.inherited,
    hourlyQuotaLimit: String(
      snapshot.hourlyQuotaLimit ??
        snapshot.effectiveHourlyQuotaLimit,
    ),
    warningThresholdPercent: String(snapshot.warningThresholdPercent),
  };
}

function parseDraft(
  draft: GuardrailDraft,
):
  | {
      ok: true;
      hourlyQuotaLimit: number | null;
      warningThresholdPercent: number;
    }
  | { ok: false; message: string } {
  const warning = Number(draft.warningThresholdPercent);
  if (
    !Number.isSafeInteger(warning) ||
    warning < RPC_GUARDRAIL_MIN_WARNING_PERCENT ||
    warning > RPC_GUARDRAIL_MAX_WARNING_PERCENT
  ) {
    return {
      ok: false,
      message: `Use a warning threshold from ${RPC_GUARDRAIL_MIN_WARNING_PERCENT}% through ${RPC_GUARDRAIL_MAX_WARNING_PERCENT}%.`,
    };
  }
  if (draft.inheritWorkspaceLimit) {
    return {
      ok: true,
      hourlyQuotaLimit: null,
      warningThresholdPercent: warning,
    };
  }
  const limit = Number(draft.hourlyQuotaLimit);
  if (
    !Number.isSafeInteger(limit) ||
    limit < RPC_GUARDRAIL_MIN_HOURLY_QUOTA ||
    limit > RPC_GUARDRAIL_MAX_HOURLY_QUOTA
  ) {
    return {
      ok: false,
      message: `Use an hourly limit from ${formatWhole(RPC_GUARDRAIL_MIN_HOURLY_QUOTA)} through ${formatWhole(RPC_GUARDRAIL_MAX_HOURLY_QUOTA)}.`,
    };
  }
  return {
    ok: true,
    hourlyQuotaLimit: limit,
    warningThresholdPercent: warning,
  };
}

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("The guardrail API returned an invalid response.");
  }
  return response.json() as Promise<unknown>;
}

function responseProblem(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return fallback;
  }
  const candidate = payload as {
    title?: unknown;
    detail?: unknown;
    fields?: unknown;
  };
  if (typeof candidate.detail === "string" && candidate.detail) {
    return candidate.detail;
  }
  if (candidate.fields && typeof candidate.fields === "object") {
    const first = Object.values(
      candidate.fields as Record<string, unknown>,
    ).find((value) => typeof value === "string");
    if (typeof first === "string") return first;
  }
  return typeof candidate.title === "string" && candidate.title
    ? candidate.title
    : fallback;
}

function formatWhole(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

const emptyDraft: GuardrailDraft = {
  inheritWorkspaceLimit: true,
  hourlyQuotaLimit: "",
  warningThresholdPercent: "80",
};
