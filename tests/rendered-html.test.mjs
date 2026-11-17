import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getAllPagePaths } from "../lib/site-data.ts";
import { permanentPublicRedirectTarget } from "../lib/public-navigation.ts";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
const workerPromise = import(workerUrl.href).then((module) => module.default);

async function render(pathname = "/", options = {}) {
  const worker = await workerPromise;

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      method: options.method ?? "GET",
      headers: { accept: "text/html", ...options.headers },
      body: options.body,
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
      BETTER_AUTH_URL: "http://localhost",
      NODEZUNO_LOCAL_PREVIEW: "true",
      ...(options.env ?? {}),
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

function renderedText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replace(/\s+/g, " ")
    .trim();
}

test("server-renders the focused release review homepage", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  const text = renderedText(html);
  assert.match(text, /Your next upgrade\. Reviewed before release\./);
  assert.match(text, /Your last audit covered the previous version/);
  assert.match(text, /5 business days target for a ready standard EVM review/);
  assert.match(text, /\$\s*7,500\s*USD/);
  assert.match(text, /Proceed, Remediate, or Hold/);
  assert.match(text, /fixed price for every supported review/);
  assert.match(text, /No automatic payment verification is used/);
  assert.match(text, /Evidence you can inspect/);
  assert.doesNotMatch(text, /Public market evidence, not Nodezuno customer results/);
  assert.match(html, /href="\/review\/start"/);
  assert.match(html, /href="\/docs"/);
  assert.match(html, /href="\/faq"/);
  assert.match(html, /href="\/status"/);
  assert.doesNotMatch(
    html,
    /href="\/(?:products\/rpc-api|products\/chain-cloud|contact\/chain-launch|console|start)(?:[?"\/])/,
  );
  assert.equal(
    (html.match(/class="nav-trigger(?: is-active)? ?"/g) ?? []).length,
    2,
    "desktop navigation should render the two grouped resource and company menus",
  );
  assert.doesNotMatch(html, /<details class="nav-menu"/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Building your site/);
  assert.match(
    response.headers.get("content-security-policy") ?? "",
    /frame-ancestors 'none'/,
  );
  const contentSecurityPolicy =
    response.headers.get("content-security-policy") ?? "";
  const nonce = contentSecurityPolicy.match(/'nonce-([^']+)'/)?.[1];
  assert.ok(nonce, "CSP should include a per-request script nonce");
  assert.doesNotMatch(contentSecurityPolicy, /script-src[^;]*'unsafe-inline'/);
  const scriptTags = [...html.matchAll(/<script\b([^>]*)>/g)];
  assert.ok(scriptTags.length > 0, "homepage should include hydration scripts");
  for (const scriptTag of scriptTags) {
    assert.equal(
      scriptTag[1].includes(`nonce="${nonce}"`),
      true,
      "every hydration script should carry the response nonce",
    );
  }
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
});

test("pricing leads directly to a private service order and clear payment steps", async () => {
  const [pricingResponse, intakeResponse, companyContactResponse, salesResponse] =
    await Promise.all([
      render("/pricing"),
      render("/review/start"),
      render("/company/contact"),
      render("/contact/sales"),
    ]);

  for (const response of [pricingResponse, intakeResponse, companyContactResponse]) {
    assert.equal(response.status, 200);
  }
  assert.equal(salesResponse.status, 308);
  assert.equal(
    new URL(salesResponse.headers.get("location"), "http://localhost").pathname,
    "/review/start",
  );

  const [pricing, intake, companyContact] = await Promise.all([
    pricingResponse.text(),
    intakeResponse.text(),
    companyContactResponse.text(),
  ]);
  const pricingText = renderedText(pricing);
  const intakeText = renderedText(intake);

  assert.match(pricingText, /One release\. One clear price\./);
  assert.match(pricingText, /\$7,500/);
  assert.match(pricingText, /same fixed price for supported EVM and non-EVM releases/);
  assert.match(pricingText, /Findings, evidence, and a signed recommendation/);
  assert.match(pricingText, /No subscription, no recurring charges, and no sales call required/);
  assert.match(pricing, /href="\/review\/start"/);
  assert.match(pricingText, /Automatic payment verification is off/);

  assert.match(intakeText, /Let.s get your review underway/);
  assert.match(intakeText, /private order opens immediately, with no sales call required/i);
  assert.match(intakeText, /No funds move when you submit this form/i);
  assert.match(intakeText, /Continue to payment/);
  assert.match(intakeText, /USDC or USDT on Ethereum Mainnet/);
  assert.match(intakeText, /Do not submit private repositories, credentials, private RPC URLs, exploit material, keys, or production secrets/i);
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
    assert.match(intake, new RegExp(`name="${field}"`));
  }
  assert.match(companyContact, /Let.s talk/);
  assert.doesNotMatch(companyContact, /Put the exact change in scope/);
});

