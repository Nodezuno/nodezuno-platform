import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  apiKeyMatchesUnboundPurpose,
  canCreateUnboundApiKey,
  defaultUnboundApiKeyName,
  isServiceAutomationApiKey,
  serviceAutomationCommands,
  unboundApiKeyAccessBoundary,
  unboundApiKeyCreationPayload,
  unboundApiKeyPurposes,
} from "../lib/client/service-automation.ts";

const consoleUrl = new URL(
  "../components/developer-console.tsx",
  import.meta.url,
);
const quickstartUrl = new URL(
  "../components/service-automation-quickstart.tsx",
  import.meta.url,
);
const clientUrl = new URL(
  "../lib/client/service-automation.ts",
  import.meta.url,
);
const stylesUrl = new URL("../app/globals.css", import.meta.url);

test("only owners and admins can create unbound API keys", () => {
  assert.equal(canCreateUnboundApiKey("owner"), true);
  assert.equal(canCreateUnboundApiKey("admin"), true);
  assert.equal(canCreateUnboundApiKey("developer"), false);
  assert.equal(canCreateUnboundApiKey(null), false);
  assert.equal(canCreateUnboundApiKey(undefined), false);
});

test("unbound key purposes expose distinct and exact access boundaries", () => {
  assert.deepEqual(
    unboundApiKeyPurposes.map(({ id, scope }) => ({ id, scope })),
    [
      {
        id: "platform-identity",
        scope: "platform:identity",
      },
      {
        id: "service-automation",
        scope: "services:manage",
      },
    ],
  );
  assert.equal(
    defaultUnboundApiKeyName("platform-identity"),
    "Platform identity",
  );
  assert.equal(
    defaultUnboundApiKeyName("service-automation"),
    "Service automation",
  );
});

test("identity omits scopes while automation sends exactly services:manage", () => {
  const identity = unboundApiKeyCreationPayload(
    "  Platform deploy  ",
    "platform-identity",
  );
  const automation = unboundApiKeyCreationPayload(
    "  Production automation  ",
    "service-automation",
  );

  assert.deepEqual(identity, { name: "Platform deploy" });
  assert.equal(Object.hasOwn(identity, "scopes"), false);
  assert.deepEqual(automation, {
    name: "Production automation",
    scopes: ["services:manage"],
  });
  assert.equal(Object.keys(automation).length, 2);

  assert.throws(() =>
    unboundApiKeyCreationPayload(" ", "platform-identity"),
  );
  assert.throws(() =>
    unboundApiKeyCreationPayload("x", "service-automation"),
  );
  assert.throws(() =>
    unboundApiKeyCreationPayload(
      "x".repeat(61),
      "service-automation",
    ),
  );
});

test("returned metadata must confirm the exact requested unbound purpose", () => {
  const automation = {
    serviceId: null,
    scopes: ["services:manage"],
  };
  const identity = {
    serviceId: null,
    scopes: ["platform:identity"],
  };

  assert.equal(isServiceAutomationApiKey(automation), true);
  assert.equal(isServiceAutomationApiKey(identity), false);
  assert.equal(
    isServiceAutomationApiKey({
      serviceId: "bound-service",
      scopes: ["services:manage"],
    }),
    false,
  );
  assert.equal(
    isServiceAutomationApiKey({
      serviceId: null,
      scopes: ["services:manage", "rpc:invoke"],
    }),
    false,
  );

  assert.equal(
    apiKeyMatchesUnboundPurpose(
      automation,
      "service-automation",
    ),
    true,
  );
  assert.equal(
    apiKeyMatchesUnboundPurpose(identity, "platform-identity"),
    true,
  );
  assert.equal(
    apiKeyMatchesUnboundPurpose(
      identity,
      "service-automation",
    ),
    false,
  );
  assert.equal(
    unboundApiKeyAccessBoundary(automation),
    "service automation only",
  );
  assert.equal(
    unboundApiKeyAccessBoundary(identity),
    "platform identity only",
  );
  assert.equal(
    unboundApiKeyAccessBoundary({
      serviceId: "bound-service",
      scopes: ["rpc:invoke"],
    }),
    "one bound service",
  );
});

