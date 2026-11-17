"use client";

import { useEffect, useState } from "react";

type StatusPayload = {
  overall: string;
  services: {
    slug: string;
    name: string;
    description: string;
    state: string;
    updatedAt: number;
  }[];
  incidents: {
    id: string;
    title: string;
    state: string;
    impact: string;
    startedAt: number;
  }[];
  generatedAt: string;
  disclaimer: string;
};

const requestDeadlineMs = 15_000;

export function StatusExperience() {
  const [payload, setPayload] = useState<StatusPayload | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "failed">("loading");
  const [failureMessage, setFailureMessage] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let deadlineReached = false;
    const deadline = window.setTimeout(() => {
      deadlineReached = true;
      controller.abort();
    }, requestDeadlineMs);

    async function loadStatus() {
      try {
        const response = await fetch("/api/v1/status", {
          cache: "no-store",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Status unavailable");
        const body: unknown = await response.json();
        const status = parseStatusPayload(body);
        if (!active || controller.signal.aborted) return;
        setPayload(status);
        setLoadState("ready");
      } catch {
        if (!active) return;
        setFailureMessage(
          deadlineReached
            ? "The status request timed out. Check your connection and try again."
            : "Current service status could not be loaded. Please try again.",
        );
        setLoadState("failed");
      } finally {
        window.clearTimeout(deadline);
      }
    }

    void loadStatus();
    return () => {
      active = false;
      window.clearTimeout(deadline);
      controller.abort();
    };
  }, [attempt]);

  function retry() {
    setLoadState("loading");
    setPayload(null);
    setFailureMessage("");
    setAttempt((current) => current + 1);
  }

  const ready = loadState === "ready" && payload !== null;

  return (
    <section className="special-module status-module" aria-labelledby="service-status-title">
      <div className="module-head">
        <div>
          <span className="section-kicker">Current service health</span>
          <h2 id="service-status-title">Website, review intake, private portal, and manual payment checks.</h2>
        </div>
        <div className="preview-badge" role="status">
          {loadState === "loading"
            ? "Loading status"
            : ready
              ? stateLabel(payload.overall)
              : "Status unavailable"}
        </div>
      </div>

      {loadState === "loading" ? (
        <p className="module-disclaimer" role="status">
          Loading the latest service status and published incident records.
        </p>
      ) : loadState === "failed" ? (
        <div className="status-history">
          <h3>Service status is unavailable.</h3>
          <div>
            <p role="alert">{failureMessage}</p>
            <button className="button button-outline" onClick={retry} type="button">
              Retry status
            </button>
          </div>
        </div>
      ) : ready ? (
        <>
          <p className="module-disclaimer">{payload.disclaimer}</p>
          <div className="status-meta">
            <span>
              Generated <time dateTime={payload.generatedAt}>{new Date(payload.generatedAt).toLocaleString()}</time>
            </span>
            <button className="button button-outline" onClick={retry} type="button">
              Refresh status
            </button>
          </div>
          {payload.services.length ? (
            <div className="status-list">
              {payload.services.map((service, index) => (
                <div key={service.slug} title={service.description}>
                  <span className={"status-service-icon status-icon-" + ((index % 4) + 1)} aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <strong>{service.name}</strong>
                  <span aria-hidden="true" />
                  <small>
                    <span>{stateLabel(service.state)}</span>
                    <time dateTime={service.updatedAt ? new Date(service.updatedAt).toISOString() : undefined}>
                      {service.updatedAt
                        ? "Updated " + new Date(service.updatedAt).toLocaleDateString()
                        : "Not yet verified"}
                    </time>
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <p className="module-disclaimer">No service records were returned in this status response.</p>
          )}
          <div className="status-history">
            <h3>Incident history</h3>
            {payload.incidents.length ? (
              payload.incidents.map((incident) => (
                <div key={incident.id}>
                  <span>{stateLabel(incident.state)}</span>
                  <strong>{incident.title}</strong>
                  <p>{incident.impact}</p>
                  <time dateTime={new Date(incident.startedAt).toISOString()}>
                    {new Date(incident.startedAt).toLocaleDateString()}
                  </time>
                </div>
              ))
            ) : (
              <p>No published incidents were returned in this status response.</p>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

function stateLabel(state: string) {
  return state.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textValue(value: unknown, maximum = 4000, allowEmpty = false): value is string {
  return typeof value === "string" && value.length <= maximum && (allowEmpty || value.trim().length > 0);
}

function timestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 8_640_000_000_000_000;
}

function parseStatusPayload(body: unknown): StatusPayload {
  if (!record(body) || !record(body.data)) throw new Error("Invalid status response");
  const data = body.data;
  if (
    !textValue(data.overall, 64) ||
    !textValue(data.generatedAt, 100) ||
    !Number.isFinite(Date.parse(data.generatedAt)) ||
    !textValue(data.disclaimer) ||
    !Array.isArray(data.services) ||
    data.services.length > 100 ||
    !Array.isArray(data.incidents) ||
    data.incidents.length > 500
  ) throw new Error("Invalid status response");

  const services = data.services.map((service: unknown) => {
    if (
      !record(service) || !textValue(service.slug, 160) ||
      !textValue(service.name, 240) || !textValue(service.description, 4000, true) ||
      !textValue(service.state, 64) || !timestamp(service.updatedAt)
    ) throw new Error("Invalid service status");
    return {
      slug: service.slug, name: service.name, description: service.description,
      state: service.state, updatedAt: service.updatedAt,
    };
  });
  const incidents = data.incidents.map((incident: unknown) => {
    if (
      !record(incident) || !textValue(incident.id, 160) ||
      !textValue(incident.title, 500) || !textValue(incident.state, 64) ||
      !textValue(incident.impact, 4000, true) || !timestamp(incident.startedAt)
    ) throw new Error("Invalid incident record");
    return {
      id: incident.id, title: incident.title, state: incident.state,
      impact: incident.impact, startedAt: incident.startedAt,
    };
  });
  if (
    new Set(services.map((service) => service.slug)).size !== services.length ||
    new Set(incidents.map((incident) => incident.id)).size !== incidents.length
  ) throw new Error("Duplicate status records");
  return {
    overall: data.overall, services, incidents,
    generatedAt: data.generatedAt, disclaimer: data.disclaimer,
  };
}