test("documentation, whitepaper, press kit, and legal policies publish real artifacts", async () => {
  const [
    docs,
    whitepaper,
    press,
    privacy,
    disclosure,
    status,
    openApi,
    sitemap,
    securityText,
    terms,
  ] =
    await Promise.all([
      render("/docs").then((response) => response.text()),
      render("/whitepaper").then((response) => response.text()),
      render("/company/press-kit").then((response) => response.text()),
      render("/legal/privacy").then((response) => response.text()),
      render("/security/responsible-disclosure").then((response) => response.text()),
      render("/status").then((response) => response.text()),
      render("/api/v1/openapi"),
      render("/sitemap.xml"),
      readFile(new URL("../public/.well-known/security.txt", import.meta.url), "utf8"),
      render("/legal/terms").then((response) => response.text()),
    ]);

  assert.match(docs, /EVM preparation guide\./);
  assert.match(docs, /ARTIFACT MANIFEST/);
  assert.match(docs, /Proceed, Remediate, or Hold/);
  assert.match(docs, /five-business-day/);
  assert.doesNotMatch(docs, /Chain Launch Control Plane|eth_blockNumber/);

  assert.match(whitepaper, /Technical whitepaper/);
  assert.match(whitepaper, /How we review an EVM smart contract upgrade/);
  assert.match(whitepaper, /AI can increase review breadth without receiving release authority/);
  assert.match(whitepaper, /Remove unrelated personal and customer data/);

  assert.match(press, /Approved media resources/);
  assert.match(press, /Opening review capacity/);
  assert.match(press, /Proceed, Remediate, or Hold/);
  assert.match(press, /href="\/nodezuno-wordmark\.svg"/);
  assert.match(press, /href="\/sanjay-sudagani-founder\.webp"/);
  assert.match(press, /Founder portrait preview/);
  assert.match(press, /APPROVED BOILERPLATE/);

  assert.match(privacy, /Website privacy summary/);
  assert.match(privacy, /Data collected/);
  assert.match(privacy, /Retention and deletion/);
  assert.match(privacy, /Counsel review required/);

  assert.match(disclosure, /Report a Nodezuno vulnerability safely/);
  assert.match(disclosure, /Do not send secrets in the first message/);
  assert.match(disclosure, /No public reward or legal safe harbor is currently offered/);

  assert.match(status, /manual Ethereum Mainnet payment intake/);
  assert.match(status, /Automatic payment verification is off in the Cloudflare Free deployment/);
  assert.match(status, /Status labels are maturity statements, not availability guarantees/);

  assert.match(terms, /Sanjay manually checks and records the scheduling payment/);
  assert.match(terms, /Automatic payment verification is off/);
  assert.doesNotMatch(terms, /verifies the scheduling deposit from finalized Ethereum evidence/);

  assert.equal(openApi.status, 200);
  const specification = await openApi.json();
  assert.equal(specification.openapi, "3.1.0");
  assert.ok(specification.paths["/api/v1/submissions"]);

  assert.match(securityText, /Canonical: https:\/\/nodezuno\.com\/\.well-known\/security\.txt/);

  assert.equal(sitemap.status, 200);
  assert.match(await sitemap.text(), /https:\/\/nodezuno\.com\/whitepaper/);
});

