import assert from "node:assert/strict";
import test from "node:test";
import robots from "../app/robots.ts";
import sitemap from "../app/sitemap.ts";
import { getAllPagePaths } from "../lib/site-data.ts";
import { permanentPublicRedirectTarget } from "../lib/public-navigation.ts";

test("private previews block crawling and public launches protect private routes", () => {
  const previous = process.env.NODEZUNO_PUBLIC_INDEXING;
  const previousLegalApproval = process.env.NODEZUNO_LEGAL_LAUNCH_APPROVED;
  try {
    delete process.env.NODEZUNO_PUBLIC_INDEXING;
    delete process.env.NODEZUNO_LEGAL_LAUNCH_APPROVED;
    assert.deepEqual(robots(), {
      rules: { userAgent: "*", disallow: "/" },
    });

    process.env.NODEZUNO_PUBLIC_INDEXING = "true";
    assert.deepEqual(robots(), {
      rules: { userAgent: "*", disallow: "/" },
    });

    process.env.NODEZUNO_LEGAL_LAUNCH_APPROVED = "true";
    const publicRules = robots();
    assert.equal(publicRules.sitemap, "https://nodezuno.com/sitemap.xml");
    assert.equal(publicRules.host, "https://nodezuno.com");
    assert.ok(publicRules.rules.disallow.includes("/api"));
    assert.ok(publicRules.rules.disallow.includes("/console"));
    assert.ok(publicRules.rules.disallow.includes("/account"));
    assert.ok(
      publicRules.rules.disallow.includes("/community/newsletter/confirm"),
    );
    assert.ok(
      publicRules.rules.disallow.includes("/community/newsletter/unsubscribe"),
    );
  } finally {
    if (previous === undefined) delete process.env.NODEZUNO_PUBLIC_INDEXING;
    else process.env.NODEZUNO_PUBLIC_INDEXING = previous;
    if (previousLegalApproval === undefined) {
      delete process.env.NODEZUNO_LEGAL_LAUNCH_APPROVED;
    } else {
      process.env.NODEZUNO_LEGAL_LAUNCH_APPROVED = previousLegalApproval;
    }
  }
});

test("sitemap contains each canonical public content page once", () => {
  const entries = sitemap();
  const urls = entries.map((entry) => entry.url);
  const canonicalPaths = getAllPagePaths().filter(
    (path) => !permanentPublicRedirectTarget(path),
  );

  assert.equal(urls[0], "https://nodezuno.com/");
  assert.deepEqual(
    urls.slice(1).sort(),
    canonicalPaths.map((path) => `https://nodezuno.com/${path}`).sort(),
  );
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(urls.some((url) => url.includes("/admin")), false);
  assert.equal(urls.some((url) => url.includes("/console")), false);
  assert.equal(urls.some((url) => url.includes("/products/rpc-api")), false);
  assert.equal(urls.some((url) => url.includes("/contact/chain-launch")), false);
  assert.equal(
    urls.some((url) => url.includes("/contact/upgrade-assurance")),
    false,
  );
  assert.equal(urls.some((url) => url.includes("/review/start")), false);
  assert.equal(urls.some((url) => url.includes("/contact/sales")), false);
});
