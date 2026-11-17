"use client";

import Link from "next/link";
import {
  parseOperatorNodeAttachmentSnapshot,
  type OperatorNodeAttachmentSnapshot,
  type OperatorRpcAttachment,
} from "@/lib/client/node-attachment-operations";
import { useCallback, useEffect, useRef, useState } from "react";

type LoadState = "loading" | "ready" | "error";

export function NodeAttachmentOperations() {
  const [snapshot, setSnapshot] =
    useState<OperatorNodeAttachmentSnapshot | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [notice, setNotice] = useState(
    "Checking operator-attached nodes.",
  );
  const requestSequence = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    setState("loading");
    setNotice("Checking operator-attached nodes.");
    try {
      const response = await fetch(
        "/api/v1/admin/node-attachments",
        {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal: nextController.signal,
        },
      );
      const payload = (await response.json()) as unknown;
      if (!response.ok) {
        throw new Error(
          "Node attachment verification is temporarily unavailable.",
        );
      }
      const parsed = parseOperatorNodeAttachmentSnapshot(payload);
      if (!parsed) {
        throw new Error(
          "Node attachment verification returned an invalid contract.",
        );
      }
      if (sequence !== requestSequence.current) return;
      setSnapshot(parsed);
      setState("ready");
      setNotice(
        `Node attachment verification completed at ${parsed.checkedAt}.`,
      );
    } catch (error) {
      if (
        nextController.signal.aborted ||
        sequence !== requestSequence.current
      ) {
        return;
      }
      setState("error");
      setNotice(
        error instanceof Error
          ? error.message
          : "Node attachment verification failed.",
      );
    }
  }, []);

  useEffect(() => {
    const kickoff = window.setTimeout(() => void refresh(), 0);
    return () => {
      window.clearTimeout(kickoff);
      requestSequence.current += 1;
      controller.current?.abort();
    };
  }, [refresh]);

  return (
    <section className="admin-section node-attachment-operations">
      <div className="admin-section-head">
        <div>
          <span className="section-kicker">Infrastructure readiness</span>
          <h2>Operator-attached nodes</h2>
        </div>
        <button
          className="button button-outline"
          disabled={state === "loading"}
          onClick={() => void refresh()}
          type="button"
        >
          {state === "loading" ? "Checking…" : "Run verification"}
        </button>
      </div>

      <p className="admin-empty">
        This probe reports configuration counts and verified chain identity.
        It never returns provider URLs, headers, credentials, or RPC payloads.{" "}
        <Link href="/developers/docs#docs-checklist">
          Open the production checklist
        </Link>
        .
      </p>

      <p
        aria-live="polite"
        className={`node-attachment-notice is-${state}`}
        role="status"
      >
        {notice}
      </p>

      {snapshot ? (
        <>
          <div className="node-attachment-grid">
            {snapshot.rpc.map((attachment) => (
              <RpcAttachmentCard
                attachment={attachment}
                key={attachment.network}
              />
            ))}
            <article
              className={`node-attachment-card is-${snapshot.nativeGrpc.state}`}
            >
              <div className="node-attachment-card-head">
                <div>
                  <small>Native gRPC</small>
                  <h3>Ethereum gRPC</h3>
                </div>
                <AttachmentState
                  ready={snapshot.nativeGrpc.ready}
                  state={snapshot.nativeGrpc.state}
                />
              </div>
              <dl>
                <div>
                  <dt>Public endpoint</dt>
                  <dd>
                    {snapshot.nativeGrpc.endpointConfigured
                      ? "Configured"
                      : "Missing"}
                  </dd>
                </div>
                <div>
                  <dt>Private authorization</dt>
                  <dd>
                    {snapshot.nativeGrpc.authenticationConfigured
                      ? "Isolated"
                      : "Missing or invalid"}
                  </dd>
                </div>
                <div>
                  <dt>Health service</dt>
                  <dd>
                    <code>{snapshot.nativeGrpc.serviceName}</code>
                  </dd>
                </div>
              </dl>
            </article>
          </div>
          <p className="node-attachment-checked">
            Contract verified{" "}
            <time dateTime={snapshot.checkedAt}>
              {snapshot.checkedAt}
            </time>
            . Request <code>{snapshot.requestId}</code>.
          </p>
        </>
      ) : state === "error" ? (
        <div className="admin-empty node-attachment-error">
          No attachment status was accepted. Run verification again after
          checking the control-plane database and runtime configuration.
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="node-attachment-grid node-attachment-skeleton"
        >
          <span />
          <span />
          <span />
          <span />
        </div>
      )}
    </section>
  );
}