test("about page presents Sanjay and the release-review mission", async () => {
  const response = await render("/company/about");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /About me/);
  assert.match(html, /Sanjay Sudagani/);
  assert.match(html, /src="\/sanjay-sudagani-founder\.webp"/);
  assert.match(html, /alt="Sanjay Sudagani"/);
  assert.match(html, /Crypto feels like home/);
  assert.match(html, /Crypto since 2020/);
  assert.match(html, /I love crypto/);
  assert.match(html, /smart contract and protocol teams/);
  assert.doesNotMatch(html, /About us/i);
});

test("server-renders the complete product, method, and trust journey", async () => {
  const expectations = [
    ["/product", /Know what changes\. Know what could break\./],
    ["/methodology", /From your next release to a clear recommendation\./],
    ["/security", /Security at Nodezuno/],
    ["/faq", /Frequently asked questions\./],
    ["/resources/research", /No public study has been released yet/],
    ["/community/newsletter", /One careful field note for teams shipping onchain changes/],
    ["/company/investor-thesis", /The initial business sells one \$7,500 smart contract or protocol release review/],
  ];

  for (const [pathname, expected] of expectations) {
    const response = await render(pathname);
    assert.equal(response.status, 200, `${pathname} should render`);
    const html = await response.text();
    assert.match(renderedText(html), expected);
  }

  const product = await render("/product").then((response) => response.text());
  assert.match(product, /href="\/review\/start"/);
  assert.match(product, /Proceed, Remediate, or Hold/);
  assert.match(product, /cannot guarantee that every vulnerability will be found/);

  const research = await render("/resources/research").then((response) => response.text());
  assert.match(research, /No public Nodezuno research studies have been released yet/);

  const thesis = await render("/company/investor-thesis").then((response) => response.text());
  assert.match(thesis, /strategy hypothesis, not a forecast or investment solicitation/);
});

