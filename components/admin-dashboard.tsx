"use client";

import { useState } from "react";
import type {
  PublicChain,
  PublicStatusService,
  SubmissionSummary,
} from "@/lib/server/database";

type AdminDashboardProps = {
  initialSubmissions: SubmissionSummary[];
  initialServices: PublicStatusService[];
  initialChains: PublicChain[];
};

async function patchJson(path: string, payload: unknown) {
  const response = await fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await response.json()) as {
    detail?: string;
    title?: string;
  };
  if (!response.ok) {
    throw new Error(data.detail ?? data.title ?? "The update failed.");
  }
  return data;
}

async function postJson(path: string) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const data = (await response.json()) as {
    data?: {
      expiredSubmissions?: number;
      expiredRateLimitWindows?: number;
    };
    detail?: string;
    title?: string;
  };
  if (!response.ok) {
    throw new Error(data.detail ?? data.title ?? "The operation failed.");
  }
  return data;
}

export function AdminDashboard({
  initialSubmissions,
  initialServices,
  initialChains,
}: AdminDashboardProps) {
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [services, setServices] = useState(initialServices);
  const [chains, setChains] = useState(initialChains);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function updateSubmission(id: string, status: SubmissionSummary["status"]) {
    setPending(id);
    setNotice(null);
    try {
      await patchJson(`/api/v1/admin/submissions/${id}`, { status });
      setSubmissions((items) =>
        items.map((item) => (item.id === id ? { ...item, status } : item)),
      );
      setNotice("Submission status updated and added to the audit trail.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The update failed.");
    } finally {
      setPending(null);
    }
  }

  async function updateService(
    slug: string,
    state: PublicStatusService["state"],
  ) {
    setPending(slug);
    setNotice(null);
    try {
      await patchJson(`/api/v1/admin/status/services/${slug}`, { state });
      setServices((items) =>
        items.map((item) => (item.slug === slug ? { ...item, state } : item)),
      );
      setNotice("Public status updated and audited.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The update failed.");
    } finally {
      setPending(null);
    }
  }

  async function updateChain(slug: string, stage: PublicChain["stage"]) {
    setPending(slug);
    setNotice(null);
    try {
      await patchJson(`/api/v1/admin/chains/${slug}`, { stage });
      setChains((items) =>
        items.map((item) => (item.slug === slug ? { ...item, stage } : item)),
      );
      setNotice("Chain publication stage updated and audited.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The update failed.");
    } finally {
      setPending(null);
    }
  }

  async function runMaintenance() {
    setPending("maintenance");
    setNotice(null);
    try {
      const result = await postJson("/api/v1/admin/maintenance");
      const expiredSubmissions =
        result.data?.expiredSubmissions ?? 0;
      const expiredRateLimitWindows =
        result.data?.expiredRateLimitWindows ?? 0;
      setNotice(
        `Retention maintenance complete: ${expiredSubmissions} expired submission${expiredSubmissions === 1 ? "" : "s"} and ${expiredRateLimitWindows} rate-limit window${expiredRateLimitWindows === 1 ? "" : "s"} removed.`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "The operation failed.",
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="admin-console">
      {notice ? (
        <div className="admin-notice" role="status">
          {notice}
        </div>
      ) : null}

      <section className="admin-section">
        <div className="admin-section-head">
          <div>
            <span className="section-kicker">Request operations</span>
            <h2>Submission queue</h2>
          </div>
          <small>{submissions.length} most recent</small>
        </div>
        <div className="admin-table">
          {submissions.map((item) => (
            <div className="admin-row" key={item.id}>
              <div>
                <strong>{item.company}</strong>
                <small>
                  {item.kind.replaceAll("_", " ")} · {item.email}
                </small>
              </div>
              <p>{item.message}</p>
              <select
                aria-label={`Status for ${item.company}`}
                disabled={pending === item.id}
                onChange={(event) =>
                  updateSubmission(
                    item.id,
                    event.target.value as SubmissionSummary["status"],
                  )
                }
                value={item.status}
              >
                <option value="received">Received</option>
                <option value="reviewing">Reviewing</option>
                <option value="closed">Closed</option>
                <option value="spam">Spam</option>
              </select>
            </div>
          ))}
          {submissions.length === 0 ? (
            <p className="admin-empty">No submissions have been received.</p>
          ) : null}
        </div>
      </section>

      <section className="admin-section">
        <div className="admin-section-head">
          <div>
            <span className="section-kicker">Data lifecycle</span>
            <h2>Retention maintenance</h2>
          </div>
          <button
            className="button button-outline"
            disabled={pending === "maintenance"}
            onClick={runMaintenance}
            type="button"
          >
            {pending === "maintenance"
              ? "Running…"
              : "Remove expired records"}
          </button>
        </div>
        <p className="admin-empty">
          Expired submissions are excluded from request views immediately.
          This audited operation removes expired submission and rate-limit
          records from the configured database.
        </p>
      </section>

      <section className="admin-section">
        <div className="admin-section-head">
          <div>
            <span className="section-kicker">Public truth surface</span>
            <h2>Status services</h2>
          </div>
          <small>Every change is audited</small>
        </div>
        <div className="admin-compact-grid">
          {services.map((service) => (
            <label key={service.slug}>
              <span>{service.name}</span>
              <small>{service.description}</small>
              <select
                disabled={pending === service.slug}
                onChange={(event) =>
                  updateService(
                    service.slug,
                    event.target.value as PublicStatusService["state"],
                  )
                }
                value={service.state}
              >
                <option value="preview">Preview</option>
                <option value="operational">Operational</option>
                <option value="degraded">Degraded</option>
                <option value="partial_outage">Partial outage</option>
                <option value="major_outage">Major outage</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </label>
          ))}
        </div>
      </section>

      <section className="admin-section">
        <div className="admin-section-head">
          <div>
            <span className="section-kicker">Capability publication</span>
            <h2>Chain catalog</h2>
          </div>
          <small>Promote only verified capabilities</small>
        </div>
        <div className="admin-compact-grid">
          {chains.map((chain) => (
            <label key={chain.slug}>
              <span>{chain.name}</span>
              <small>
                {chain.family} · {chain.finality}
              </small>
              <select
                disabled={pending === chain.slug}
                onChange={(event) =>
                  updateChain(
                    chain.slug,
                    event.target.value as PublicChain["stage"],
                  )
                }
                value={chain.stage}
              >
                <option value="planned">Planned</option>
                <option value="preview">Preview</option>
                <option
                  disabled={chain.capabilities.length === 0}
                  value="full"
                >
                  Full
                </option>
                <option
                  disabled={chain.capabilities.length === 0}
                  value="data_only"
                >
                  Data only
                </option>
              </select>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