test("automation quickstart covers every supported control-plane operation", () => {
  const commands = serviceAutomationCommands(
    "https://console.nodezuno.test",
  );
  assert.deepEqual(
    commands.map(({ id, method }) => ({ id, method })),
    [
      { id: "environment", method: "ENV" },
      { id: "list", method: "GET" },
      { id: "create", method: "POST" },
      { id: "archive", method: "DELETE" },
      { id: "usage", method: "GET" },
      { id: "policy-read", method: "GET" },
      { id: "policy-update", method: "PUT" },
    ],
  );

  const byId = Object.fromEntries(
    commands.map((command) => [command.id, command.command]),
  );
  assert.match(
    byId.list,
    /\/api\/v1\/control-plane\/services"/,
  );
  assert.match(
    byId.create,
    /-X POST "\$NODEZUNO_ORIGIN\/api\/v1\/control-plane\/services"/,
  );
  assert.match(
    byId.create,
    /"Idempotency-Key: \$IDEMPOTENCY_KEY"/,
  );
  assert.match(byId.create, /"product": "rpc-api"/);
  assert.match(byId.create, /"network": "base"/);
  assert.match(
    byId.archive,
    /-X DELETE "\$NODEZUNO_ORIGIN\/api\/v1\/control-plane\/services\/\$SERVICE_ID"/,
  );
  assert.match(
    byId.usage,
    /\/services\/\$SERVICE_ID\/usage\?window=24h"/,
  );
  assert.match(
    byId["policy-read"],
    /\/services\/\$SERVICE_ID\/rpc-access-policy"/,
  );
  assert.match(
    byId["policy-update"],
    /-X PUT "\$NODEZUNO_ORIGIN\/api\/v1\/control-plane\/services\/\$SERVICE_ID\/rpc-access-policy"/,
  );
  assert.match(byId["policy-update"], /"revision": 0/);
  assert.match(byId["policy-update"], /"allowedOrigins": \[/);
  assert.match(byId["policy-update"], /"allowedIpCidrs": \[\]/);
  assert.match(byId["policy-update"], /"allowedMethods": \[/);

  for (const id of [
    "list",
    "create",
    "archive",
    "usage",
    "policy-read",
    "policy-update",
  ]) {
    assert.match(
      byId[id],
      /Authorization: Bearer \$NODEZUNO_API_KEY/,
      id,
    );
    assert.match(byId[id], /Accept: application\/json/, id);
  }
});

test("visible commands contain placeholders and never receive a one-time secret", () => {
  const fakeSecret =
    "nzu_live_THIS_VALUE_MUST_NEVER_APPEAR_IN_COMMANDS";
  const commands = serviceAutomationCommands(
    "https://console.nodezuno.test",
  );
  const visibleCommands = commands
    .map((command) => command.command)
    .join("\n");

  assert.match(
    visibleCommands,
    /NODEZUNO_API_KEY="<load-from-your-secret-manager>"/,
  );
  assert.match(visibleCommands, /\$NODEZUNO_API_KEY/);
  assert.doesNotMatch(visibleCommands, new RegExp(fakeSecret));
  assert.doesNotMatch(
    visibleCommands,
    /\b(?:npm|pnpm|yarn|bun)\s+(?:add|install)\b/i,
  );
  assert.doesNotMatch(visibleCommands, /\bnpx\s+nodezuno\b/i);
  assert.doesNotMatch(visibleCommands, /\bpnpm\s+nodezuno\b/i);
});

test("automation command origins fail closed to one HTTP or HTTPS origin", () => {
  assert.match(
    serviceAutomationCommands("http://localhost:3000")[0].command,
    /NODEZUNO_ORIGIN="http:\/\/localhost:3000"/,
  );
  assert.throws(() =>
    serviceAutomationCommands("ftp://nodezuno.test"),
  );
  assert.throws(() =>
    serviceAutomationCommands(
      "https://user:password@nodezuno.test",
    ),
  );
  assert.throws(() =>
    serviceAutomationCommands("https://nodezuno.test/path"),
  );
  assert.throws(() =>
    serviceAutomationCommands("https://nodezuno.test?secret=true"),
  );
  assert.throws(() => serviceAutomationCommands("not an origin"));
});

test("console key creation is purpose-aware and preserves idempotent receipt handling", async () => {
  const source = await readFile(consoleUrl, "utf8");
  const createStart = source.indexOf("async function createApiKey");
  const createEnd = source.indexOf(
    "function chooseKeyPurpose",
    createStart,
  );
  assert.ok(createStart >= 0 && createEnd > createStart);
  const createFunction = source.slice(createStart, createEnd);

  assert.match(
    source,
    /<fieldset[\s\S]+className="api-key-purpose"[\s\S]+<legend>Unbound key purpose<\/legend>/,
  );
  assert.match(
    source,
    /name="unbound-api-key-purpose"[\s\S]+type="radio"/,
  );
  assert.match(source, /aria-describedby="api-key-purpose-help"/);
  assert.match(source, /canCreateUnboundApiKey\(workspace\?\.role\)/);
  assert.match(
    createFunction,
    /unboundApiKeyCreationPayload\(\s*keyName,\s*keyPurpose,\s*\)/,
  );
  assert.doesNotMatch(
    createFunction,
    /\{\s*name:\s*keyName\.trim\(\)\s*\}/,
  );
  assert.match(
    createFunction,
    /postIdempotentControlPlane<SecretReceipt>/,
  );
  assert.match(createFunction, /"api-key\.create"/);
  assert.match(createFunction, /setSecretReceipt\(envelope\.data\)/);
  assert.match(
    createFunction,
    /apiKeyMatchesUnboundPurpose\(\s*envelope\.data\.apiKey,\s*keyPurpose,\s*\)/,
  );
});

test("the quickstart appears only for a confirmed management-key receipt and gets no secret prop", async () => {
  const [source, quickstart] = await Promise.all([
    readFile(consoleUrl, "utf8"),
    readFile(quickstartUrl, "utf8"),
  ]);

  assert.match(
    source,
    /const automationSecretReceipt =[\s\S]+secretReceiptSurface === "api-keys"[\s\S]+isServiceAutomationApiKey\(secretReceipt\.apiKey\)/,
  );
  assert.match(
    source,
    /\{automationSecretReceipt \? \(\s*<ServiceAutomationQuickstart[\s\S]+apiKeyName=\{automationSecretReceipt\.apiKey\.name\}[\s\S]+browserOrigin=\{browserOrigin\}[\s\S]+\/>\s*\) : null\}/,
  );
  assert.doesNotMatch(
    source,
    /<ServiceAutomationQuickstart[\s\S]{0,300}\bsecret=/,
  );
  assert.match(quickstart, /apiKeyName: string;/);
  assert.match(quickstart, /browserOrigin: string;/);
  assert.doesNotMatch(quickstart, /\bsecret:\s*string/);
  assert.doesNotMatch(quickstart, /console\.(?:log|info|debug|warn|error)/);
  assert.match(quickstart, /The secret is not duplicated/);
  assert.match(quickstart, /intentional placeholder/);
});

test("the existing one-time receipt keeps copy, download, and dismissal controls", async () => {
  const source = await readFile(consoleUrl, "utf8");
  const receiptStart = source.indexOf(
    'id="api-one-time-secret-title"',
  );
  const receiptEnd = source.indexOf(
    "{automationSecretReceipt ?",
    receiptStart,
  );
  assert.ok(receiptStart >= 0 && receiptEnd > receiptStart);
  const receipt = source.slice(receiptStart, receiptEnd);

  assert.match(receipt, /secretReceipt\.secret/);
  assert.match(receipt, /onClick=\{\(\) => void copySecret\(\)\}/);
  assert.match(receipt, /onClick=\{downloadSecret\}/);
  assert.match(
    receipt,
    /dismissOneTimeSecret\("api-keys-list-title"\)/,
  );
});

test("workspace key inventory distinguishes automation from identity and bound keys", async () => {
  const source = await readFile(consoleUrl, "utf8");

  assert.match(
    source,
    /const serviceAutomationKey =\s*isServiceAutomationApiKey\(apiKey\)/,
  );
  assert.match(source, /"is-unbound-automation"/);
  assert.match(source, /"is-unbound-identity"/);
  assert.match(source, /"is-service-bound"/);
  assert.match(source, /"Unbound automation key"/);
  assert.match(source, /"Unbound identity key"/);
  assert.match(
    source,
    /Accepted only by the programmatic service control plane/,
  );
});

test("automation UI has command navigation, status feedback, and adaptive styles", async () => {
  const [quickstart, styles] = await Promise.all([
    readFile(quickstartUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);

  assert.match(
    quickstart,
    /aria-label="Service automation request examples"/,
  );
  assert.match(quickstart, /aria-pressed=\{command\.id === activeCommand\.id\}/);
  assert.match(quickstart, /aria-describedby=/);
  assert.match(quickstart, /tabIndex=\{0\}/);
  assert.match(quickstart, /role="status"/);
  assert.match(quickstart, /role="alert"/);
  assert.match(quickstart, /navigator\.clipboard\?\.writeText/);
  assert.match(quickstart, /document\.execCommand\("copy"\)/);

  assert.match(styles, /\.api-key-purpose/);
  assert.match(styles, /\.service-automation-quickstart/);
  assert.match(
    styles,
    /\.service-automation-command-list button\[aria-pressed="true"\]/,
  );
  assert.match(
    styles,
    /@media \(max-width: 720px\)[\s\S]+\.service-automation-workbench/,
  );
  assert.match(
    styles,
    /@media \(hover: none\), \(pointer: coarse\)[\s\S]+\.service-automation-command-list button/,
  );
  assert.match(
    styles,
    /@media \(forced-colors: active\)[\s\S]+\.service-automation-quickstart/,
  );
});

test("service automation files contain no em dash", async () => {
  const contents = await Promise.all(
    [consoleUrl, quickstartUrl, clientUrl, stylesUrl].map((url) =>
      readFile(url, "utf8"),
    ),
  );
  for (const content of contents) {
    assert.doesNotMatch(content, /\u2014/);
  }
});
