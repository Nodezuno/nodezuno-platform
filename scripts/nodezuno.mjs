import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const API_KEY_PATTERN =
  /^nzu_live_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_[A-Za-z0-9_-]{43}$/;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_POLICY_FILE_BYTES = 32 * 1024;
const DEFAULT_TIMEOUT_MS = 15_000;
const usage = `Nodezuno service automation

Authentication:
  Export NODEZUNO_API_KEY with an unbound services:manage key.
  Export NODEZUNO_API_ORIGIN, or pass --origin https://nodezuno.com.

Commands:
  services list
  services get <service-id>
  services create --product <product> --name <name> --environment <environment> --network <network> --region <region> [--idempotency-key <key>]
  services rename <service-id> --name <name> --updated-at <ISO timestamp>
  services archive <service-id>
  services usage <service-id> [--window 24h|7d|30d]
  services policy get <service-id>
  services policy set <service-id> --file <policy.json>
  services guardrail get <service-id>
  services guardrail set <service-id> --limit <inherit|units> --warning-percent <50-95> --revision <revision>
  keys list
  keys create --name <name> --scope <scope> [--service-id <service-id>] [--idempotency-key <key>]
  keys revoke <key-id>
  keys rotate <key-id> [--name <name>] [--idempotency-key <key>]
`;

export class NodezunoCliError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "NodezunoCliError";
    this.exitCode = options.exitCode ?? 1;
    this.code = options.code ?? null;
    this.requestId = options.requestId ?? null;
  }
}

export function normalizeControlPlaneOrigin(value) {
  let origin;
  try {
    origin = new URL(value);
  } catch {
    throw new NodezunoCliError(
      "NODEZUNO_API_ORIGIN must be an absolute HTTPS origin.",
      { exitCode: 2 },
    );
  }
  const loopback =
    origin.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (
    (!loopback && origin.protocol !== "https:") ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  ) {
    throw new NodezunoCliError(
      "Use an HTTPS origin, or loopback HTTP for local development, without a path or credentials.",
      { exitCode: 2 },
    );
  }
  return origin;
}

export function readServiceManagementKey(environment) {
  const key = environment.NODEZUNO_API_KEY?.trim() ?? "";
  if (!API_KEY_PATTERN.test(key)) {
    throw new NodezunoCliError(
      "Export a valid unbound services:manage key as NODEZUNO_API_KEY.",
      { exitCode: 2 },
    );
  }
  return key;
}

