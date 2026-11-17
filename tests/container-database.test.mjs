import assert from "node:assert/strict";
import test from "node:test";
import {
  createD1RestDatabase,
  normalizeD1RestQuery,
} from "../lib/server/d1-rest-database.ts";

const configuration = {
  accountId: "a".repeat(32),
  databaseId: "11111111-1111-4111-8111-111111111111",
  apiToken: "t".repeat(48),
};

test("D1 REST normalization preserves SQL literals and safely binds NULL", () => {
  assert.deepEqual(
    normalizeD1RestQuery(
      "INSERT INTO t(a, note, b, c) VALUES (?, '?', ?, ?) -- ?",
      [42, null, true],
    ),
    {
      sql: "INSERT INTO t(a, note, b, c) VALUES (?, '?', NULL, ?) -- ?",
      params: ["42", "1"],
    },
  );
  assert.throws(
    () => normalizeD1RestQuery("SELECT ?", []),
    /no bound value/,
  );
  assert.throws(
    () => normalizeD1RestQuery("SELECT 1", ["extra"]),
    /no placeholder/,
  );
});

test("D1 REST adapter implements first, all, run, and transactional batch", async () => {
  const requests = [];
  const fetcher = async (url, init) => {
    const body = JSON.parse(init.body);
    requests.push({ url: String(url), init, body });
    const queries = body.batch ?? [body];
    const result = queries.map((query, index) => ({
      success: true,
      results:
        query.sql.startsWith("SELECT")
          ? [{ id: index + 1, label: "ready" }]
          : [],
      meta: { changes: query.sql.startsWith("SELECT") ? 0 : 1 },
    }));
    return Response.json({ success: true, result });
  };
  const database = createD1RestDatabase(configuration, { fetcher });

  const first = await database
    .prepare("SELECT id, label FROM status_services WHERE slug = ?")
    .bind("rpc-mesh")
    .first();
  assert.deepEqual(first, { id: 1, label: "ready" });

  const label = await database
    .prepare("SELECT label FROM status_services")
    .first("label");
  assert.equal(label, "ready");

  const all = await database
    .prepare("SELECT id, label FROM status_services")
    .all();
  assert.deepEqual(all.results, [{ id: 1, label: "ready" }]);

  const run = await database
    .prepare("UPDATE status_services SET state = ? WHERE slug = ?")
    .bind("preview", "rpc-mesh")
    .run();
  assert.equal(run.meta.changes, 1);

  const batch = await database.batch([
    database.prepare("INSERT INTO t(a) VALUES (?)").bind(1),
    database.prepare("INSERT INTO t(a) VALUES (?)").bind(2),
  ]);
  assert.equal(batch.length, 2);
  assert.deepEqual(requests.at(-1).body, {
    batch: [
      { sql: "INSERT INTO t(a) VALUES (?)", params: ["1"] },
      { sql: "INSERT INTO t(a) VALUES (?)", params: ["2"] },
    ],
  });
  assert.match(
    requests[0].url,
    /api\.cloudflare\.com\/client\/v4\/accounts\/a{32}\/d1\/database\//,
  );
  assert.equal(
    requests[0].init.headers.Authorization,
    `Bearer ${configuration.apiToken}`,
  );
});

test("D1 REST adapter fails closed on an invalid provider response", async () => {
  const database = createD1RestDatabase(configuration, {
    fetcher: async () =>
      Response.json(
        {
          success: false,
          errors: [{ code: 7500, message: "do not expose this" }],
        },
        { status: 403 },
      ),
  });
  await assert.rejects(
    database.prepare("SELECT 1").first(),
    (error) =>
      /rejected the request/.test(error.message) &&
      !error.message.includes(configuration.apiToken) &&
      !error.message.includes("do not expose this"),
  );
});
