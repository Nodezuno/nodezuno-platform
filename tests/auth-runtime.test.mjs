import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ed25519 } from "@noble/curves/ed25519.js";
import { createSignInMessage } from "@solana/wallet-standard-util";
import bs58 from "bs58";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import {
  createNodezunoAuth,
  getAuthProviderAvailability,
} from "../lib/server/auth.ts";
import {
  listSubmissionsForAccount,
  persistSubmission,
} from "../lib/server/database.ts";

const localOrigin = "http://localhost:3000";
const authSecret = "auth-runtime-test-secret-with-more-than-32-characters";

test("authentication email retries reuse a token-bound SMTP message ID", async () => {
  const authSource = await readFile(
    new URL("../lib/server/auth.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    authSource,
    /sha256Hex\(\s*`authentication-email\\u0000\$\{options\.subject\}\\u0000\$\{options\.url\}`/,
  );
  assert.match(
    authSource,
    /messageId: `nodezuno-\$\{idempotencyHash\}`/,
  );
  assert.doesNotMatch(
    authSource,
    /Idempotency-Key|RESEND/,
  );
});

test("public email auth requires mailbox delivery while loopback preview is explicit", async () => {
  const names = [
    "NODEZUNO_RUNTIME",
    "NODEZUNO_LOCAL_PREVIEW",
    "BETTER_AUTH_URL",
    "ZOHO_SMTP_HOST",
    "ZOHO_SMTP_PASSWORD",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
  ];
  const previous = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  try {
    process.env.NODEZUNO_RUNTIME = "container";
    process.env.NODEZUNO_LOCAL_PREVIEW = "false";
    process.env.BETTER_AUTH_URL = "https://nodezuno.com";
    for (const name of [
      "ZOHO_SMTP_HOST",
      "ZOHO_SMTP_PASSWORD",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
    ]) {
      delete process.env[name];
    }
    assert.deepEqual(await getAuthProviderAvailability(), {
      email: false,
      emailVerification: false,
      google: false,
      evm: true,
      solana: true,
      evmChainIds: [1, 10, 56, 137, 8453, 42161, 43114, 80002, 84532, 11155111],
    });

    process.env.NODEZUNO_LOCAL_PREVIEW = "true";
    assert.equal(
      (await getAuthProviderAvailability()).email,
      false,
    );

    process.env.BETTER_AUTH_URL = localOrigin;
    const local = await getAuthProviderAvailability();
    assert.equal(local.email, true);
    assert.equal(local.emailVerification, false);

    process.env.NODEZUNO_LOCAL_PREVIEW = "false";
    process.env.BETTER_AUTH_URL = "https://nodezuno.com";
    process.env.ZOHO_SMTP_HOST = "smtp.zoho.in";
    process.env.ZOHO_SMTP_PASSWORD = "zoho-app-password-for-test";
    const verified = await getAuthProviderAvailability();
    assert.equal(verified.email, true);
    assert.equal(verified.emailVerification, true);
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("authentication rejects unsafe production origins without leaking input", async () => {
  const names = [
    "NODE_ENV",
    "NODEZUNO_RUNTIME",
    "NODEZUNO_LOCAL_PREVIEW",
    "PUBLIC_ORIGIN",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
  ];
  const previous = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  try {
    process.env.NODE_ENV = "production";
    process.env.NODEZUNO_RUNTIME = "container";
    process.env.NODEZUNO_LOCAL_PREVIEW = "false";
    process.env.PUBLIC_ORIGIN = "https://nodezuno.com";
    process.env.BETTER_AUTH_SECRET = authSecret;

    for (const unsafeOrigin of [
      " https://nodezuno.com",
      "https://nodezuno.com ",
      "https://127.0.0.1",
      "https://[::1]",
      "https://auth.internal",
      "https://auth.nodezuno.test",
      "https://test.nodezuno.com",
      "https://example.com",
      "https://user:supersecret@nodezuno.com/private",
    ]) {
      process.env.BETTER_AUTH_URL = unsafeOrigin;
      await assert.rejects(
        createNodezunoAuth(
          new Request("https://nodezuno.com/api/auth/session"),
        ),
        (error) => {
          assert.equal(error?.status, 503);
          assert.equal(
            error?.code,
            "authentication_origin_not_configured",
          );
          assert.equal(
            error?.message,
            "Account authentication is temporarily unavailable.",
          );
          return true;
        },
      );
    }
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("authentication accepts an internal container URL only after proxy verification", async () => {
  const database = await createMigratedD1();
  const names = [
    "NODE_ENV",
    "NODEZUNO_RUNTIME",
    "NODEZUNO_LOCAL_PREVIEW",
    "PUBLIC_ORIGIN",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "ZOHO_SMTP_HOST",
    "ZOHO_SMTP_PASSWORD",
  ];
  const previous = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  try {
    process.env.NODE_ENV = "production";
    process.env.NODEZUNO_RUNTIME = "container";
    process.env.NODEZUNO_LOCAL_PREVIEW = "false";
    process.env.PUBLIC_ORIGIN = "https://nodezuno.com";
    process.env.BETTER_AUTH_URL = "https://nodezuno.com";
    process.env.BETTER_AUTH_SECRET = authSecret;
    for (const name of [
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "ZOHO_SMTP_HOST",
      "ZOHO_SMTP_PASSWORD",
    ]) {
      delete process.env[name];
    }

    for (const marker of [undefined, "0", "true"]) {
      const headers = new Headers();
      if (marker) {
        headers.set("x-nodezuno-origin-verified", marker);
      }
      await assert.rejects(
        createNodezunoAuth(
          new Request(
            "http://127.0.0.1:3000/api/auth/session",
            { headers },
          ),
          database,
        ),
        (error) => {
          assert.equal(error?.status, 400);
          assert.equal(
            error?.code,
            "authentication_origin_mismatch",
          );
          return true;
        },
      );
    }

    const auth = await createNodezunoAuth(
      new Request("http://127.0.0.1:3000/api/auth/session", {
        headers: {
          "x-nodezuno-origin-verified": "1",
        },
      }),
      database,
    );
    assert.equal(auth.options.baseURL, "https://nodezuno.com");
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("account authentication works with email, EVM, and Solana", async () => {
  const database = await createMigratedD1();
  const previousEnvironment = {
    NODEZUNO_RUNTIME: process.env.NODEZUNO_RUNTIME,
    NODEZUNO_LOCAL_PREVIEW: process.env.NODEZUNO_LOCAL_PREVIEW,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  };
  try {
    process.env.NODEZUNO_RUNTIME = "container";
    process.env.NODEZUNO_LOCAL_PREVIEW = "true";
    process.env.BETTER_AUTH_SECRET = authSecret;
    process.env.BETTER_AUTH_URL = localOrigin;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;

    const auth = await createNodezunoAuth(
      new Request(`${localOrigin}/api/auth/session`),
      database,
    );
    assert.deepEqual(
      auth.options.advanced?.ipAddress?.ipAddressHeaders,
      ["x-nodezuno-client-ip"],
    );

    const signup = await authRequest(auth, "/sign-up/email", {
      name: "Runtime Tester",
      email: "runtime@example.com",
      password: "correct horse battery staple",
      callbackURL: "/console",
    });
    assert.equal(signup.response.status, 200);
    assert.match(signup.cookie, /nodezuno\.session_token=/);
    assert.match(signup.cookie, /HttpOnly/i);
    assert.match(signup.cookie, /SameSite=Lax/i);
    assert.doesNotMatch(signup.cookie, /;\s*Secure/i);

    const session = await auth.api.getSession({
      headers: new Headers({ cookie: requestCookie(signup.cookie) }),
    });
    assert.equal(session?.user.email, "runtime@example.com");
    assert.equal(session?.user.emailVerified, false);

    const reservedWalletEmail = await authRequest(auth, "/sign-up/email", {
      name: "Reserved Address",
      email: "known-address@sol.wallet.nodezuno.invalid",
      password: "correct horse battery staple",
      callbackURL: "/console",
    });
    assert.equal(reservedWalletEmail.response.status, 400);

    await persistSubmission({
      input: {
        kind: "support",
        name: "Runtime Tester",
        email: "runtime@example.com",
        company: "Runtime Labs",
        team: "Infrastructure / developer tools",
        message:
          "Please help us validate the account-bound request history.",
        consent: true,
        sourcePath: "/contact/support",
        website: "",
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
      },
      idempotencyKey: "auth-runtime-account-request-0001",
      requestHash: "f".repeat(64),
      ipHash: "a".repeat(64),
      userAgentHash: null,
      emailHash: "b".repeat(64),
      submittedByAccountId: session.user.id,
      submittedByEmail: session.user.email,
      now: 1_800_000_000_000,
      database,
    });
    assert.equal(
      (await listSubmissionsForAccount(session.user.id, database)).length,
      1,
    );
    assert.equal(
      (
        await listSubmissionsForAccount(
          "99999999-9999-4999-8999-999999999999",
          database,
        )
      ).length,
      0,
    );

    const wrongPassword = await authRequest(auth, "/sign-in/email", {
      email: "runtime@example.com",
      password: "this password is definitely wrong",
      callbackURL: "/console",
    });
    assert.equal(wrongPassword.response.status, 401);

    const evm = privateKeyToAccount(
      "0x59c6995e998f97a5a0044976f7ad3f3b66c4c35f06bd5f61e92dca5dcf9e85c5",
    );
    const evmNonce = await authRequest(auth, "/siwe/nonce", {});
    assert.equal(evmNonce.response.status, 200);
    assert.match(evmNonce.payload.nonce, /^[0-9a-f]{32}$/);
    const issuedAt = new Date();
    const evmMessage = createSiweMessage({
      address: evm.address,
      chainId: 1,
      domain: "localhost:3000",
      scheme: "http",
      nonce: evmNonce.payload.nonce,
      uri: localOrigin,
      version: "1",
      statement:
        "Sign in to Nodezuno. This request does not create a transaction or cost gas.",
      issuedAt,
      expirationTime: new Date(issuedAt.getTime() + 5 * 60 * 1000),
    });
    const evmSignature = await evm.signMessage({ message: evmMessage });
    const evmLogin = await authRequest(auth, "/siwe/verify", {
      message: evmMessage,
      signature: evmSignature,
    });
    assert.equal(evmLogin.response.status, 200);
    assert.equal(evmLogin.payload.user.walletAddress, evm.address);
    assert.match(evmLogin.cookie, /nodezuno\.session_token=/);

    const evmReplay = await authRequest(auth, "/siwe/verify", {
      message: evmMessage,
      signature: evmSignature,
    });
    assert.equal(evmReplay.response.status, 401);

    const solanaPrivateKey = Uint8Array.from(
      { length: 32 },
      (_, index) => index + 1,
    );
    const solanaPublicKey = ed25519.getPublicKey(solanaPrivateKey);
    const solanaAddress = bs58.encode(solanaPublicKey);
    const solanaNonce = await authRequest(auth, "/solana/nonce", {
      address: solanaAddress,
    });
    assert.equal(solanaNonce.response.status, 200);
    assert.equal(solanaNonce.payload.input.address, solanaAddress);
    const solanaMessage = createSignInMessage(solanaNonce.payload.input);
    const solanaSignature = ed25519.sign(
      solanaMessage,
      solanaPrivateKey,
    );
    const solanaLogin = await authRequest(auth, "/solana/verify", {
      address: solanaAddress,
      signedMessage: encodeBase64Url(solanaMessage),
      signature: encodeBase64Url(solanaSignature),
      signatureType: "ed25519",
    });
    assert.equal(solanaLogin.response.status, 200);
    assert.equal(solanaLogin.payload.user.walletAddress, solanaAddress);
    assert.match(solanaLogin.cookie, /nodezuno\.session_token=/);

    const syntheticEmail = await database
      .prepare(
        `SELECT email FROM auth_users
         WHERE id = ?`,
      )
      .bind(solanaLogin.payload.user.id)
      .first("email");
    assert.match(
      syntheticEmail,
      /^[0-9a-f]{48}@sol\.wallet\.nodezuno\.invalid$/,
    );

    const solanaReplay = await authRequest(auth, "/solana/verify", {
      address: solanaAddress,
      signedMessage: encodeBase64Url(solanaMessage),
      signature: encodeBase64Url(solanaSignature),
      signatureType: "ed25519",
    });
    assert.equal(solanaReplay.response.status, 401);

    for (const [id, slug] of [
      ["11111111-1111-4111-8111-111111111111", "runtime-one"],
      ["22222222-2222-4222-8222-222222222222", "runtime-two"],
    ]) {
      await database
        .prepare(
          `INSERT INTO developer_workspaces
            (id, slug, name, status, created_at, updated_at)
           VALUES (?, ?, ?, 'active', ?, ?)`,
        )
        .bind(id, slug, slug, Date.now(), Date.now())
        .run();
    }
    await database
      .prepare(
        `INSERT INTO developer_workspace_members
          (id, workspace_id, account_id, email, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'owner', ?, ?)`,
      )
      .bind(
        "33333333-3333-4333-8333-333333333333",
        "11111111-1111-4111-8111-111111111111",
        session.user.id,
        session.user.email,
        Date.now(),
        Date.now(),
      )
      .run();
    await assert.rejects(
      database
        .prepare(
          `INSERT INTO developer_workspace_members
            (id, workspace_id, account_id, email, role, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'owner', ?, ?)`,
        )
        .bind(
          "44444444-4444-4444-8444-444444444444",
          "22222222-2222-4222-8222-222222222222",
          session.user.id,
          session.user.email,
          Date.now(),
          Date.now(),
        )
        .run(),
      /UNIQUE constraint failed/,
    );

    const counts = await database
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM auth_users) AS users,
           (SELECT COUNT(*) FROM auth_sessions) AS sessions,
           (SELECT COUNT(*) FROM auth_wallet_addresses) AS evmWallets,
           (SELECT COUNT(*) FROM auth_solana_wallets) AS solanaWallets`,
      )
      .first();
    assert.deepEqual({ ...counts }, {
      users: 3,
      sessions: 3,
      evmWallets: 1,
      solanaWallets: 1,
    });
  } finally {
    for (const [name, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

async function authRequest(auth, pathname, body) {
  const response = await auth.handler(
    new Request(`${localOrigin}/api/auth${pathname}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: localOrigin,
        "x-nodezuno-client-ip": "203.0.113.10",
      },
      body: JSON.stringify(body),
    }),
  );
  let payload = null;
  try {
    payload = await response.clone().json();
  } catch {
    payload = null;
  }
  return {
    response,
    payload,
    cookie: response.headers.getSetCookie().join("; "),
  };
}

function requestCookie(setCookie) {
  return setCookie
    .split(/,\s*(?=[^;,]+=)/)
    .map((cookie) => cookie.split(";", 1)[0])
    .join("; ");
}

function encodeBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

async function createMigratedD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const migrationDirectory = path.resolve("drizzle");
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((file) => /^\d+.*\.sql$/.test(file))
    .sort();
  for (const file of migrationFiles) {
    const source = await readFile(path.join(migrationDirectory, file), "utf8");
    for (const statement of source.split("--> statement-breakpoint")) {
      const sql = statement.trim();
      if (sql) sqlite.exec(sql);
    }
  }
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  return new MemoryD1Database(sqlite);
}

class MemoryD1Database {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new MemoryD1Statement(this.database, sql);
  }

  async batch(statements) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) {
        results.push(await statement.run());
      }
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

class MemoryD1Statement {
  constructor(database, sql, bindings = []) {
    this.database = database;
    this.sql = sql;
    this.bindings = bindings;
  }

  bind(...bindings) {
    return new MemoryD1Statement(
      this.database,
      this.sql,
      bindings.map(normalizeBinding),
    );
  }

  async first(column) {
    const row =
      this.database.prepare(this.sql).get(...this.bindings) ?? null;
    if (typeof column === "string") return row?.[column] ?? null;
    return row;
  }

  async all() {
    const results = this.database
      .prepare(this.sql)
      .all(...this.bindings);
    return {
      success: true,
      results,
      meta: { changes: 0 },
    };
  }

  async raw() {
    const rows = this.database
      .prepare(this.sql)
      .all(...this.bindings);
    return rows.map((row) => Object.values(row));
  }

  async run() {
    if (
      /^\s*(SELECT|PRAGMA|WITH)\b/i.test(this.sql) ||
      /\bRETURNING\b/i.test(this.sql)
    ) {
      const results = this.database
        .prepare(this.sql)
        .all(...this.bindings);
      return {
        success: true,
        results,
        meta: { changes: results.length },
      };
    }
    const result = this.database
      .prepare(this.sql)
      .run(...this.bindings);
    return {
      success: true,
      results: [],
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
    };
  }
}

function normalizeBinding(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.getTime();
  if (value instanceof Uint8Array) return Buffer.from(value);
  return value;
}
