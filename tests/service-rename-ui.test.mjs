import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  isCanonicalIsoTimestamp,
  normalizeServiceRenameName,
  parseServiceRenameMutationEnvelope,
  serviceRenameDraftProblem,
  serviceRenameFailure,
  serviceRenameRequestBody,
} from "../lib/client/service-rename.ts";

const consoleUrl = new URL(
  "../components/developer-console.tsx",
  import.meta.url,
);
const clientUrl = new URL(
  "../lib/client/service-rename.ts",
  import.meta.url,
);
const stylesUrl = new URL("../app/globals.css", import.meta.url);

const serviceId = "11111111-1111-4111-8111-111111111111";
const originalUpdatedAt = "2026-07-18T10:00:00.000Z";
const renamedUpdatedAt = "2026-07-18T10:00:00.001Z";

test("rename drafts normalize names and enforce the server boundary", () => {
  assert.equal(
    normalizeServiceRenameName("  Production   Base RPC  "),
    "Production Base RPC",
  );
  assert.equal(
    serviceRenameDraftProblem(
      "Production Base RPC",
      "Production Base RPC",
    ),
    "Enter a different service name before saving.",
  );
  assert.match(serviceRenameDraftProblem("x", "Current"), /at least 2/);
  assert.match(
    serviceRenameDraftProblem("x".repeat(81), "Current"),
    /no more than 80/,
  );
  assert.match(
    serviceRenameDraftProblem("Invalid\u0000name", "Current"),
    /control characters/,
  );
  assert.equal(
    serviceRenameDraftProblem("Production Base RPC", "Current"),
    null,
  );
});

test("rename requests contain only normalized name and the exact canonical timestamp", () => {
  const body = serviceRenameRequestBody(
    "  Production   Base RPC  ",
    originalUpdatedAt,
  );
  assert.deepEqual(body, {
    name: "Production Base RPC",
    updatedAt: originalUpdatedAt,
  });
  assert.deepEqual(Object.keys(body), ["name", "updatedAt"]);

  assert.equal(isCanonicalIsoTimestamp(originalUpdatedAt), true);
  assert.equal(
    isCanonicalIsoTimestamp("2026-07-18T10:00:00Z"),
    false,
  );
  assert.equal(
    isCanonicalIsoTimestamp("2026-07-18T15:30:00.000+05:30"),
    false,
  );
  assert.throws(() =>
    serviceRenameRequestBody("x", originalUpdatedAt),
  );
  assert.throws(() =>
    serviceRenameRequestBody(
      "Production Base RPC",
      "18 July 2026",
    ),
  );
});

test("the mutation parser accepts one exact matching renamed service", () => {
  const parsed = parseServiceRenameMutationEnvelope(
    mutationEnvelope(),
    {
      serviceId,
      name: "Production Base RPC",
      previousUpdatedAt: originalUpdatedAt,
    },
  );
  assert.equal(parsed.requestId, "request.rename.1");
  assert.equal(parsed.service.id, serviceId);
  assert.equal(parsed.service.name, "Production Base RPC");
  assert.equal(parsed.service.updatedAt, renamedUpdatedAt);
  assert.deepEqual(parsed.service.configuration, {
    methodCatalog: ["eth_chainId"],
  });
});

test("the mutation parser rejects extra, mismatched, archived, and stale response state", () => {
  assert.throws(() =>
    parseServiceRenameMutationEnvelope(
      { ...mutationEnvelope(), extra: true },
      expectedRename(),
    ),
  );
  assert.throws(() =>
    parseServiceRenameMutationEnvelope(
      {
        ...mutationEnvelope(),
        data: {
          ...mutationEnvelope().data,
          extra: true,
        },
      },
      expectedRename(),
    ),
  );
  assert.throws(() =>
    parseServiceRenameMutationEnvelope(
      mutateService({ extra: true }),
      expectedRename(),
    ),
  );
  assert.throws(() =>
    parseServiceRenameMutationEnvelope(
      mutateService({
        id: "22222222-2222-4222-8222-222222222222",
      }),
      expectedRename(),
    ),
  );
  assert.throws(() =>
    parseServiceRenameMutationEnvelope(
      mutateService({ name: "Unexpected name" }),
      expectedRename(),
    ),
  );
  assert.throws(() =>
    parseServiceRenameMutationEnvelope(
      mutateService({ updatedAt: originalUpdatedAt }),
      expectedRename(),
    ),
  );
  assert.throws(() =>
    parseServiceRenameMutationEnvelope(
      mutateService({
        status: "archived",
        archivedAt: renamedUpdatedAt,
      }),
      expectedRename(),
    ),
  );
  assert.throws(() =>
    parseServiceRenameMutationEnvelope(
      mutateService({
        telemetry: {
          requests: 10,
          calls: 10,
          errors: 0,
          upstreamFailures: 0,
          averageLatencyMs: 12,
          windowStartedAt: originalUpdatedAt,
          updatedAt: renamedUpdatedAt,
          secret: "must-not-render",
        },
      }),
      expectedRename(),
    ),
  );
});

