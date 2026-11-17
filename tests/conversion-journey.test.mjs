import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  auth: new URL("../components/auth-experience.tsx", import.meta.url),
  authStyles: new URL("../components/auth-experience.module.css", import.meta.url),
  detail: new URL("../components/detail-page.tsx", import.meta.url),
  header: new URL("../components/site-header.tsx", import.meta.url),
  home: new URL("../components/home-page.tsx", import.meta.url),
  login: new URL("../app/login/page.tsx", import.meta.url),
  reviewOrder: new URL("../components/review-order-experience.tsx", import.meta.url),
  reviewStart: new URL("../components/review-start-experience.tsx", import.meta.url),
  reviewRequest: new URL("../lib/client/review-order-request.ts", import.meta.url),
  signup: new URL("../app/signup/page.tsx", import.meta.url),
  siteData: new URL("../lib/site-data.ts", import.meta.url),
  styles: new URL("../app/globals.css", import.meta.url),
};

test("public conversion explains the focused Upgrade Assurance offer honestly", async () => {
  const [home, detail, header, siteData] =
    await Promise.all([
      readFile(files.home, "utf8"),
      readFile(files.detail, "utf8"),
      readFile(files.header, "utf8"),
      readFile(files.siteData, "utf8"),
    ]);

  assert.equal((home.match(/href="\/review\/start"/g) ?? []).length, 2);
  assert.match(home, /Your next upgrade\./);
  assert.match(home, /Every supported release review has the same/);
  assert.match(home, /USDC or USDT on Ethereum Mainnet/);
  assert.match(home, /Sanjay checks payment manually/);
  assert.match(home, /No automatic payment verification is used/);
  assert.match(home, /targets five business days[\s\S]+manually checked/);
  assert.match(home, /Proceed, Remediate, or Hold/);
  assert.match(home, /<strong>\{reviewPriceLabels\.total\}<\/strong>/);
  assert.doesNotMatch(
    home,
    /href="\/(?:console|start|products\/rpc-api|contact\/chain-launch)/,
  );

  assert.match(detail, /page\.path === "product"/);
  assert.match(detail, /page\.path === "pricing"/);
  assert.match(siteData, /path: "company\/contact"/);
  assert.match(siteData, /path: "contact\/press"/);
  assert.match(siteData, /submits the transaction hash and Telegram username/);
  assert.match(siteData, /reviewPriceLabels\.total/);

  assert.match(header, /directNavigation/);
  assert.doesNotMatch(header, /review\/start/);
  assert.doesNotMatch(header, /href="\/(?:console|start)"/);
  assert.match(siteData, /label: "Resources"/);
  assert.match(siteData, /label: "Company"/);
  assert.match(siteData, /path: "product"/);
  assert.match(siteData, /path: "methodology"/);
  assert.match(siteData, /path: "pricing"/);
  assert.match(siteData, /href: "\/review\/start"/);
  assert.match(siteData, /path: "company\/investor-thesis"/);
  assert.match(siteData, /has not published customer results/);
});