test("unknown routes return the branded not-found experience", async () => {
  const response = await render("/this-route-does-not-exist");
  assert.equal(response.status, 404);
  const html = await response.text();
  assert.match(html, /This path is outside the review scope/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("every canonical page renders and action routes expose bounded forms", async () => {
  const allRoutes = getAllPagePaths();
  const redirects = allRoutes
    .map((path) => ({ path, target: permanentPublicRedirectTarget(`/${path}`) }))
    .filter((route) => route.target);
  const routes = allRoutes.filter(
    (path) => !permanentPublicRedirectTarget(`/${path}`),
  );
  assert.equal(new Set(routes).size, routes.length);
  const responses = await Promise.all(
    routes.map((pathname) => render(`/${pathname}`)),
  );
  for (const [index, response] of responses.entries()) {
    assert.equal(response.status, 200, `/${routes[index]} should render`);
  }
  for (const { path, target } of redirects) {
    const response = await render(`/${path}`);
    assert.equal(response.status, 308, `/${path} should permanently redirect`);
    assert.equal(
      new URL(response.headers.get("location"), "http://localhost").href,
      new URL(target, "http://localhost").href,
    );
  }

  const [upgrade, generalContact, careers, disclosure, press] = await Promise.all([
    render("/review/start").then((response) => response.text()),
    render("/company/contact").then((response) => response.text()),
    render("/company/careers").then((response) => response.text()),
    render("/security/responsible-disclosure").then((response) => response.text()),
    render("/contact/press").then((response) => response.text()),
  ]);
  assert.match(upgrade, /Let.s get your review underway/);
  assert.match(upgrade, /name="consent"/);
  assert.match(generalContact, /Let.s talk/);
  assert.match(careers, /No role is currently posted/);
  assert.match(disclosure, /Open a secure disclosure conversation/);
  assert.match(disclosure, /Do not include exploit code, credentials, keys, or sensitive reproduction steps/);
  assert.match(press, /Send the briefing request/);
});

test("legacy console permanently redirects to the review account", async () => {
  const anonymous = await render("/console");
  assert.ok(anonymous.status >= 300 && anonymous.status < 400);
  assert.equal(
    new URL(anonymous.headers.get("location"), "http://localhost").pathname,
    "/account",
  );
});

test("every rendered internal link resolves and every page anchor exists", async () => {
  const routePaths = [
    "/",
    "/signup",
    "/login",
    "/forgot-password",
    "/identity-required",
    "/review/start",
    "/community/newsletter/confirm",
    "/community/newsletter/unsubscribe",
    ...getAllPagePaths()
      .filter((path) => !permanentPublicRedirectTarget(`/${path}`))
      .map((path) => `/${path}`),
  ];
  const htmlByPath = new Map();
  const internalTargets = new Set();

  for (const pathname of routePaths) {
    const response = await render(pathname);
    assert.equal(response.status, 200, `${pathname} should render`);
    const html = await response.text();
    htmlByPath.set(pathname, html);

    for (const match of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) {
      const href = match[1].replaceAll("&amp;", "&");
      if (
        href.startsWith("mailto:") ||
        href.startsWith("https://") ||
        href.startsWith("http://")
      ) {
        continue;
      }
      const target = new URL(href, `http://localhost${pathname}`);
      if (target.origin === "http://localhost") {
        internalTargets.add(
          `${target.pathname}${target.search}${target.hash}`,
        );
      }
    }
  }

  for (const target of internalTargets) {
    const url = new URL(target, "http://localhost");
    if (url.hash) {
      const targetHtml =
        htmlByPath.get(url.pathname) ??
        (await render(url.pathname).then((response) => response.text()));
      const fragment = decodeURIComponent(url.hash.slice(1));
      assert.match(
        targetHtml,
        new RegExp(
          `\\bid="${escapeRegularExpression(fragment)}"`,
        ),
        `${target} should point to a rendered element`,
      );
    }

    if (/\.(?:png|svg|webp|txt)$/i.test(url.pathname)) {
      const asset = await readFile(
        new URL(`../public${url.pathname}`, import.meta.url),
      );
      assert.ok(asset.byteLength > 0, `${url.pathname} should exist`);
      continue;
    }

    // The account route requires the Sites identity gateway. The local
    // backend smoke suite verifies it with a trusted identity header.
    if (url.pathname === "/account") continue;

    const response = await render(`${url.pathname}${url.search}`);
    assert.ok(
      response.status >= 200 && response.status < 400,
      `${target} should resolve successfully`,
    );
  }
});

test("metadata ignores hostile forwarded hosts", async () => {
  const response = await render("/", {
    headers: {
      host: "evil.example",
      "x-forwarded-host": "evil.example",
      "x-forwarded-proto": "javascript",
    },
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /https:\/\/nodezuno\.com\/og\.png/);
  assert.doesNotMatch(html, /evil\.example|javascript:/);
});

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("API guards and image optimizer fail safely", async () => {
  const [
    invalidSubmission,
    crossOrigin,
    invalidChallenge,
    externalImage,
    missingDb,
  ] =
    await Promise.all([
      render("/api/v1/submissions", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          origin: "http://localhost",
          "idempotency-key": "rendered-test-invalid-0001",
        },
        body: JSON.stringify({ kind: "sales" }),
      }),
      render("/api/v1/submissions", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          origin: "https://evil.example",
          "idempotency-key": "rendered-test-cross-origin",
        },
        body: JSON.stringify({}),
      }),
      render("/api/v1/abuse-challenge?purpose=invalid", {
        headers: { accept: "application/json" },
      }),
      render("/_vinext/image?url=https%3A%2F%2Fevil.example%2Fx.png&w=640&q=75"),
      render("/api/v1/health", {
        headers: { accept: "application/json" },
      }),
    ]);

  assert.equal(invalidSubmission.status, 403);
  assert.equal((await invalidSubmission.clone().json()).code, "challenge_required");
  assert.equal(crossOrigin.status, 403);
  assert.equal(invalidChallenge.status, 400);
  assert.equal(externalImage.status, 400);
  assert.equal(missingDb.status, 503);
  const unavailable = await missingDb.text();
  assert.doesNotMatch(
    unavailable,
    /\b(?:D1|SQL|stack|binding)\b/i,
  );
});
