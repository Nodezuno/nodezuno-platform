"use client";

import { useState } from "react";
import {
  NATIVE_GRPC_METADATA_NAME,
  NATIVE_GRPC_PROTO_PATH,
  nativeGrpcContractDownload,
  nativeGrpcDescriptor,
  nativeGrpcurlExample,
} from "@/lib/client/grpc-quickstart";
import { copyStatusMessage } from "@/lib/client/console-reliability";
import {
  resolveOneTimeCredentialAvailability,
} from "@/lib/client/rpc-credential-recovery";

type CopyState = "idle" | "copied" | "error";

type WorkspaceSummary = {
  name: string;
  slug: string;
} | null;

type GrpcService = {
  id: string;
  name: string;
  status: "active" | "configuration_saved" | "archived";
  endpointPath: string | null;
  configuration: Record<string, unknown>;
} | null;

type GrpcApiKey = {
  id: string;
  name: string;
} | null;

type GrpcCredential = {
  apiKey: {
    id: string;
    serviceId: string | null;
  };
  secret: string;
} | null;

type LaunchState =
  | "idle"
  | "workspace"
  | "service"
  | "key"
  | "refresh";

async function writeClipboard(value: string): Promise<void> {
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

function readableProvisioning(
  configuration: Record<string, unknown>,
): string {
  return configuration.provisioning === "awaiting_gateway_readiness"
    ? "Awaiting verified gateway readiness"
    : typeof configuration.provisioning === "string"
      ? configuration.provisioning.replaceAll("_", " ")
      : "Saved by the control plane";
}

export function GrpcQuickstart({
  activeKey,
  browserOrigin,
  copyState,
  credential,
  error,
  launchState,
  onCopySecret,
  onCreateRecoveryKey,
  onDismissSecret,
  onLaunch,
  onRefresh,
  onWorkspaceNameChange,
  service,
  workspace,
  workspaceName,
}: {
  activeKey: GrpcApiKey;
  browserOrigin: string;
  copyState: CopyState;
  credential: GrpcCredential;
  error: string;
  launchState: LaunchState;
  onCopySecret: () => Promise<void>;
  onCreateRecoveryKey: () => Promise<void>;
  onDismissSecret: () => void;
  onLaunch: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onWorkspaceNameChange: (value: string) => void;
  service: GrpcService;
  workspace: WorkspaceSummary;
  workspaceName: string;
}) {
  const [confirmedRecoveryContext, setConfirmedRecoveryContext] =
    useState<string | null>(null);
  const [endpointCopyState, setEndpointCopyState] =
    useState<CopyState>("idle");
  const [contractCopyState, setContractCopyState] =
    useState<CopyState>("idle");
  const [exampleCopyState, setExampleCopyState] =
    useState<CopyState>("idle");
  const descriptor = nativeGrpcDescriptor(service);
  const credentialAvailability =
    resolveOneTimeCredentialAvailability({
      activeKeyExists: Boolean(activeKey),
      rawSecretAvailable: Boolean(credential),
    });
  const setupReady = Boolean(descriptor && activeKey);
  const firstCallReady =
    setupReady && credentialAvailability === "credential-in-tab";
  const savedKeyRequired =
    credentialAvailability === "saved-key-required";
  const busy = launchState !== "idle";
  const recoveryContext =
    savedKeyRequired && service && activeKey
      ? `${service.id}:${activeKey.id}`
      : null;
  const confirmRecovery =
    recoveryContext !== null &&
    confirmedRecoveryContext === recoveryContext;
  const currentStep = !workspace
    ? "workspace"
    : !service
      ? "gateway"
      : !activeKey
        ? "key"
        : !descriptor
          ? "gateway"
          : "command";
  const contractCommand = nativeGrpcContractDownload(browserOrigin);
  const grpcurlCommand =
    descriptor && service
      ? nativeGrpcurlExample({
          descriptor,
          serviceId: service.id,
        })
      : null;
  const launchLabel =
    launchState === "workspace"
      ? "Creating workspace..."
      : launchState === "service"
        ? "Creating native gRPC service..."
        : launchState === "key"
          ? "Creating service-bound key..."
          : !workspace
            ? "Create workspace, gRPC service, and key"
            : !service
              ? "Create gRPC service and key"
              : !activeKey
                ? "Create service-bound key"
                : "gRPC setup saved";

  async function copyValue(
    value: string,
    setState: (state: CopyState) => void,
  ) {
    try {
      await writeClipboard(value);
      setState("copied");
    } catch {
      setState("error");
    }
  }

  function cancelRecovery() {
    setConfirmedRecoveryContext(null);
    window.requestAnimationFrame(() => {
      document.getElementById("grpc-recovery-key-trigger")?.focus();
    });
  }

  return (
    <section
      aria-busy={busy}
      aria-labelledby="grpc-launch-title"
      className="rpc-launchpad grpc-launchpad-native"
      id="grpc-launchpad"
    >
      <div className="rpc-launchpad-header grpc-launchpad-header-native">
        <div>
          <span className="section-kicker">
            Step 2 of 2 / Native Ethereum gRPC beta
          </span>
          <h2 id="grpc-launch-title" tabIndex={-1}>
            From workspace to grpcurl.
          </h2>
        </div>
        <p>
          Create only the missing resources. A usable endpoint appears only
          after the control plane proves the shared HTTP/2 gateway and Ethereum
          dependency ready.
        </p>
      </div>

      <ol
        aria-label="Native Ethereum gRPC setup progress"
        className="rpc-launch-progress"
        tabIndex={0}
      >
        <li className="is-complete">
          <span>1</span>
          <div>
            <strong>Account</strong>
            <small>Signed in</small>
          </div>
        </li>
        <li
          aria-current={currentStep === "workspace" ? "step" : undefined}
          className={workspace ? "is-complete" : "is-current"}
        >
          <span>2</span>
          <div>
            <strong>Workspace</strong>
            <small>{workspace ? "Ready" : "Next"}</small>
          </div>
        </li>
        <li
          aria-current={currentStep === "gateway" ? "step" : undefined}
          className={
            descriptor
              ? "is-complete"
              : service
                ? "is-waiting"
                : currentStep === "gateway"
                  ? "is-current"
                  : ""
          }
        >
          <span>3</span>
          <div>
            <strong>gRPC gateway</strong>
            <small>
              {descriptor
                ? "Active beta"
                : service
                  ? "Configuration saved"
                  : "Not created"}
            </small>
          </div>
        </li>
        <li
          aria-current={currentStep === "key" ? "step" : undefined}
          className={
            activeKey
              ? "is-complete"
              : currentStep === "key"
                ? "is-current"
                : ""
          }
        >
          <span>4</span>
          <div>
            <strong>API key</strong>
            <small>
              {credential
                ? "Available in tab"
                : activeKey
                  ? "Record exists"
                  : "Not created"}
            </small>
          </div>
        </li>
        <li
          aria-current={
            setupReady && !firstCallReady ? "step" : undefined
          }
          className={
            firstCallReady
              ? "is-current"
              : setupReady
                ? "is-waiting"
                : ""
          }
        >
          <span>5</span>
          <div>
            <strong>grpcurl</strong>
            <small>
              {firstCallReady
                ? "Ready in this tab"
                : setupReady
                  ? "Saved key required"
                  : "Waiting"}
            </small>
          </div>
        </li>
      </ol>

      <div className="rpc-launchpad-body">
        <div className="rpc-launch-action">
          <span className="docs-state docs-state-live">
            Native gRPC self-service
          </span>
          <h3>
            {firstCallReady
              ? "Your endpoint and key are ready in this tab."
              : setupReady
                ? "Your gateway is ready. Use your saved key."
                : service
                  ? "Your configuration is saved."
                  : "Launch with bounded Ethereum defaults."}
          </h3>
          <p>
            Native gRPC over HTTP/2, Ethereum mainnet, global routing, and a
            service-bound key with <code>grpc:invoke</code>.
          </p>

          {!workspace ? (
            <label>
              <span>Company or workspace name</span>
              <input
                autoComplete="organization"
                disabled={busy}
                maxLength={60}
                minLength={2}
                onChange={(event) =>
                  onWorkspaceNameChange(event.target.value)
                }
                required
                value={workspaceName}
              />
            </label>
          ) : (
            <div className="rpc-launch-workspace">
              <span>Workspace</span>
              <strong>{workspace.name}</strong>
              <small>{workspace.slug}</small>
            </div>
          )}

          <div
            aria-label="Native gRPC quickstart defaults"
            className="rpc-launch-defaults"
          >
            <span>Ethereum mainnet</span>
            <span>Native gRPC</span>
            <span>HTTP/2 and TLS</span>
          </div>

          {!workspace || !service || !activeKey ? (
            <button
              className="button button-solid button-large"
              disabled={
                busy ||
                (!workspace && workspaceName.trim().length < 2)
              }
              onClick={() => void onLaunch()}
              type="button"
            >
              {launchLabel}
            </button>
          ) : !descriptor ? (
            <button
              className="button button-outline"
              disabled={busy}
              onClick={() => void onRefresh()}
              type="button"
            >
              {launchState === "refresh"
                ? "Checking gateway..."
                : "Refresh gateway status"}
            </button>
          ) : null}

          {error ? (
            <p className="rpc-launch-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className={`rpc-launch-result ${setupReady ? "is-ready" : ""}`}>
          {credential ? (
            <aside
              aria-labelledby="grpc-one-time-secret-title"
              className="rpc-launch-secret"
              role="region"
            >
              <div>
                <span>One-time native gRPC key</span>
                <strong id="grpc-one-time-secret-title" tabIndex={-1}>
                  Copy and save this secret now.
                </strong>
                <p>
                  Keep it server-side. Nodezuno stores only its digest and
                  cannot show the raw secret again.
                </p>
                <small className="api-secret-scope">
                  Access boundary: {service?.name ?? "one bound service"}
                </small>
              </div>
              <code>{credential.secret}</code>
              <div>
                <button
                  className="button button-solid"
                  onClick={() => void onCopySecret()}
                  type="button"
                >
                  {copyState === "copied"
                    ? "Secret copied"
                    : "Copy secret"}
                </button>
                <button
                  className="button button-outline"
                  onClick={onDismissSecret}
                  type="button"
                >
                  I saved it
                </button>
              </div>
              <span
                aria-atomic="true"
                className="sr-only"
                role="status"
              >
                {copyStatusMessage(copyState, "Native gRPC API key secret")}
              </span>
              {copyState === "error" ? (
                <p className="rpc-launch-error" role="alert">
                  Clipboard access failed. Select and copy the secret before
                  dismissing it.
                </p>
              ) : null}
            </aside>
          ) : null}

          {savedKeyRequired && service && activeKey ? (
            <section
              aria-labelledby="grpc-credential-recovery-title"
              className="rpc-credential-recovery grpc-credential-recovery-native"
            >
              <span>Credential not held in this tab</span>
              <h4 id="grpc-credential-recovery-title" tabIndex={-1}>
                The existing raw secret cannot be shown again.
              </h4>
              <p>
                If you saved that key in a vault, export it as{" "}
                <code>NODEZUNO_API_KEY</code> and keep using the same service.
              </p>
              <p>
                If the secret was lost, create a new service-bound key.
                Existing keys remain active until you explicitly revoke them
                in the key list.
              </p>
              {confirmRecovery ? (
                <div
                  aria-label="Create new native gRPC key confirmation"
                  className="rpc-credential-recovery-confirm"
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && !busy) {
                      event.preventDefault();
                      cancelRecovery();
                    }
                  }}
                  role="group"
                >
                  <p id="grpc-recovery-warning">
                    Confirm one new key for this gRPC service. This does not
                    reveal, revoke, or modify an existing key.
                  </p>
                  <button
                    aria-describedby="grpc-recovery-warning"
                    autoFocus
                    className="button button-solid"
                    disabled={busy}
                    onClick={() => void onCreateRecoveryKey()}
                    type="button"
                  >
                    {launchState === "key"
                      ? "Creating new key..."
                      : "Confirm new key"}
                  </button>
                  <button
                    className="button button-outline"
                    disabled={busy}
                    onClick={cancelRecovery}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="rpc-credential-recovery-actions">
                  <button
                    className="button button-outline"
                    id="grpc-recovery-key-trigger"
                    onClick={() =>
                      setConfirmedRecoveryContext(recoveryContext)
                    }
                    type="button"
                  >
                    Create a new service-bound key
                  </button>
                  <a
                    href="#api-keys-title"
                    onClick={() => {
                      window.requestAnimationFrame(() => {
                        document.getElementById("api-keys-title")?.focus();
                      });
                    }}
                  >
                    Review existing keys
                  </a>
                </div>
              )}
            </section>
          ) : null}

          {descriptor && service && grpcurlCommand ? (
            <>
              <div className="rpc-launch-ready-heading">
                <span>Control-plane verified native endpoint</span>
                <strong id="grpc-first-call-title" tabIndex={-1}>
                  Run your first Ethereum gRPC call.
                </strong>
                <p>
                  grpcurl uses TLS for the HTTPS endpoint. Export your saved
                  secret as <code>NODEZUNO_API_KEY</code>. The command includes
                  the exact service identifier required by the gateway.
                </p>
              </div>

              <div className="grpc-endpoint-card">
                <div>
                  <span>HTTPS endpoint</span>
                  <code>{descriptor.endpoint}</code>
                </div>
                <button
                  onClick={() =>
                    void copyValue(
                      descriptor.endpoint,
                      setEndpointCopyState,
                    )
                  }
                  type="button"
                >
                  {endpointCopyState === "copied"
                    ? "Endpoint copied"
                    : endpointCopyState === "error"
                      ? "Copy failed, retry"
                      : "Copy endpoint"}
                </button>
                <span
                  aria-atomic="true"
                  className="sr-only"
                  role="status"
                >
                  {copyStatusMessage(
                    endpointCopyState,
                    "Native gRPC endpoint",
                  )}
                </span>
              </div>

              <dl className="grpc-access-facts">
                <div>
                  <dt>Service</dt>
                  <dd>
                    <code>{descriptor.serviceName}</code>
                  </dd>
                </div>
                <div>
                  <dt>Required metadata</dt>
                  <dd>
                    <code>{NATIVE_GRPC_METADATA_NAME}</code>
                    <small>{service.id}</small>
                  </dd>
                </div>
                <div>
                  <dt>Credential</dt>
                  <dd>
                    <code>authorization: Bearer $NODEZUNO_API_KEY</code>
                  </dd>
                </div>
              </dl>

              <div className="grpc-contract-card">
                <div>
                  <span>Protobuf contract</span>
                  <strong>Download the exact public service definition.</strong>
                </div>
                <a download href={NATIVE_GRPC_PROTO_PATH}>
                  Download .proto
                </a>
              </div>

              <div className="rpc-launch-request grpc-command">
                <div>
                  <span>Step 1 / Contract</span>
                  <strong>Save the protobuf definition locally</strong>
                  <button
                    onClick={() =>
                      void copyValue(
                        contractCommand,
                        setContractCopyState,
                      )
                    }
                    type="button"
                  >
                    {contractCopyState === "copied"
                      ? "Contract command copied"
                      : contractCopyState === "error"
                        ? "Copy failed, retry"
                        : "Copy contract command"}
                  </button>
                </div>
                <pre tabIndex={0}>
                  <code>{contractCommand}</code>
                </pre>
                <span
                  aria-atomic="true"
                  className="sr-only"
                  role="status"
                >
                  {copyStatusMessage(
                    contractCopyState,
                    "Protobuf download command",
                  )}
                </span>
              </div>

              <div className="rpc-launch-request grpc-command">
                <div>
                  <span>Step 2 / grpcurl</span>
                  <strong>Read the latest Ethereum block number</strong>
                  <button
                    onClick={() =>
                      void copyValue(
                        grpcurlCommand,
                        setExampleCopyState,
                      )
                    }
                    type="button"
                  >
                    {exampleCopyState === "copied"
                      ? "grpcurl copied"
                      : exampleCopyState === "error"
                        ? "Copy failed, retry"
                        : "Copy grpcurl example"}
                  </button>
                </div>
                <pre tabIndex={0}>
                  <code>{grpcurlCommand}</code>
                </pre>
                <span
                  aria-atomic="true"
                  className="sr-only"
                  role="status"
                >
                  {copyStatusMessage(
                    exampleCopyState,
                    "grpcurl example",
                  )}
                </span>
              </div>
            </>
          ) : (
            <div
              aria-labelledby="grpc-saved-state-title"
              className="grpc-saved-state"
              role="region"
            >
              <span>Configuration saved</span>
              <strong id="grpc-saved-state-title" tabIndex={-1}>
                No native gRPC endpoint is published yet.
              </strong>
              <p>
                The service record exists, but the control plane has not
                returned a proven active gateway. No live call or production
                capacity is claimed.
              </p>
              {service ? (
                <dl>
                  <div>
                    <dt>Service ID</dt>
                    <dd>{service.id}</dd>
                  </div>
                  <div>
                    <dt>Service state</dt>
                    <dd>{service.status}</dd>
                  </div>
                  <div>
                    <dt>Provisioning</dt>
                    <dd>{readableProvisioning(service.configuration)}</dd>
                  </div>
                  <div>
                    <dt>Transport</dt>
                    <dd>Native gRPC over HTTP/2</dd>
                  </div>
                </dl>
              ) : (
                <small>
                  Create the service and service-bound key to save this
                  configuration.
                </small>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