test("rename failures classify only the exact conflict code for manual reload", () => {
  assert.deepEqual(
    serviceRenameFailure(409, {
      code: "service_update_conflict",
    }),
    {
      kind: "conflict",
      message:
        "This service changed in another session. Reload the current service before editing and saving its name again.",
    },
  );
  assert.equal(
    serviceRenameFailure(409, { code: "another_conflict" }).kind,
    "other",
  );
  assert.equal(serviceRenameFailure(404, {}).kind, "not-found");
  assert.equal(serviceRenameFailure(401, {}).kind, "unauthorized");
  assert.equal(serviceRenameFailure(422, {}).kind, "other");
  assert.equal(serviceRenameFailure(429, {}).kind, "other");
  assert.equal(serviceRenameFailure(503, {}).kind, "other");
});

test("console sends one exact same-origin PATCH and never retries automatically", async () => {
  const source = await readFile(consoleUrl, "utf8");
  const renameStart = source.indexOf("async function renameService");
  const renameEnd = source.indexOf(
    "async function reloadServiceAfterRenameIssue",
    renameStart,
  );
  assert.ok(renameStart >= 0 && renameEnd > renameStart);
  const renameFunction = source.slice(renameStart, renameEnd);

  assert.match(
    renameFunction,
    /serviceRenameRequestBody\(\s*draft\.name,\s*draft\.updatedAt,\s*\)/,
  );
  assert.match(
    renameFunction,
    /`\/api\/v1\/developer\/services\/\$\{encodeURIComponent\(service\.id\)\}`/,
  );
  assert.match(renameFunction, /method: "PATCH"/);
  assert.match(renameFunction, /credentials: "same-origin"/);
  assert.match(
    renameFunction,
    /"Content-Type": "application\/json"/,
  );
  assert.match(renameFunction, /body: JSON\.stringify\(body\)/);
  assert.match(
    renameFunction,
    /parseServiceRenameMutationEnvelope\(/,
  );
  assert.doesNotMatch(renameFunction, /loadConsole\(/);
  assert.doesNotMatch(renameFunction, /\bwhile\s*\(|\bsetInterval\s*\(/);
  assert.equal(
    renameFunction.match(/\bfetch\(/g)?.length,
    1,
  );
});

test("successful rename updates only name and timestamp in existing console service state", async () => {
  const source = await readFile(consoleUrl, "utf8");
  const renameStart = source.indexOf("async function renameService");
  const renameEnd = source.indexOf(
    "async function reloadServiceAfterRenameIssue",
    renameStart,
  );
  const renameFunction = source.slice(renameStart, renameEnd);

  assert.match(
    renameFunction,
    /item\.id === service\.id[\s\S]+\.{3}item,[\s\S]+name: envelope\.service\.name,[\s\S]+updatedAt: envelope\.service\.updatedAt/,
  );
  assert.doesNotMatch(renameFunction, /setSecretReceipt/);
  assert.doesNotMatch(renameFunction, /setApiKeys/);
  assert.doesNotMatch(renameFunction, /setRpcProbeState/);
  assert.doesNotMatch(renameFunction, /setRpcCopyState/);
  assert.doesNotMatch(renameFunction, /setServiceRenameDraft\([^n]/);
});

test("inline editor supports keyboard cancel, focus restoration, validation, and busy feedback", async () => {
  const source = await readFile(consoleUrl, "utf8");

  assert.match(source, /id=\{`rename-service-\$\{service\.id\}`\}/);
  assert.match(
    source,
    /input\.focus\(\);[\s\S]+input\.select\(\);/,
  );
  assert.match(
    source,
    /event\.key === "Escape"[\s\S]+cancelServiceRename\(service\.id\)/,
  );
  assert.match(
    source,
    /onSubmit=\{\(event\) =>[\s\S]+void renameService\(event, service\)/,
  );
  assert.match(source, /aria-busy=\{renameBusy\}/);
  assert.match(source, /aria-invalid=\{Boolean\(\s*serviceRenameError/);
  assert.match(source, /aria-describedby=\{\[/);
  assert.match(source, /autoFocus/);
  assert.match(source, /maxLength=\{80\}/);
  assert.match(source, /minLength=\{2\}/);
  assert.match(source, /className="service-rename-error"/);
  assert.match(source, /role="alert"/);
  assert.match(source, /role="status"/);
  assert.match(source, /"Save name"/);
  assert.match(source, />\s*Cancel\s*</);
  assert.match(
    source,
    /restoreServiceActionFocus\(service\.id\)/,
  );
  assert.match(
    source,
    /serviceAction \?\? fallback/,
  );
});

test("conflicts and missing services require an explicit reload that discards the stale draft", async () => {
  const source = await readFile(consoleUrl, "utf8");
  const reloadStart = source.indexOf(
    "async function reloadServiceAfterRenameIssue",
  );
  const reloadEnd = source.indexOf(
    "function cancelArchiveConfirmation",
    reloadStart,
  );
  assert.ok(reloadStart >= 0 && reloadEnd > reloadStart);
  const reloadFunction = source.slice(reloadStart, reloadEnd);

  assert.match(
    source,
    /serviceRenameFailureKind === "conflict"[\s\S]+serviceRenameFailureKind === "not-found"/,
  );
  assert.match(
    source,
    /Nodezuno will not retry this rename\s+automatically/,
  );
  assert.match(source, /"Reload current service"/);
  assert.match(reloadFunction, /await loadConsole\(true\)/);
  assert.match(reloadFunction, /setServiceRenameDraft\(null\)/);
  assert.match(
    reloadFunction,
    /Choose Rename to start again from the current timestamp/,
  );
  assert.doesNotMatch(reloadFunction, /renameService\(/);
});

test("service refresh and archive cannot race an open rename draft", async () => {
  const source = await readFile(consoleUrl, "utf8");

  assert.match(
    source,
    /refreshState === "submitting" \|\|\s*serviceRenameDraft !== null/,
  );
  assert.match(
    source,
    /archivingServiceId === service\.id \|\|\s*serviceRenameDraft !== null/,
  );
  assert.match(
    source,
    /serviceRenameDraft !== null \|\|\s*archivingServiceId !== null/,
  );
  assert.match(
    source,
    /aria-busy=\{\s*refreshState === "submitting" \|\|[\s\S]+serviceRenameState === "submitting" \|\|[\s\S]+serviceRenameReloadState === "submitting"/,
  );
});

test("rename controls adapt for mobile, coarse pointers, and forced colors", async () => {
  const styles = await readFile(stylesUrl, "utf8");

  assert.match(styles, /\.service-name-heading/);
  assert.match(styles, /\.service-rename-form/);
  assert.match(styles, /\.service-rename-actions/);
  assert.match(styles, /\.service-rename-reload/);
  assert.match(
    styles,
    /@media \(max-width: 620px\)[\s\S]+\.service-rename-form/,
  );
  assert.match(
    styles,
    /@media \(hover: none\), \(pointer: coarse\)[\s\S]+\.service-name-heading > button/,
  );
  assert.match(
    styles,
    /@media \(forced-colors: active\)[\s\S]+\.service-rename-form/,
  );
});

test("service rename files contain no em dash", async () => {
  const contents = await Promise.all(
    [consoleUrl, clientUrl, stylesUrl].map((url) =>
      readFile(url, "utf8"),
    ),
  );
  for (const content of contents) {
    assert.doesNotMatch(content, /\u2014/);
  }
});

function expectedRename() {
  return {
    serviceId,
    name: "Production Base RPC",
    previousUpdatedAt: originalUpdatedAt,
  };
}

function mutationEnvelope() {
  return {
    data: {
      service: {
        id: serviceId,
        product: "rpc-api",
        name: "Production Base RPC",
        environment: "production",
        network: "base",
        region: "global",
        status: "active",
        endpointPath: `/api/v1/rpc/${serviceId}`,
        configuration: {
          methodCatalog: ["eth_chainId"],
        },
        telemetry: null,
        createdAt: "2026-07-18T09:00:00.000Z",
        updatedAt: renamedUpdatedAt,
        archivedAt: null,
      },
    },
    requestId: "request.rename.1",
  };
}

function mutateService(fields) {
  const envelope = mutationEnvelope();
  return {
    ...envelope,
    data: {
      service: {
        ...envelope.data.service,
        ...fields,
      },
    },
  };
}