test("buyer journey creates a direct order and explains manual payment handling", async () => {
  const [start, portal, styles, request] = await Promise.all([
    readFile(files.reviewStart, "utf8"),
    readFile(files.reviewOrder, "utf8"),
    readFile(files.styles, "utf8"),
    readFile(files.reviewRequest, "utf8"),
  ]);

  assert.match(start, /private order opens immediately, with no sales call/);
  assert.match(start, /No funds move when you submit this form/);
  assert.match(start, /Continue to payment/);
  assert.match(start, /postReviewRequest\("\/api\/v1\/review-orders"/);
  assert.match(start, /window\.location\.assign\(trackingDestination\(order\)\)/);
  assert.match(request, /#access=/);
  for (const field of [
    "contactName",
    "workEmail",
    "company",
    "teamType",
    "targetChain",
    "auditedBaseline",
    "proposedRelease",
    "changeSummary",
    "affectedContracts",
    "consent",
  ]) {
    assert.match(start, new RegExp(`name="${field}"`));
  }
  assert.doesNotMatch(start, /accessToken.*searchParams|\?access/);

  assert.match(portal, /\/access`/);
  assert.match(portal, /JSON\.stringify\(\{ accessToken: token \}\)/);
  assert.match(portal, /window\.history\.replaceState/);
  assert.doesNotMatch(portal, /Authorization.*accessToken|\?access/);
  assert.match(portal, /acceptTerms: true/);
  assert.match(portal, /proposalVersion: order\?\.proposal\?\.version/);
  assert.match(portal, /paymentExperience === "manual_ethereum"/);
  assert.match(portal, /Accept terms and view payment instructions/);
  assert.match(portal, /body\.data\?\.payment\?\.intent/);
  assert.match(portal, /transactionHash/);
  assert.match(portal, /telegramUsername/);
  assert.match(portal, /checked manually/);
  assert.match(portal, /Payment checked manually/);
  assert.match(portal, /Do not send another payment/);
  assert.match(portal, /qualification_pending/);
  assert.match(portal, /deposit_pending/);
  assert.match(portal, /order\.status === "proposal_ready"/);
  assert.match(portal, /order\.status === "deposit_pending"/);
  assert.match(portal, /order\.status === "balance_due"/);

  assert.match(styles, /\.review-start-shell/);
  assert.match(styles, /\.review-portal-shell/);
  assert.match(styles, /@media \(max-width: 620px\)[\s\S]+?\.review-form-grid/);

  for (const source of [start, portal, styles, request]) {
    assert.doesNotMatch(source, /\u2014/);
  }
});

test("authentication is recoverable, accessible, and keeps optional providers optional", async () => {
  const [auth, signup, login, styles] = await Promise.all([
    readFile(files.auth, "utf8"),
    readFile(files.signup, "utf8"),
    readFile(files.login, "utf8"),
    readFile(files.authStyles, "utf8"),
  ]);

  assert.match(auth, /providers\.google \? \(/);
  assert.match(auth, /Continue with a wallet/);
  assert.match(auth, /Email works without a wallet/);
  assert.match(auth, /aria-expanded=\{walletPanel\}/);
  assert.match(auth, /event\.key === "Escape"/);
  assert.match(auth, /walletToggleRef\.current\?\.focus/);
  assert.match(auth, /errorRef\.current\?\.focus/);
  assert.match(auth, /tabIndex=\{-1\}/);
  assert.match(auth, /aria-busy=\{isSubmitting\}/);
  assert.match(auth, /aria-live="polite"/);
  assert.match(auth, /aria-describedby="auth-password-help"/);
  assert.match(auth, /12 to 128 characters/);
  assert.match(auth, /Email address/);
  assert.match(auth, /never sends a transaction/);
  assert.match(auth, /reports released to your account/i);
  assert.match(auth, /new AbortController\(\)/);
  assert.match(auth, /20_000/);
  assert.match(auth, /Authentication timed out/);
  assert.match(auth, /Nodezuno could not be reached/);
  assert.match(auth, /callbackURL: returnTo/);
  assert.doesNotMatch(auth, /localStorage|sessionStorage/);
  assert.match(signup, /AuthExperience/);
  assert.match(login, /AuthExperience/);

  assert.match(styles, /\.card :global\(\.auth-provider-button\)/);
  assert.match(styles, /\.card :global\(\.auth-provider-help\)/);
  assert.match(styles, /\.card :global\(\.auth-field-help\)/);
  assert.match(styles, /\.card :global\(\.auth-email-form input\)[\s\S]+?font-size: 1rem/);
  assert.match(styles, /\.page :where\(a, button, input\):focus-visible/);

  for (const source of [auth, signup, login, styles]) {
    assert.doesNotMatch(source, /\u2014/);
  }
});