export function parseCliArguments(argv, environment = process.env) {
  const argumentsCopy = [...argv];
  let originValue =
    environment.NODEZUNO_API_ORIGIN?.trim() ||
    "https://nodezuno.com";
  const originIndex = argumentsCopy.indexOf("--origin");
  if (originIndex >= 0) {
    if (
      originIndex === argumentsCopy.length - 1 ||
      argumentsCopy.filter((value) => value === "--origin").length !== 1
    ) {
      throw new NodezunoCliError(
        "Pass --origin exactly once with an absolute origin.",
        { exitCode: 2 },
      );
    }
    originValue = argumentsCopy[originIndex + 1];
    argumentsCopy.splice(originIndex, 2);
  }
  const origin = normalizeControlPlaneOrigin(originValue);
  if (
    argumentsCopy.length === 0 ||
    argumentsCopy[0] === "help" ||
    argumentsCopy[0] === "--help" ||
    argumentsCopy[0] === "-h"
  ) {
    return { kind: "help", origin };
  }
  if (argumentsCopy[0] === "keys") {
    return parseApiKeyCommand(argumentsCopy, origin);
  }
  if (argumentsCopy[0] !== "services") {
    throw new NodezunoCliError(
      "Choose a documented Nodezuno command.",
      { exitCode: 2 },
    );
  }

  const action = argumentsCopy[1];
  if (action === "list" && argumentsCopy.length === 2) {
    return { kind: "services.list", origin };
  }
  if (action === "get") {
    assertExactServiceIdCommand(argumentsCopy, 3);
    return {
      kind: "services.get",
      origin,
      serviceId: argumentsCopy[2],
    };
  }
  if (action === "create") {
    const flags = parseNamedFlags(argumentsCopy.slice(2), [
      "product",
      "name",
      "environment",
      "network",
      "region",
      "idempotency-key",
    ]);
    for (const required of [
      "product",
      "name",
      "environment",
      "network",
      "region",
    ]) {
      if (!flags[required]) {
        throw new NodezunoCliError(
          `Pass --${required} for service creation.`,
          { exitCode: 2 },
        );
      }
    }
    const idempotencyKey =
      flags["idempotency-key"] ??
      `nzu-cli-${crypto.randomUUID()}`;
    if (
      idempotencyKey.length < 16 ||
      idempotencyKey.length > 128 ||
      !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)
    ) {
      throw new NodezunoCliError(
        "Use a 16 to 128 character idempotency key containing letters, numbers, dots, underscores, colons, or hyphens.",
        { exitCode: 2 },
      );
    }
    return {
      kind: "services.create",
      origin,
      input: {
        product: flags.product,
        name: flags.name,
        environment: flags.environment,
        network: flags.network,
        region: flags.region,
      },
      idempotencyKey,
    };
  }
  if (action === "rename") {
    if (!UUID_V4_PATTERN.test(argumentsCopy[2] ?? "")) {
      throw invalidServiceIdProblem();
    }
    const flags = parseNamedFlags(argumentsCopy.slice(3), [
      "name",
      "updated-at",
    ]);
    const name = flags.name?.trim() ?? "";
    if (
      name.length < 2 ||
      name.length > 80 ||
      /[\u0000-\u001f\u007f]/.test(name)
    ) {
      throw new NodezunoCliError(
        "Pass --name with a 2 to 80 character service name.",
        { exitCode: 2 },
      );
    }
    const updatedAt = flags["updated-at"] ?? "";
    const timestamp = Date.parse(updatedAt);
    if (
      !Number.isSafeInteger(timestamp) ||
      timestamp < 0 ||
      new Date(timestamp).toISOString() !== updatedAt
    ) {
      throw new NodezunoCliError(
        "Pass --updated-at with the exact ISO timestamp from the current service.",
        { exitCode: 2 },
      );
    }
    return {
      kind: "services.rename",
      origin,
      serviceId: argumentsCopy[2],
      input: { name, updatedAt },
    };
  }
  if (action === "archive") {
    assertExactServiceIdCommand(argumentsCopy, 3);
    return {
      kind: "services.archive",
      origin,
      serviceId: argumentsCopy[2],
    };
  }
  if (action === "usage") {
    if (!UUID_V4_PATTERN.test(argumentsCopy[2] ?? "")) {
      throw invalidServiceIdProblem();
    }
    const flags = parseNamedFlags(argumentsCopy.slice(3), ["window"]);
    const window = flags.window ?? "24h";
    if (!["24h", "7d", "30d"].includes(window)) {
      throw new NodezunoCliError(
        "Use 24h, 7d, or 30d for --window.",
        { exitCode: 2 },
      );
    }
    return {
      kind: "services.usage",
      origin,
      serviceId: argumentsCopy[2],
      window,
    };
  }
  if (action === "policy") {
    const operation = argumentsCopy[2];
    const serviceId = argumentsCopy[3] ?? "";
    if (!UUID_V4_PATTERN.test(serviceId)) {
      throw invalidServiceIdProblem();
    }
    if (operation === "get" && argumentsCopy.length === 4) {
      return {
        kind: "services.policy.get",
        origin,
        serviceId,
      };
    }
    if (operation === "set") {
      const flags = parseNamedFlags(argumentsCopy.slice(4), ["file"]);
      if (!flags.file) {
        throw new NodezunoCliError(
          "Pass --file with a complete RPC access-policy JSON document.",
          { exitCode: 2 },
        );
      }
      return {
        kind: "services.policy.set",
        origin,
        serviceId,
        file: flags.file,
      };
    }
  }
  if (action === "guardrail") {
    const operation = argumentsCopy[2];
    const serviceId = argumentsCopy[3] ?? "";
    if (!UUID_V4_PATTERN.test(serviceId)) {
      throw invalidServiceIdProblem();
    }
    if (operation === "get" && argumentsCopy.length === 4) {
      return {
        kind: "services.guardrail.get",
        origin,
        serviceId,
      };
    }
    if (operation === "set") {
      const flags = parseNamedFlags(argumentsCopy.slice(4), [
        "limit",
        "warning-percent",
        "revision",
      ]);
      if (
        !flags.limit ||
        !flags["warning-percent"] ||
        !flags.revision
      ) {
        throw new NodezunoCliError(
          "Pass --limit, --warning-percent, and --revision for a guardrail update.",
          { exitCode: 2 },
        );
      }
      const hourlyQuotaLimit =
        flags.limit === "inherit"
          ? null
          : parseBoundedInteger(
              flags.limit,
              100,
              10_000_000,
              "Use inherit or an hourly service limit from 100 through 10000000.",
            );
      return {
        kind: "services.guardrail.set",
        origin,
        serviceId,
        input: {
          hourlyQuotaLimit,
          warningThresholdPercent: parseBoundedInteger(
            flags["warning-percent"],
            50,
            95,
            "Use a warning percent from 50 through 95.",
          ),
          revision: parseBoundedInteger(
            flags.revision,
            0,
            2_147_483_647,
            "Use the nonnegative revision returned by the guardrail API.",
          ),
        },
      };
    }
  }
  throw new NodezunoCliError(
    "The command is incomplete or contains unsupported arguments.",
    { exitCode: 2 },
  );
}

