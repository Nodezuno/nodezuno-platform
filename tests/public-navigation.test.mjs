import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  permanentPublicRedirects,
  permanentPublicRedirectTarget,
  withSearchParams,
} from "../lib/public-navigation.ts";

const catchAllUrl = new URL("../app/[...slug]/page.tsx", import.meta.url);
const consoleUrl = new URL("../app/console/page.tsx", import.meta.url);
const startUrl = new URL("../app/start/page.tsx", import.meta.url);

test("legacy public routes have one permanent canonical destination", () => {
  assert.deepEqual(
    {
      chainLaunch: permanentPublicRedirects["contact/chain-launch"],
      communityStartup: permanentPublicRedirects["community/startup-program"],
      console: permanentPublicRedirects.console,
      developerDocs: permanentPublicRedirects["developers/docs"],
      developerStatus: permanentPublicRedirects["developers/status"],
      legacyIntake: permanentPublicRedirects["contact/upgrade-assurance"],
      start: permanentPublicRedirects.start,
    },
    {
      chainLaunch: "/review/start",
      communityStartup: "/review/start",
      console: "/account",
      developerDocs: "/docs",
      developerStatus: "/status",
      legacyIntake: "/review/start",
      start: "/review/start",
    },
  );
  assert.equal(permanentPublicRedirectTarget("/developers/docs/"), "/docs");
  assert.equal(permanentPublicRedirectTarget("/products/rpc-api"), "/product");
  assert.equal(permanentPublicRedirectTarget("/community/newsletter"), undefined);
  assert.equal(permanentPublicRedirectTarget("/product"), undefined);
});

test("permanent redirects preserve every supplied query value", () => {
  assert.equal(withSearchParams("/review/start", {}), "/review/start");
  assert.equal(
    withSearchParams("/review/start", {
      campaign: "founding five",
      ref: ["partner/a", "email"],
      omitted: undefined,
    }),
    "/review/start?campaign=founding+five&ref=partner%2Fa&ref=email",
  );
});

test("catch-all, start, and console routes use permanent redirects", async () => {
  const [catchAll, consolePage, startPage] = await Promise.all([
    readFile(catchAllUrl, "utf8"),
    readFile(consoleUrl, "utf8"),
    readFile(startUrl, "utf8"),
  ]);

  assert.match(catchAll, /permanentRedirect\(withSearchParams\(permanentTarget, query\)\)/);
  assert.match(consolePage, /permanentRedirect\(withSearchParams\("\/account", values\)\)/);
  assert.match(startPage, /permanentRedirect\(withSearchParams\("\/review\/start", values\)\)/);
  assert.doesNotMatch(`${catchAll}\n${consolePage}\n${startPage}`, /\bredirect\(/);
});
