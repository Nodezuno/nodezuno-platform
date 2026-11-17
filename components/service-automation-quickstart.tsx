"use client";

import { useMemo, useState } from "react";
import {
  serviceAutomationCommands,
  type ServiceAutomationCommandId,
} from "@/lib/client/service-automation";

type CopyState = "idle" | "copied" | "error";

export function ServiceAutomationQuickstart({
  apiKeyName,
  browserOrigin,
}: {
  apiKeyName: string;
  browserOrigin: string;
}) {
  const commands = useMemo(
    () => serviceAutomationCommands(browserOrigin),
    [browserOrigin],
  );
  const [activeId, setActiveId] =
    useState<ServiceAutomationCommandId>("environment");
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const activeCommand =
    commands.find((command) => command.id === activeId) ??
    commands[0];

  async function copyCommand() {
    try {
      await writeAutomationClipboard(activeCommand.command);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  function selectCommand(id: ServiceAutomationCommandId) {
    setActiveId(id);
    setCopyState("idle");
  }

  return (
    <section
      aria-labelledby="service-automation-quickstart-title"
      className="service-automation-quickstart"
    >
      <header className="service-automation-header">
        <div>
          <span>One-time automation quickstart</span>
          <h3 id="service-automation-quickstart-title">
            Put {apiKeyName} to work.
          </h3>
          <p>
            This panel is shown while the one-time management-key receipt is
            open. The commands use direct HTTPS with curl and do not depend on
            a Nodezuno CLI or SDK package.
          </p>
        </div>
        <div className="service-automation-scope">
          <span>Confirmed scope</span>
          <code>services:manage</code>
          <small>Unbound workspace service control only</small>
        </div>
      </header>

      <aside className="service-automation-safety" role="note">
        <strong>The secret is not duplicated in these commands.</strong>
        <p>
          Copy or download the one-time secret from the receipt above, store
          it securely, and load it through your deployment secret manager.
          Every visible credential value below is an intentional placeholder.
        </p>
      </aside>

      <div className="service-automation-workbench">
        <nav
          aria-label="Service automation request examples"
          className="service-automation-command-list"
        >
          {commands.map((command, index) => (
            <button
              aria-describedby={`service-automation-command-summary-${command.id}`}
              aria-pressed={command.id === activeCommand.id}
              key={command.id}
              onClick={() => selectCommand(command.id)}
              type="button"
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{command.title}</strong>
              <code>{command.method}</code>
              <small
                className="sr-only"
                id={`service-automation-command-summary-${command.id}`}
              >
                {command.description}
              </small>
            </button>
          ))}
        </nav>

        <article
          aria-labelledby={`service-automation-command-${activeCommand.id}`}
          className="service-automation-command"
        >
          <div className="service-automation-command-heading">
            <div>
              <span>{activeCommand.method}</span>
              <h4
                id={`service-automation-command-${activeCommand.id}`}
              >
                {activeCommand.title}
              </h4>
              <p>{activeCommand.description}</p>
            </div>
            <button
              className="button button-outline"
              onClick={() => void copyCommand()}
              type="button"
            >
              {copyState === "copied" ? "Copied command" : "Copy command"}
            </button>
          </div>

          <pre
            aria-label={`${activeCommand.title} direct HTTPS command`}
            tabIndex={0}
          >
            <code>{activeCommand.command}</code>
          </pre>

          {activeCommand.caution ? (
            <p
              className={
                activeCommand.id === "archive"
                  ? "is-destructive"
                  : ""
              }
              role="note"
            >
              {activeCommand.caution}
            </p>
          ) : null}
          {copyState === "error" ? (
            <p className="service-automation-copy-error" role="alert">
              Clipboard access failed. Select the command and copy it
              manually.
            </p>
          ) : null}
          <span
            aria-atomic="true"
            className="sr-only"
            role="status"
          >
            {copyState === "copied"
              ? `${activeCommand.title} command copied.`
              : copyState === "error"
                ? `${activeCommand.title} command was not copied.`
                : ""}
          </span>
        </article>
      </div>
    </section>
  );
}

async function writeAutomationClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("Clipboard unavailable");
}