function RpcAttachmentCard({
  attachment,
}: {
  attachment: OperatorRpcAttachment;
}) {
  return (
    <article
      className={`node-attachment-card is-${attachment.state}`}
    >
      <div className="node-attachment-card-head">
        <div>
          <small>{attachment.network}</small>
          <h3>{attachment.name} RPC</h3>
        </div>
        <AttachmentState
          ready={attachment.ready}
          state={attachment.state}
        />
      </div>
      <dl>
        <div>
          <dt>Configured</dt>
          <dd>{attachment.configuredUpstreams}</dd>
        </div>
        <div>
          <dt>Chain verified</dt>
          <dd>{attachment.verifiedUpstreams}</dd>
        </div>
        <div>
          <dt>Expected identity</dt>
          <dd>
            <code>{attachment.expectedIdentity}</code>
          </dd>
        </div>
        <div>
          <dt>Safe reads</dt>
          <dd>{attachment.safeReads}</dd>
        </div>
        <div>
          <dt>Writes</dt>
          <dd>{attachment.writes}</dd>
        </div>
      </dl>
      {attachment.pulse.upstreams.length > 0 ? (
        <div className="pulse-routing-observations">
          <div className="pulse-routing-heading">
            <strong>Pulse routing observations</strong>
            <small>{attachment.pulse.scope}</small>
          </div>
          <ol aria-label={`${attachment.name} Pulse upstream observations`}>
            {attachment.pulse.upstreams.map((upstream) => (
              <li key={upstream.slot}>
                <div>
                  <strong>
                    {upstream.primary
                      ? "Primary"
                      : `Fallback ${upstream.slot - 1}`}
                  </strong>
                  <span className={`pulse-state is-${upstream.state}`}>
                    {pulseStateLabel(upstream.state)}
                  </span>
                </div>
                <dl>
                  <div>
                    <dt>Observed latency</dt>
                    <dd>
                      {upstream.latencyEwmaMs === null
                        ? "No sample"
                        : `${upstream.latencyEwmaMs} ms EWMA`}
                    </dd>
                  </div>
                  <div>
                    <dt>Successful observations</dt>
                    <dd>{upstream.successfulObservations}</dd>
                  </div>
                  <div>
                    <dt>Consecutive failures</dt>
                    <dd>{upstream.consecutiveFailures}</dd>
                  </div>
                  <div>
                    <dt>Circuit</dt>
                    <dd>
                      {upstream.cooldownRemainingMs > 0
                        ? `Retry in ${Math.ceil(
                            upstream.cooldownRemainingMs / 1000,
                          )} s`
                        : "Available"}
                    </dd>
                  </div>
                </dl>
                <small>
                  {upstream.lastObservedAt ? (
                    <>
                      Last request observation{" "}
                      <time dateTime={upstream.lastObservedAt}>
                        {upstream.lastObservedAt}
                      </time>
                    </>
                  ) : (
                    "Waiting for customer traffic"
                  )}
                </small>
              </li>
            ))}
          </ol>
          <p>
            These redacted observations belong only to this running web
            process. They are operational routing signals, not historical
            uptime.
          </p>
        </div>
      ) : null}
    </article>
  );
}

function pulseStateLabel(
  state: OperatorRpcAttachment["pulse"]["upstreams"][number]["state"],
): string {
  switch (state) {
    case "closed":
      return "Available";
    case "half_open":
      return "Trial request due";
    case "open":
      return "Circuit open";
    default:
      return "No traffic yet";
  }
}

function AttachmentState({
  ready,
  state,
}: {
  ready: boolean;
  state: string;
}) {
  const label = ready
    ? "Ready"
    : state === "not_configured"
      ? "Not configured"
      : state === "invalid_configuration"
        ? "Invalid configuration"
        : "Verification failed";
  return (
    <span
      className={`node-attachment-state ${ready ? "is-ready" : "is-blocked"}`}
    >
      <span aria-hidden="true" />
      {label}
    </span>
  );
}