function parseApiKeyCommand(values, origin) {
  const action = values[1];
  if (action === "list" && values.length === 2) {
    return { kind: "keys.list", origin };
  }
  if (action === "create") {
    const flags = parseNamedFlags(values.slice(2), [
      "name",
      "scope",
      "service-id",
      "idempotency-key",
    ]);
    const name = normalizedApiKeyName(flags.name);
    const scope = flags.scope ?? "";
    if (
      ![
        "platform:identity",
        "services:manage",
        "rpc:invoke",
        "grpc:invoke",
      ].includes(scope)
    ) {
      throw new NodezunoCliError(
        "Use platform:identity, services:manage, rpc:invoke, or grpc:invoke for --scope.",
        { exitCode: 2 },
      );
    }
    const serviceId = flags["service-id"] ?? null;
    if (
      serviceId !== null &&
      !UUID_V4_PATTERN.test(serviceId)
    ) {
      throw invalidServiceIdProblem();
    }
    const callable =
      scope === "rpc:invoke" || scope === "grpc:invoke";
    if (callable !== (serviceId !== null)) {
      throw new NodezunoCliError(
        callable
          ? "Callable RPC and gRPC keys require --service-id."
          : "Platform and service-management keys must not use --service-id.",
        { exitCode: 2 },
      );
    }
    return {
      kind: "keys.create",
      origin,
      input: {
        name,
        serviceId,
        scopes: [scope],
      },
      idempotencyKey: parseIdempotencyKey(
        flags["idempotency-key"],
        "nzu-cli-key",
      ),
    };
  }
  if (action === "revoke") {
    assertExactApiKeyIdCommand(values, 3);
    return {
      kind: "keys.revoke",
      origin,
      apiKeyId: values[2],
    };
  }
  if (action === "rotate") {
    if (!UUID_V4_PATTERN.test(values[2] ?? "")) {
      throw invalidApiKeyIdProblem();
    }
    const flags = parseNamedFlags(values.slice(3), [
      "name",
      "idempotency-key",
    ]);
    return {
      kind: "keys.rotate",
      origin,
      apiKeyId: values[2],
      input: {
        name:
          flags.name === undefined
            ? null
            : normalizedApiKeyName(flags.name),
      },
      idempotencyKey: parseIdempotencyKey(
        flags["idempotency-key"],
        "nzu-cli-key-rotate",
      ),
    };
  }
  throw new NodezunoCliError(
    "The API-key command is incomplete or contains unsupported arguments.",
    { exitCode: 2 },
  );
}

