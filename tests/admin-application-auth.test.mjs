import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { requireAdminRequest } from "../lib/server/admin.ts";
import { createNodezunoAuth } from "../lib/server/auth.ts";
import { closeSqliteDatabase } from "../lib/server/sqlite-database.ts";
import { migrateSqlite } from "../scripts/migrate-sqlite.mjs";

const localOrigin = "http://localhost:3000";
const managedEnvironment = [
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "CF_ACCESS_AUDIENCE",
  "CF_ACCESS_TEAM_DOMAIN",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "NODEZUNO_ADMIN_EMAILS",
  "NODEZUNO_DATABASE_DRIVER",
  "NODEZUNO_LOCAL_PREVIEW",
  "NODEZUNO_RUNTIME",
  "NODEZUNO_SQLITE_PATH",
  "ZOHO_SMTP_HOST",
  "ZOHO_SMTP_PASSWORD",
];

test("portable administrator access accepts only allowlisted application accounts", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "nodezuno-admin-auth-"),
  );
  const pathname = path.join(directory, "nodezuno.sqlite");
  const previous = Object.fromEntries(
    managedEnvironment.map((name) => [name, process.env[name]]),
  );

  try {
    process.env.NODEZUNO_RUNTIME = "container";
    process.env.NODEZUNO_LOCAL_PREVIEW = "true";
    process.env.NODEZUNO_DATABASE_DRIVER = "sqlite";
    process.env.NODEZUNO_SQLITE_PATH = pathname;
    process.env.BETTER_AUTH_URL = localOrigin;
    process.env.BETTER_AUTH_SECRET =
      "portable-admin-auth-secret-with-more-than-32-characters";
    process.env.NODEZUNO_ADMIN_EMAILS = "info@nodezuno.com";
    for (const name of [
      "ZOHO_SMTP_HOST",
      "ZOHO_SMTP_PASSWORD",
      "CF_ACCESS_AUDIENCE",
      "CF_ACCESS_TEAM_DOMAIN",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
    ]) {
      delete process.env[name];
    }

    await migrateSqlite({ pathname });
    const auth = await createNodezunoAuth(
      new Request(`${localOrigin}/api/auth/sign-up/email`),
    );
    const administratorCookie = await signUp(
      auth,
      "info@nodezuno.com",
      "Portable Operator",
    );
    const ordinaryCookie = await signUp(
      auth,
      "builder@example.com",
      "Ordinary Builder",
    );

    assert.deepEqual(
      await requireAdminRequest(
        applicationRequest(administratorCookie),
      ),
      { email: "info@nodezuno.com" },
    );
    await assert.rejects(
      requireAdminRequest(applicationRequest(ordinaryCookie)),
      (error) =>
        error?.status === 403 &&
        error?.code === "admin_access_denied",
    );
    await assert.rejects(
      requireAdminRequest(
        new Request(`${localOrigin}/api/v1/admin/submissions`, {
          headers: {
            "oai-authenticated-user-email":
              "info@nodezuno.com",
          },
        }),
      ),
      (error) =>
        error?.status === 401 &&
        error?.code === "authentication_required",
    );
  } finally {
    closeSqliteDatabase(pathname);
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(directory, { force: true, recursive: true });
  }
});

async function signUp(auth, email, name) {
  const response = await auth.handler(
    new Request(`${localOrigin}/api/auth/sign-up/email`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: localOrigin,
        "x-nodezuno-client-ip": "203.0.113.20",
      },
      body: JSON.stringify({
        callbackURL: "/admin",
        email,
        name,
        password: "correct horse battery staple",
      }),
    }),
  );
  assert.equal(response.status, 200);
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";", 1)[0])
    .join("; ");
}

function applicationRequest(cookie) {
  return new Request(`${localOrigin}/api/v1/admin/submissions`, {
    headers: { Cookie: cookie },
  });
}
