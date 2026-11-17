import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createNodezunoAuth } from "../lib/server/auth.ts";

const localOrigin = "http://localhost:3000";
const authSecret =
  "account-security-runtime-secret-with-more-than-32-characters";
const originalPassword = "correct horse battery staple";
const replacementPassword = "different horse battery staple";

test("account security endpoints manage real sessions and passwords", async () => {
  const database = await createMigratedD1();
  const previousEnvironment = {
    NODEZUNO_RUNTIME: process.env.NODEZUNO_RUNTIME,
    NODEZUNO_LOCAL_PREVIEW: process.env.NODEZUNO_LOCAL_PREVIEW,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    ZOHO_SMTP_PASSWORD: process.env.ZOHO_SMTP_PASSWORD,
    ZOHO_SMTP_HOST: process.env.ZOHO_SMTP_HOST,
  };

  try {
    process.env.NODEZUNO_RUNTIME = "container";
    process.env.NODEZUNO_LOCAL_PREVIEW = "true";
    process.env.BETTER_AUTH_SECRET = authSecret;
    process.env.BETTER_AUTH_URL = localOrigin;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.ZOHO_SMTP_PASSWORD;
    delete process.env.ZOHO_SMTP_HOST;

    const auth = await createNodezunoAuth(
      new Request(`${localOrigin}/api/auth/get-session`),
      database,
    );
    const first = await authRequest(auth, "/sign-up/email", {
      body: {
        callbackURL: "/account",
        email: "security@example.com",
        name: "Security Tester",
        password: originalPassword,
      },
      userAgent: "First browser",
    });
    assert.equal(first.response.status, 200);
    const firstCookie = requestCookie(first.cookie);

    const second = await authRequest(auth, "/sign-in/email", {
      body: {
        callbackURL: "/account",
        email: "security@example.com",
        password: originalPassword,
      },
      userAgent: "Second browser",
    });
    assert.equal(second.response.status, 200);
    const secondCookie = requestCookie(second.cookie);

    const current = await authRequest(auth, "/get-session", {
      cookie: secondCookie,
      method: "GET",
      userAgent: "Second browser",
    });
    assert.equal(current.response.status, 200);
    assert.equal(current.payload.user.email, "security@example.com");
    assert.equal(current.payload.session.userAgent, "Second browser");

    const listed = await authRequest(auth, "/list-sessions", {
      cookie: secondCookie,
      method: "GET",
      userAgent: "Second browser",
    });
    assert.equal(listed.response.status, 200);
    assert.equal(listed.payload.length, 2);
    assert.ok(
      listed.payload.some(
        (session) => session.id === current.payload.session.id,
      ),
    );
    const firstSession = listed.payload.find(
      (session) => session.id !== current.payload.session.id,
    );
    assert.ok(firstSession?.token);

    const revoked = await authRequest(auth, "/revoke-session", {
      body: { token: firstSession.token },
      cookie: secondCookie,
      userAgent: "Second browser",
    });
    assert.equal(revoked.response.status, 200);
    assert.deepEqual(revoked.payload, { status: true });
    assert.equal(
      (
        await authRequest(auth, "/get-session", {
          cookie: firstCookie,
          method: "GET",
          userAgent: "First browser",
        })
      ).payload,
      null,
    );

    const wrongPassword = await authRequest(auth, "/change-password", {
      body: {
        currentPassword: "a password that is not correct",
        newPassword: replacementPassword,
        revokeOtherSessions: true,
      },
      cookie: secondCookie,
      userAgent: "Second browser",
    });
    assert.equal(wrongPassword.response.status, 400);
    assert.equal(wrongPassword.payload.code, "INVALID_PASSWORD");

    const changed = await authRequest(auth, "/change-password", {
      body: {
        currentPassword: originalPassword,
        newPassword: replacementPassword,
        revokeOtherSessions: true,
      },
      cookie: secondCookie,
      userAgent: "Second browser",
    });
    assert.equal(changed.response.status, 200);
    assert.equal(typeof changed.payload.token, "string");
    assert.match(changed.cookie, /nodezuno\.session_token=/);
    const changedCookie = requestCookie(changed.cookie);
    assert.equal(
      (
        await authRequest(auth, "/get-session", {
          cookie: secondCookie,
          method: "GET",
          userAgent: "Second browser",
        })
      ).payload,
      null,
    );
    assert.equal(
      (
        await authRequest(auth, "/list-sessions", {
          cookie: changedCookie,
          method: "GET",
          userAgent: "Second browser",
        })
      ).payload.length,
      1,
    );

    const oldPasswordLogin = await authRequest(auth, "/sign-in/email", {
      body: {
        callbackURL: "/account",
        email: "security@example.com",
        password: originalPassword,
      },
      userAgent: "Third browser",
    });
    assert.equal(oldPasswordLogin.response.status, 401);

    const third = await authRequest(auth, "/sign-in/email", {
      body: {
        callbackURL: "/account",
        email: "security@example.com",
        password: replacementPassword,
      },
      userAgent: "Third browser",
    });
    assert.equal(third.response.status, 200);
    const thirdCookie = requestCookie(third.cookie);

    const revokedOthers = await authRequest(
      auth,
      "/revoke-other-sessions",
      {
        body: {},
        cookie: changedCookie,
        userAgent: "Second browser",
      },
    );
    assert.equal(revokedOthers.response.status, 200);
    assert.deepEqual(revokedOthers.payload, { status: true });
    assert.equal(
      (
        await authRequest(auth, "/get-session", {
          cookie: thirdCookie,
          method: "GET",
          userAgent: "Third browser",
        })
      ).payload,
      null,
    );
    assert.notEqual(
      (
        await authRequest(auth, "/get-session", {
          cookie: changedCookie,
          method: "GET",
          userAgent: "Second browser",
        })
      ).payload,
      null,
    );

    const finalSession = await authRequest(auth, "/sign-in/email", {
      body: {
        callbackURL: "/account",
        email: "security@example.com",
        password: replacementPassword,
      },
      userAgent: "Final browser",
    });
    assert.equal(finalSession.response.status, 200);
    const finalCookie = requestCookie(finalSession.cookie);
    const revokedEverywhere = await authRequest(auth, "/revoke-sessions", {
      body: {},
      cookie: finalCookie,
      userAgent: "Final browser",
    });
    assert.equal(revokedEverywhere.response.status, 200);
    assert.deepEqual(revokedEverywhere.payload, { status: true });

    const clearedCookie = await authRequest(auth, "/sign-out", {
      body: {},
      cookie: finalCookie,
      userAgent: "Final browser",
    });
    assert.equal(clearedCookie.response.status, 200);
    assert.equal(clearedCookie.payload.success, true);
    assert.match(clearedCookie.cookie, /nodezuno\.session_token=/);
    assert.match(clearedCookie.cookie, /Max-Age=0/i);
    for (const cookie of [changedCookie, finalCookie]) {
      assert.equal(
        (
          await authRequest(auth, "/get-session", {
            cookie,
            method: "GET",
            userAgent: "Final browser",
          })
        ).payload,
        null,
      );
    }
  } finally {
    for (const [name, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

async function authRequest(
  auth,
  pathname,
  {
    body,
    cookie,
    method = "POST",
    userAgent = "Nodezuno security test",
  },
) {
  const headers = new Headers({
    Accept: "application/json",
    "cf-connecting-ip": "203.0.113.12",
    Origin: localOrigin,
    "User-Agent": userAgent,
  });
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (cookie) headers.set("Cookie", cookie);
  const response = await auth.handler(
    new Request(`${localOrigin}/api/auth${pathname}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
      method,
    }),
  );
  let payload = null;
  try {
    payload = await response.clone().json();
  } catch {
    payload = null;
  }
  return {
    cookie: response.headers.getSetCookie().join("; "),
    payload,
    response,
  };
}

function requestCookie(setCookie) {
  return setCookie
    .split(/,\s*(?=[^;,]+=)/)
    .map((cookie) => cookie.split(";", 1)[0])
    .join("; ");
}

async function createMigratedD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const migrationDirectory = path.resolve("drizzle");
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((file) => /^\d+.*\.sql$/.test(file))
    .sort();
  for (const file of migrationFiles) {
    const source = await readFile(
      path.join(migrationDirectory, file),
      "utf8",
    );
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
    const results = this.database.prepare(this.sql).all(...this.bindings);
    return {
      meta: { changes: 0 },
      results,
      success: true,
    };
  }

  async raw() {
    const rows = this.database.prepare(this.sql).all(...this.bindings);
    return rows.map((row) => Object.values(row));
  }

  async run() {
    if (
      /^\s*(SELECT|PRAGMA|WITH)\b/i.test(this.sql) ||
      /\bRETURNING\b/i.test(this.sql)
    ) {
      const results = this.database.prepare(this.sql).all(...this.bindings);
      return {
        meta: { changes: results.length },
        results,
        success: true,
      };
    }
    const result = this.database.prepare(this.sql).run(...this.bindings);
    return {
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
      results: [],
      success: true,
    };
  }
}

function normalizeBinding(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.getTime();
  if (value instanceof Uint8Array) return Buffer.from(value);
  return value;
}
