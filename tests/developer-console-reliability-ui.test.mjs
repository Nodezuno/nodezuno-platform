import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  copyStatusMessage,
  resolveConsoleServiceReadiness,
} from "../lib/client/console-reliability.ts";

const consoleUrl = new URL(
  "../components/developer-console.tsx",
  import.meta.url,
);
const grpcUrl = new URL(
  "../components/grpc-quickstart.tsx",
  import.meta.url,
);
const stylesUrl = new URL("../app/globals.css", import.meta.url);

test("console readiness never treats an active record without an endpoint as callable", () => {
  assert.equal(
    resolveConsoleServiceReadiness(
      "active",
      "https://rpc.example.org/service",
    ),
    "callable",
  );
  assert.equal(
    resolveConsoleServiceReadiness("active", null),
    "endpoint-missing",
  );
  assert.equal(
    resolveConsoleServiceReadiness("active", "   "),
    "endpoint-missing",
  );
  assert.equal(
    resolveConsoleServiceReadiness(
      "configuration_saved",
      "https://rpc.example.org/service",
    ),
    "configuration-saved",
  );
  assert.equal(
    resolveConsoleServiceReadiness(
      "archived",
      "https://rpc.example.org/service",
    ),
    "archived",
  );
});

test("copy announcements are concise and expose failures", () => {
  assert.equal(copyStatusMessage("idle", "Endpoint"), "");
  assert.equal(copyStatusMessage("copied", "Endpoint"), "Endpoint copied.");
  assert.equal(
    copyStatusMessage("error", "Endpoint"),
    "Endpoint was not copied. Select it and copy it manually.",
  );
});

test("developer console preserves keyboard focus and protects one-time secrets from broad live regions", async () => {
  const [source, grpc, styles] = await Promise.all([
    readFile(consoleUrl, "utf8"),
    readFile(grpcUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);

  assert.match(source, /focusedSecretIdRef/);
  assert.match(source, /api-one-time-secret-title/);
  assert.match(source, /rpc-one-time-secret-title/);
  assert.match(source, /grpc-one-time-secret-title/);
  assert.match(source, /document\.getElementById\(targetId\)\?\.focus/);
  assert.match(source, /dismissOneTimeSecret/);
  assert.match(source, /restoreActionFocus\("workspace-summary-title"\)/);
  assert.match(
    source,
    /restoreActionFocus\(`service-record-\$\{createdService\.id\}`\)/,
  );
  assert.match(source, /retryConsoleLoad/);
  assert.match(source, /id="console-retry-button"/);
  assert.match(source, /id="developer-console-title" tabIndex=\{-1\}/);
  assert.match(source, /className="rpc-launch-progress"[\s\S]+tabIndex=\{0\}/);
  assert.match(grpc, /className="rpc-launch-progress"[\s\S]+tabIndex=\{0\}/);

  assert.match(
    source,
    /secretReceipt[\s\S]+!rpcProbeCredential[\s\S]+!grpcCredential/,
  );
  assert.doesNotMatch(source, /secretReceipt && !rpcIntent && !grpcIntent/);
  assert.doesNotMatch(source, /scrollIntoView/);
  assert.match(
    source,
    /aria-labelledby="rpc-one-time-secret-title"[\s\S]+role="region"/,
  );
  assert.match(
    source,
    /aria-labelledby="api-one-time-secret-title"[\s\S]+role="region"/,
  );
  assert.match(
    grpc,
    /aria-labelledby="grpc-one-time-secret-title"[\s\S]+role="region"/,
  );
  assert.doesNotMatch(
    source,
    /className="rpc-launch-secret"[\s\S]{0,80}role="alert"/,
  );
  assert.doesNotMatch(
    grpc,
    /className="rpc-launch-secret"[\s\S]{0,80}role="alert"/,
  );
  assert.match(source, /copyStatusMessage\(/);
  assert.match(grpc, /copyStatusMessage\(/);
  assert.match(source, /aria-atomic="true"[\s\S]+role="status"/);
  assert.match(grpc, /aria-atomic="true"[\s\S]+role="status"/);

  assert.match(styles, /#rpc-one-time-secret-title:focus/);
  assert.match(styles, /\.rpc-launch-progress:focus-visible/);

  assert.match(source, /platform identity only/);
  assert.match(source, /Unbound identity key/);
  assert.match(source, /Platform identity only/);
  assert.match(source, /platform:identity/);
  assert.match(
    source,
    /Not accepted by RPC or native gRPC services/,
  );
  assert.match(
    source,
    /apiKey\.serviceId !== null[\s\S]+rpcServiceIds\.has/,
  );
  assert.doesNotMatch(source, /workspace-wide/i);
  assert.doesNotMatch(source, /Accepted by compatible services/);
  assert.doesNotMatch(source, /compatibility key/);
});

test("service states, gRPC defaults, and responsive cards remain honest", async () => {
  const [source, grpc, styles] = await Promise.all([
    readFile(consoleUrl, "utf8"),
    readFile(grpcUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);

  assert.match(source, /resolveConsoleServiceReadiness/);
  assert.match(source, /Callable endpoints/);
  assert.match(source, /serviceReadiness === "callable"/);
  assert.match(source, /Endpoint missing/);
  assert.match(source, /Gateway not verified/);
  assert.match(
    source,
    /Callable means active with an exact endpoint/,
  );
  assert.match(
    source,
    /No callable endpoint is available for this[\s\S]+product/,
  );
  assert.match(
    source,
    /serviceProduct === "grpc-api"[\s\S]+setServiceNetwork\("ethereum"\)/,
  );
  assert.match(
    source,
    /serviceProduct === "grpc-api"[\s\S]+setServiceRegion\("global"\)/,
  );
  assert.match(source, /aria-busy=\{rpcLaunchBusy\}/);
  assert.match(source, /aria-busy=\{workspaceState === "submitting"\}/);
  assert.match(source, /aria-busy=\{serviceState === "submitting"\}/);
  assert.match(source, /aria-busy=\{keyState === "submitting"\}/);

  assert.match(
    grpc,
    /!activeKey[\s\S]+\? "key"[\s\S]+!descriptor[\s\S]+\? "gateway"/,
  );
  assert.match(grpc, /aria-busy=\{busy\}/);
  assert.match(grpc, /id="grpc-first-call-title" tabIndex=\{-1\}/);
  assert.match(grpc, /id="grpc-saved-state-title" tabIndex=\{-1\}/);

  assert.match(styles, /\.grpc-endpoint-card,/);
  assert.match(styles, /\.grpc-access-facts/);
  assert.match(styles, /\.grpc-contract-card/);
  assert.match(styles, /\.grpc-saved-state/);
  assert.match(
    styles,
    /@media \(max-width: 620px\)[\s\S]+\.grpc-endpoint-card,[\s\S]+grid-template-columns: 1fr/,
  );
  assert.match(
    styles,
    /@media \(forced-colors: active\)[\s\S]+\.grpc-saved-state/,
  );

  for (const value of [source, grpc, styles]) {
    assert.doesNotMatch(value, /\u2014/);
  }
});