export async function executeControlPlaneCommand(command, options) {
  if (command.kind === "help") return { help: usage };
  const key = readServiceManagementKey(options.environment);
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const request = (pathname, init = {}) =>
    controlPlaneRequest(command.origin, key, pathname, {
      ...init,
      fetchImplementation,
      timeoutMs: options.timeoutMs,
    });

  if (command.kind === "services.list") {
    return request("/api/v1/control-plane/services");
  }
  if (command.kind === "services.get") {
    return request(
      `/api/v1/control-plane/services/${encodeURIComponent(command.serviceId)}`,
    );
  }
  if (command.kind === "services.create") {
    return request("/api/v1/control-plane/services", {
      method: "POST",
      idempotencyKey: command.idempotencyKey,
      body: command.input,
    });
  }
  if (command.kind === "services.rename") {
    return request(
      `/api/v1/control-plane/services/${encodeURIComponent(command.serviceId)}`,
      { method: "PATCH", body: command.input },
    );
  }
  if (command.kind === "services.archive") {
    return request(
      `/api/v1/control-plane/services/${encodeURIComponent(command.serviceId)}`,
      { method: "DELETE" },
    );
  }
  if (command.kind === "services.usage") {
    return request(
      `/api/v1/control-plane/services/${encodeURIComponent(
        command.serviceId,
      )}/usage?window=${encodeURIComponent(command.window)}`,
    );
  }
  if (command.kind === "services.policy.get") {
    return request(
      `/api/v1/control-plane/services/${encodeURIComponent(
        command.serviceId,
      )}/rpc-access-policy`,
    );
  }
  if (command.kind === "services.policy.set") {
    const body = await readPolicyFile(
      command.file,
      options.readFileImplementation ?? readFile,
    );
    return request(
      `/api/v1/control-plane/services/${encodeURIComponent(
        command.serviceId,
      )}/rpc-access-policy`,
      { method: "PUT", body },
    );
  }
  if (command.kind === "services.guardrail.get") {
    return request(
      `/api/v1/control-plane/services/${encodeURIComponent(
        command.serviceId,
      )}/quota-guardrail`,
    );
  }
  if (command.kind === "services.guardrail.set") {
    return request(
      `/api/v1/control-plane/services/${encodeURIComponent(
        command.serviceId,
      )}/quota-guardrail`,
      { method: "PUT", body: command.input },
    );
  }
  if (command.kind === "keys.list") {
    return request("/api/v1/control-plane/api-keys");
  }
  if (command.kind === "keys.create") {
    return request("/api/v1/control-plane/api-keys", {
      method: "POST",
      idempotencyKey: command.idempotencyKey,
      body: command.input,
    });
  }
  if (command.kind === "keys.revoke") {
    return request(
      `/api/v1/control-plane/api-keys/${encodeURIComponent(
        command.apiKeyId,
      )}`,
      { method: "DELETE" },
    );
  }
  if (command.kind === "keys.rotate") {
    return request(
      `/api/v1/control-plane/api-keys/${encodeURIComponent(
        command.apiKeyId,
      )}/rotate`,
      {
        method: "POST",
        idempotencyKey: command.idempotencyKey,
        body: command.input,
      },
    );
  }
  throw new NodezunoCliError("The command is unsupported.", {
    exitCode: 2,
  });
}

async function controlPlaneRequest(origin, key, pathname, options) {
  const headers = new Headers({
    Accept: "application/json",
    Authorization: `Bearer ${key}`,
  });
  const init = {
    method: options.method ?? "GET",
    headers,
    redirect: "manual",
  };
  if (options.idempotencyKey) {
    headers.set("Idempotency-Key", options.idempotencyKey);
  }
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(options.body);
  }
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  let response;
  try {
    response = await options.fetchImplementation(
      new URL(pathname, origin),
      { ...init, signal: controller.signal },
    );
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new NodezunoCliError(
        "The Nodezuno control-plane request timed out.",
      );
    }
    throw new NodezunoCliError(
      "The Nodezuno control plane could not be reached.",
    );
  } finally {
    clearTimeout(timeout);
  }
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new NodezunoCliError(
      "The Nodezuno control plane returned an unexpected redirect.",
    );
  }
  const contentType =
    response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!/^application\/(?:problem\+)?json(?:;|$)/.test(contentType)) {
    await response.body?.cancel();
    throw new NodezunoCliError(
      "The Nodezuno control plane returned an unexpected content type.",
    );
  }
  const declaredLength = Number(
    response.headers.get("content-length") ?? 0,
  );
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_RESPONSE_BYTES
  ) {
    await response.body?.cancel();
    throw new NodezunoCliError(
      "The Nodezuno control-plane response exceeded the safety limit.",
    );
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
    throw new NodezunoCliError(
      "The Nodezuno control-plane response exceeded the safety limit.",
    );
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new NodezunoCliError(
      "The Nodezuno control plane returned an invalid JSON response.",
    );
  }
  if (!response.ok) {
    throw new NodezunoCliError(
      safeProblemTitle(payload, response.status),
      {
        code: safeProblemValue(payload?.code),
        requestId: safeProblemValue(payload?.requestId),
      },
    );
  }
  return payload;
}

