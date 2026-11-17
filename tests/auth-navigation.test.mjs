import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  firstSearchParam,
  safeRelativeReturnPath,
} from "../lib/auth-paths.ts";

const identityRequiredUrl = new URL(
  "../app/identity-required/page.tsx",
  import.meta.url,
);
const accountUrl = new URL("../app/account/page.tsx", import.meta.url);
const loginUrl = new URL("../app/login/page.tsx", import.meta.url);
const signupUrl = new URL("../app/signup/page.tsx", import.meta.url);

test("auth routing accepts one safe local return destination", () => {
  assert.equal(firstSearchParam(undefined), undefined);
  assert.equal(firstSearchParam("/review/order-1"), "/review/order-1");
  assert.equal(
    firstSearchParam(["/review/order-1?tab=scope", "//evil.example"]),
    "/review/order-1?tab=scope",
  );
  assert.equal(
    safeRelativeReturnPath("/review/order-1?tab=scope#decision"),
    "/review/order-1?tab=scope#decision",
  );
  assert.equal(safeRelativeReturnPath("//evil.example/review"), "/");
});

test("auth entry pages default to account and preserve return_to", async () => {
  const [identityRequired, login, signup] = await Promise.all([
    readFile(identityRequiredUrl, "utf8"),
    readFile(loginUrl, "utf8"),
    readFile(signupUrl, "utf8"),
  ]);

  for (const source of [identityRequired, login, signup]) {
    assert.match(source, /firstSearchParam\(requestedReturnTo\) \?\? "\/account"/);
    assert.doesNotMatch(source, /\?\? "\/console"/);
  }
  assert.match(
    identityRequired,
    /`\/login\?return_to=\$\{encodeURIComponent\(returnTo\)\}`/,
  );
});

test("the account portal lists release review orders without legacy console links", async () => {
  const account = await readFile(accountUrl, "utf8");

  assert.match(account, /listReviewOrdersForAccount\(user\.accountId\)/);
  assert.match(account, /href=\{`\/review\/\$\{encodeURIComponent\(order\.id\)\}`\}/);
  assert.match(account, /Start a review/);
  assert.match(account, /Service orders, payments, and deliverables/);
  assert.doesNotMatch(account, /href="\/console"|Developer console|RPC/);
});
