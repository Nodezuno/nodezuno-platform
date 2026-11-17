"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  appendWorkspaceAuditEvents,
  canViewWorkspaceAudit,
  parseWorkspaceAuditEnvelope,
  workspaceAuditActorPresentation,
  workspaceAuditEntityLabel,
  workspaceAuditPagePath,
  type WorkspaceAuditEvent,
  type WorkspaceAuditRole,
} from "@/lib/client/workspace-audit";

type LoadState = "loading" | "ready" | "loading-more" | "error";

const pageSize = 25;

export function WorkspaceAuditPanel({
  workspaceName,
  workspaceRole,
}: {
  workspaceName: string;
  workspaceRole: WorkspaceAuditRole;
}) {
  const authorized = canViewWorkspaceAudit(workspaceRole);
  const [events, setEvents] = useState<WorkspaceAuditEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [pageError, setPageError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const eventsRef = useRef<WorkspaceAuditEvent[]>([]);
  const loadController = useRef<AbortController | null>(null);

  const loadPage = useCallback(
    async (
      cursor: string | null,
      append: boolean,
    ): Promise<string | null> => {
      if (!authorized) return null;

      loadController.current?.abort();
      const controller = new AbortController();
      loadController.current = controller;
      setLoadState(append ? "loading-more" : "loading");
      setAnnouncement(
        append
          ? "Loading older workspace activity."
          : "Loading workspace activity.",
      );
      if (append) {
        setPageError("");
      } else {
        setLoadError("");
      }

      try {
        const response = await fetch(
          workspaceAuditPagePath(cursor, pageSize),
          {
            cache: "no-store",
            credentials: "same-origin",
            headers: { Accept: "application/json" },
            signal: controller.signal,
          },
        );
        if (response.status === 401) {
          const returnTo = `${window.location.pathname}${window.location.search}`;
          window.location.assign(
            `/login?return_to=${encodeURIComponent(returnTo)}`,
          );
          throw new Error("Your session expired. Sign in to continue.");
        }
        if (!response.ok) {
          throw new Error(auditResponseProblem(response.status));
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          throw new Error(
            "The workspace audit response could not be read safely.",
          );
        }
        const page = parseWorkspaceAuditEnvelope(payload);
        if (cursor !== null && page.nextCursor === cursor) {
          throw new Error(
            "The workspace audit cursor did not advance. Reload the activity timeline before continuing.",
          );
        }

        const nextEvents = append
          ? appendWorkspaceAuditEvents(
              eventsRef.current,
              page.events,
            )
          : page.events;
        const firstNewEventId = append ? page.events[0]?.id ?? null : null;
        eventsRef.current = nextEvents;
        setEvents(nextEvents);
        setNextCursor(page.nextCursor);
        setLoadState("ready");
        setLoadError("");
        setPageError("");
        setAnnouncement(
          append
            ? page.events.length > 0
              ? `${page.events.length} older workspace events loaded. ${nextEvents.length} events are now visible.`
              : "No additional workspace events were returned."
            : `${nextEvents.length} workspace events loaded.`,
        );

        if (append) {
          restoreAuditFocus(
            firstNewEventId
              ? auditEventHeadingId(firstNewEventId)
              : page.nextCursor
                ? "workspace-audit-load-more"
                : "workspace-audit-end",
          );
        }
        return null;
      } catch (caught) {
        if (controller.signal.aborted) return null;
        const message =
          caught instanceof Error
            ? caught.message
            : "The workspace audit trail could not be loaded.";
        setLoadState(append ? "ready" : "error");
        setAnnouncement(
          append
            ? "Older workspace activity was not loaded."
            : "Workspace activity was not loaded.",
        );
        if (append) {
          setPageError(message);
        } else {
          setLoadError(message);
        }
        return message;
      } finally {
        if (loadController.current === controller) {
          loadController.current = null;
        }
      }
    },
    [authorized],
  );

  useEffect(() => {
    if (!authorized) {
      loadController.current?.abort();
      eventsRef.current = [];
      return;
    }
    const task = window.setTimeout(() => {
      void loadPage(null, false);
    }, 0);
    return () => {
      window.clearTimeout(task);
      loadController.current?.abort();
    };
  }, [authorized, loadPage]);

  async function retryInitialLoad() {
    const error = await loadPage(null, false);
    restoreAuditFocus(
      error ? "workspace-audit-retry" : "workspace-audit-title",
    );
  }

  async function loadMore() {
    if (!nextCursor || loadState === "loading-more") return;
    await loadPage(nextCursor, true);
  }

  if (!authorized) return null;

  return (
    <section
      aria-busy={
        loadState === "loading" || loadState === "loading-more"
      }
      aria-labelledby="workspace-audit-title"
      className="workspace-audit-panel"
    >
      <header className="workspace-audit-heading">
        <div>
          <span>Workspace audit</span>
          <h3 id="workspace-audit-title" tabIndex={-1}>
            Trace activity in {workspaceName}.
          </h3>
          <p>
            This owner and admin view contains server-recorded activity.
            Nodezuno displays only the sanitized fields defined for each
            supported action. Secrets, policy values, RPC payloads, and
            arbitrary detail fields are never rendered.
          </p>
        </div>
        <div className="workspace-audit-access">
          <span>Access boundary</span>
          <strong>{workspaceRole}</strong>
          <small>
            Stable cursor pagination keeps older activity in exact recorded
            order.
          </small>
        </div>
      </header>

      {loadState === "loading" ? (
        <div className="workspace-audit-loading" role="status">
          <span aria-hidden="true" />
          <div>
            <strong>Loading workspace activity</strong>
            <small>Reading one sanitized page.</small>
          </div>
        </div>
      ) : loadState === "error" ? (
        <div className="workspace-audit-load-error" role="alert">
          <span>Activity unavailable</span>
          <strong>The audit timeline could not be opened.</strong>
          <p>{loadError}</p>
          <button
            className="button button-outline"
            id="workspace-audit-retry"
            onClick={() => void retryInitialLoad()}
            type="button"
          >
            Retry activity load
          </button>
        </div>
      ) : (
        <div className="workspace-audit-body">
          <div className="workspace-audit-list-head">
            <div>
              <strong id="workspace-audit-list-title" tabIndex={-1}>
                Activity timeline
              </strong>
              <span>
                {events.length} {events.length === 1 ? "event" : "events"}{" "}
                loaded
              </span>
            </div>
            <small>Newest first / exact UTC timestamps</small>
          </div>

          {events.length === 0 ? (
            <div className="workspace-audit-empty">
              <span aria-hidden="true">A</span>
              <strong>No workspace activity was returned.</strong>
              <p>
                This is a real empty state. No placeholder events or sample
                actors are shown.
              </p>
            </div>
          ) : (
            <ol
              aria-labelledby="workspace-audit-list-title"
              className="workspace-audit-timeline"
            >
              {events.map((event) => {
                const actor = workspaceAuditActorPresentation(
                  event.actor,
                );
                const entityLabel = workspaceAuditEntityLabel(
                  event.entity.type,
                );
                return (
                  <li key={event.id}>
                    <span
                      aria-hidden="true"
                      className="workspace-audit-marker"
                    />
                    <article
                      aria-labelledby={auditEventHeadingId(event.id)}
                      className="workspace-audit-event"
                    >
                      <div className="workspace-audit-event-heading">
                        <div>
                          <code>{event.action}</code>
                          <h4
                            id={auditEventHeadingId(event.id)}
                            tabIndex={-1}
                          >
                            {event.actionLabel}
                          </h4>
                        </div>
                        <time dateTime={event.createdAt}>
                          {event.createdAt}
                        </time>
                      </div>

                      <dl className="workspace-audit-event-meta">
                        <div>
                          <dt>Actor</dt>
                          <dd>
                            <strong>{actor.label}</strong>
                            <small>{actor.context}</small>
                          </dd>
                        </div>
                        <div>
                          <dt>Entity</dt>
                          <dd>
                            <strong>{entityLabel}</strong>
                            {event.entity.type === "workspace" ? (
                              <small>Workspace record</small>
                            ) : (
                              <code>{event.entity.id}</code>
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Event ID</dt>
                          <dd>
                            <code>{event.id}</code>
                          </dd>
                        </div>
                      </dl>

                      {event.facts.length > 0 ? (
                        <dl className="workspace-audit-facts">
                          {event.facts.map((fact) => (
                            <div key={`${event.id}-${fact.label}`}>
                              <dt>{fact.label}</dt>
                              <dd>
                                {fact.kind === "timestamp" ? (
                                  <time dateTime={fact.value}>
                                    {fact.value}
                                  </time>
                                ) : fact.kind === "code" ? (
                                  <code>{fact.value}</code>
                                ) : (
                                  fact.value
                                )}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <p className="workspace-audit-no-detail">
                          No action-specific display fields were returned.
                        </p>
                      )}
                    </article>
                  </li>
                );
              })}
            </ol>
          )}

          <footer className="workspace-audit-pagination">
            {pageError ? (
              <div className="workspace-audit-page-error" role="alert">
                <strong>Older activity was not loaded.</strong>
                <p>{pageError}</p>
                <button
                  className="button button-outline"
                  disabled={loadState === "loading-more"}
                  onClick={() => void loadMore()}
                  type="button"
                >
                  Retry older activity
                </button>
              </div>
            ) : nextCursor ? (
              <button
                className="button button-outline"
                disabled={loadState === "loading-more"}
                id="workspace-audit-load-more"
                onClick={() => void loadMore()}
                type="button"
              >
                {loadState === "loading-more"
                  ? "Loading older activity..."
                  : "Load more activity"}
              </button>
            ) : (
              <p id="workspace-audit-end" tabIndex={-1}>
                End of recorded workspace activity.
              </p>
            )}
          </footer>
        </div>
      )}

      <span
        aria-atomic="true"
        aria-live="polite"
        className="sr-only"
        role="status"
      >
        {announcement}
      </span>
    </section>
  );
}

function auditResponseProblem(status: number): string {
  if (status === 403) {
    return "Only a current workspace owner or admin can read this audit trail. Refresh the console if your role changed.";
  }
  if (status === 429) {
    return "Too many audit requests were made. Wait briefly, then retry manually.";
  }
  if (status === 503) {
    return "The workspace audit trail could not be read safely. Existing console data is unchanged.";
  }
  return "The workspace audit trail could not be loaded.";
}

function auditEventHeadingId(eventId: string): string {
  return `workspace-audit-event-${eventId}`;
}

function restoreAuditFocus(id: string): void {
  window.requestAnimationFrame(() => {
    document.getElementById(id)?.focus();
  });
}