async function readPolicyFile(pathname, readFileImplementation) {
  let bytes;
  try {
    bytes = await readFileImplementation(pathname);
  } catch {
    throw new NodezunoCliError(
      "The RPC access-policy file could not be read.",
      { exitCode: 2 },
    );
  }
  if (bytes.byteLength > MAX_POLICY_FILE_BYTES) {
    throw new NodezunoCliError(
      "The RPC access-policy file exceeds 32 KiB.",
      { exitCode: 2 },
    );
  }
  let payload;
  try {
    payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new NodezunoCliError(
      "The RPC access-policy file must contain UTF-8 JSON.",
      { exitCode: 2 },
    );
  }
  return payload;
}

function parseNamedFlags(values, allowedNames) {
  const allowed = new Set(allowedNames);
  const parsed = {};
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index] ?? "";
    const value = values[index + 1];
    if (
      !flag.startsWith("--") ||
      value === undefined ||
      value.startsWith("--")
    ) {
      throw new NodezunoCliError(
        "Pass every option as --name value.",
        { exitCode: 2 },
      );
    }
    const name = flag.slice(2);
    if (!allowed.has(name) || Object.hasOwn(parsed, name)) {
      throw new NodezunoCliError(
        `The option --${name || "unknown"} is unsupported or repeated.`,
        { exitCode: 2 },
      );
    }
    parsed[name] = value;
  }
  return parsed;
}

function parseBoundedInteger(value, minimum, maximum, message) {
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new NodezunoCliError(message, { exitCode: 2 });
  }
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    throw new NodezunoCliError(message, { exitCode: 2 });
  }
  return parsed;
}

function normalizedApiKeyName(value) {
  const name = value?.trim().replace(/\s+/g, " ") ?? "";
  if (
    name.length < 2 ||
    name.length > 60 ||
    /[\u0000-\u001f\u007f]/.test(name)
  ) {
    throw new NodezunoCliError(
      "Pass --name with a 2 to 60 character API key name.",
      { exitCode: 2 },
    );
  }
  return name;
}

function parseIdempotencyKey(value, prefix) {
  const key = value ?? `${prefix}-${crypto.randomUUID()}`;
  if (
    key.length < 16 ||
    key.length > 128 ||
    !/^[A-Za-z0-9._:-]+$/.test(key)
  ) {
    throw new NodezunoCliError(
      "Use a 16 to 128 character idempotency key containing letters, numbers, dots, underscores, colons, or hyphens.",
      { exitCode: 2 },
    );
  }
  return key;
}

function assertExactServiceIdCommand(values, expectedLength) {
  if (
    values.length !== expectedLength ||
    !UUID_V4_PATTERN.test(values[2] ?? "")
  ) {
    throw invalidServiceIdProblem();
  }
}

function invalidServiceIdProblem() {
  return new NodezunoCliError(
    "Use a valid version 4 service identifier.",
    { exitCode: 2 },
  );
}

function assertExactApiKeyIdCommand(values, expectedLength) {
  if (
    values.length !== expectedLength ||
    !UUID_V4_PATTERN.test(values[2] ?? "")
  ) {
    throw invalidApiKeyIdProblem();
  }
}

function invalidApiKeyIdProblem() {
  return new NodezunoCliError(
    "Use a valid version 4 API key identifier.",
    { exitCode: 2 },
  );
}

function safeProblemValue(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value)
    ? value
    : null;
}

function safeProblemTitle(payload, status) {
  const value = payload?.title;
  if (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 200 &&
    !/[\u0000-\u001f\u007f]/.test(value)
  ) {
    return value;
  }
  return `The Nodezuno control plane returned HTTP ${status}.`;
}

async function main() {
  try {
    const command = parseCliArguments(process.argv.slice(2));
    const result = await executeControlPlaneCommand(command, {
      environment: process.env,
    });
    if (command.kind === "help") {
      process.stdout.write(result.help);
      return;
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    if (error instanceof NodezunoCliError) {
      const context = [
        error.code ? `code=${error.code}` : null,
        error.requestId ? `requestId=${error.requestId}` : null,
      ]
        .filter(Boolean)
        .join(" ");
      process.stderr.write(
        `Nodezuno: ${error.message}${context ? ` (${context})` : ""}\n`,
      );
      process.exitCode = error.exitCode;
      return;
    }
    process.stderr.write("Nodezuno: an unexpected CLI error occurred.\n");
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : "";
if (invokedPath === import.meta.url) await main();
