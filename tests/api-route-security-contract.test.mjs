import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import {
  apiJson,
  apiRedirect,
  HttpProblem,
  problemResponse,
  readJsonBody,
  requestHasMediaType,
  requestIdFor,
  responseFromError,
} from "../lib/server/http.ts";

const routeRoot = new URL("../app/api/v1/", import.meta.url);
const routesOwnedByIndependentSecurityWaves = new Set([
  "account/export",
]);

function contract(methods, auth, options = {}) {
  return {
    methods,
    auth,
    body: options.body ?? false,
    direct: options.direct ?? false,
    errors: options.errors ?? true,
    origin: options.origin ?? "none",
    requestId: options.requestId ?? "per-handler",
  };
}

const routeContracts = new Map(
  Object.entries({
    "abuse-challenge": contract(["GET"], "public"),
    "admin/chains/[slug]": contract(["PATCH"], "admin", {
      body: true,
      origin: "required",
    }),
    "admin/maintenance": contract(["POST"], "admin", {
      origin: "required",
    }),
    "admin/node-attachments": contract(["GET"], "admin"),
    "admin/review-orders": contract(["GET"], "admin"),
    "admin/review-orders/[id]": contract(["PATCH"], "admin", {
      body: "json",
      origin: "required",
    }),
    "admin/review-orders/[id]/deliverables": contract(["POST"], "admin", {
      body: "json",
      origin: "required",
    }),
    "admin/review-orders/[id]/deliverables/[deliverableId]/finalize": contract(
      ["POST"],
      "admin",
      { origin: "required" },
    ),
    "admin/review-orders/[id]/deliverables/[deliverableId]/upload": contract(
      ["PUT"],
      "admin",
      { origin: "required" },
    ),
    "admin/review-orders/[id]/payment-reconciliations/[claimId]": contract(
      ["POST"],
      "admin",
      { body: "json", origin: "required" },
    ),
    "admin/status/services/[slug]": contract(["PATCH"], "admin", {
      body: true,
      origin: "required",
    }),
    "admin/submissions": contract(["GET"], "admin"),
    "admin/submissions/[id]": contract(["PATCH"], "admin", {
      body: true,
      origin: "required",
    }),
    "auth/providers": contract(["GET"], "public"),
    "auth/session": contract(["GET"], "public"),
    chains: contract(["GET"], "public"),
    "control-plane/api-keys": contract(
      ["GET", "POST"],
      "management-key",
      {
        body: true,
        origin: "forbidden",
      },
    ),
    "control-plane/api-keys/[id]": contract(
      ["DELETE"],
      "management-key",
      { origin: "forbidden" },
    ),
    "control-plane/api-keys/[id]/rotate": contract(
      ["POST"],
      "management-key",
      {
        body: true,
        origin: "forbidden",
      },
    ),
    "control-plane/services": contract(
      ["GET", "POST"],
      "management-key",
      {
        body: true,
        origin: "forbidden",
      },
    ),
    "control-plane/services/[id]": contract(
      ["GET", "PATCH", "DELETE"],
      "management-key",
      {
        body: true,
        origin: "forbidden",
      },
    ),
    "control-plane/services/[id]/rpc-access-policy": contract(
      ["GET", "PUT"],
      "management-key",
      {
        body: true,
        origin: "forbidden",
      },
    ),
    "control-plane/services/[id]/quota-guardrail": contract(
      ["GET", "PUT"],
      "management-key",
      {
        body: true,
        origin: "forbidden",
      },
    ),
    "control-plane/services/[id]/usage": contract(
      ["GET"],
      "management-key",
      { origin: "forbidden" },
    ),
    "developer/api-keys": contract(
      ["GET", "POST"],
      "browser-session",
      {
        body: true,
        origin: "required",
      },
    ),
    "developer/api-keys/[id]": contract(
      ["DELETE"],
      "browser-session",
      { origin: "required" },
    ),
    "developer/api-keys/[id]/rotate": contract(
      ["POST"],
      "browser-session",
      {
        body: true,
        origin: "required",
      },
    ),
    "developer/services": contract(
      ["GET", "POST"],
      "browser-session",
      {
        body: true,
        origin: "required",
      },
    ),
    "developer/services/[id]": contract(
      ["GET", "PATCH", "DELETE"],
      "browser-session",
      {
        body: true,
        origin: "required",
      },
    ),
    "developer/services/[id]/rpc-access-policy": contract(
      ["GET", "PUT"],
      "browser-session",
      {
        body: true,
        origin: "required",
      },
    ),
    "developer/services/[id]/quota-guardrail": contract(
      ["GET", "PUT"],
      "browser-session",
      {
        body: true,
        origin: "required",
      },
    ),
    "developer/services/[id]/usage": contract(
      ["GET"],
      "browser-session",
    ),
    "developer/services/[id]/ai-diagnosis": contract(
      ["GET"],
      "browser-session",
    ),
    "developer/workspace": contract(
      ["GET", "POST"],
      "browser-session",
      {
        body: true,
        origin: "required",
      },
    ),
    "developer/workspace/audit-events": contract(
      ["GET"],
      "browser-session",
    ),
    "developer/workspace/members": contract(
      ["GET", "POST"],
      "browser-session",
      {
        body: true,
        origin: "required",
      },
    ),
    "developer/workspace/members/[id]": contract(
      ["PUT", "DELETE"],
      "browser-session",
      {
        body: true,
        origin: "required",
      },
    ),
    "gas-estimate": contract(["POST"], "public", {
      body: true,
      origin: "required",
    }),
    health: contract(["GET"], "public"),
    "internal/grpc/authorize": contract(["POST"], "internal-secret", {
      body: true,
      origin: "forbidden",
    }),
    live: contract(["GET"], "public", { errors: false }),
    "newsletter/subscriptions": contract(["POST"], "public", {
      body: true,
      origin: "required",
    }),
    "newsletter/confirm": contract(["POST"], "public", {
      body: true,
      origin: "required",
    }),
    "newsletter/unsubscribe": contract(["POST"], "public", {
      body: true,
      origin: "required",
    }),
    openapi: contract(["GET"], "public", {
      direct: true,
      errors: false,
    }),
    "platform/whoami": contract(["GET"], "platform-key"),
    ready: contract(["GET"], "public", { errors: false }),
    "review-orders": contract(["POST"], "public", {
      body: "json",
      origin: "required",
      requestId: "observed",
    }),
    "review-orders/[id]": contract(["GET"], "review-capability", {
      requestId: "observed",
    }),
    "review-orders/[id]/access": contract(["POST"], "public", {
      body: "json",
      origin: "required",
      requestId: "observed",
    }),
    "review-orders/[id]/deliverables/[deliverableId]/download": contract(
      ["GET"],
      "review-capability",
      { requestId: "observed" },
    ),
    "review-orders/[id]/payment-intents": contract(
      ["POST"],
      "review-capability",
      {
        body: "json",
        origin: "required",
        requestId: "observed",
      },
    ),
    "review-orders/[id]/payment-intents/[intentId]/claims": contract(
      ["POST"],
      "review-capability",
      {
        body: "json",
        origin: "required",
        requestId: "observed",
      },
    ),
    "review-orders/[id]/payment-confirmations/[confirmationId]": contract(
      ["GET"],
      "review-capability",
      { direct: true, requestId: "observed" },
    ),
    "rpc/[serviceId]": contract(
      ["OPTIONS", "POST"],
      "rpc-key",
      {
        body: true,
        direct: true,
        origin: "forbidden",
      },
    ),
    status: contract(["GET"], "public"),
    submissions: contract(["POST"], "public", {
      body: true,
      origin: "required",
    }),
  }),
);

const authenticationPatterns = {
  admin: /\brequire(?:Fresh)?AdminRequest\(request\)/,
  "browser-session": /\brequireDeveloperIdentity\(request\)/,
  "internal-secret": /\brequireGrpcControlPlaneSecret\(request\)/,
  "management-key": /\brequireDeveloperApiKeyScope\(/,
  "platform-key":
    /\breadDeveloperApiKey\(request\)[\s\S]*\bauthenticateDeveloperApiKey\(/,
  "review-capability":
    /\b(?:authorizeReviewOrder|createStablecoinPaymentIntent|submitStablecoinPaymentClaim)\(/,
  "rpc-key":
    /\breadDeveloperApiKey\(request\)[\s\S]*\bauthenticateDeveloperApiKey\(/,
};

async function routeSource(pathname) {
  return readFile(
    new URL(`../app/api/v1/${pathname}/route.ts`, import.meta.url),
    "utf8",
  );
}

async function discoverRoutes(directory = routeRoot, prefix = "") {
  const routes = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      routes.push(
        ...(await discoverRoutes(
          new URL(`${entry.name}/`, directory),
          `${prefix}${entry.name}/`,
        )),
      );
    } else if (entry.isFile() && entry.name === "route.ts") {
      routes.push(prefix.slice(0, -1));
    }
  }
  return routes;
}

test("the audited v1 route inventory stays complete", async () => {
  const discovered = (await discoverRoutes())
    .filter(
      (pathname) => !routesOwnedByIndependentSecurityWaves.has(pathname),
    )
    .sort();
  assert.deepEqual(discovered, [...routeContracts.keys()].sort());
});

test("every audited v1 route keeps its authentication and response contract", async () => {
  for (const [pathname, expected] of routeContracts) {
    const source = await routeSource(pathname);
    const methods = [
      ...source.matchAll(
        /export async function (GET|POST|PUT|PATCH|DELETE|OPTIONS)/g,
      ),
    ].map((match) => match[1]);
    assert.deepEqual(
      methods,
      expected.methods,
      `${pathname} exported methods changed without a route audit`,
    );

    if (expected.requestId === "observed") {
      assert.match(
        source,
        /observeReviewApiRequest\(request,[\s\S]*async \(requestId\) =>/,
        `${pathname} must use the reviewed request-observation wrapper`,
      );
    } else {
      const requestIdCount =
        source.match(/const requestId = requestIdFor\(request\)/g)
          ?.length ?? 0;
      assert.ok(
        requestIdCount >= methods.length,
        `${pathname} must issue a request ID in every handler`,
      );
    }

    if (expected.errors) {
      const errorResponseCount =
        source.match(/responseFromError\(error, requestId\)/g)?.length ??
        0;
      assert.ok(
        expected.requestId === "observed" || errorResponseCount >= methods.length,
        `${pathname} must return bounded problem responses`,
      );
    }

    if (expected.auth !== "public") {
      assert.match(
        source,
        authenticationPatterns[expected.auth],
        `${pathname} authentication model changed`,
      );
    }
    if (expected.origin === "required") {
      assert.match(
        source,
        /assertSameOrigin\(request\)/,
        `${pathname} must reject cross-origin browser mutations`,
      );
    } else if (expected.origin === "forbidden") {
      assert.doesNotMatch(
        source,
        /assertSameOrigin\(request\)/,
        `${pathname} must remain usable by non-browser API clients`,
      );
    }
    if (expected.body === "json") {
      assert.match(
        source,
        /\breadJsonBody\(\s*request/,
        `${pathname} must use the bounded JSON body reader`,
      );
    } else if (expected.body === "raw") {
      assert.match(
        source,
        /\breadTextBody\(\s*request/,
        `${pathname} must preserve the bounded raw request body`,
      );
      assert.doesNotMatch(
        source,
        /\breadJsonBody\(\s*request/,
        `${pathname} must not parse a signed raw request body as JSON`,
      );
    } else if (expected.body) {
      assert.match(
        source,
        /\b(?:readJsonBody|readTextBody)\(\s*request/,
        `${pathname} must use a bounded request-body reader`,
      );
    }
    assert.match(
      source,
      /\b(?:apiJson|problemResponse|responseFromError|apiRedirect)\(|new Response\(/,
      `${pathname} must use a reviewed response path`,
    );
    if (expected.direct) {
      assert.match(source, /Cache-Control/);
      assert.match(source, /Content-Type/);
      assert.match(source, /X-Request-Id/);
    }
    assert.doesNotMatch(
      source,
      /Response\.redirect\(/,
      `${pathname} redirects must preserve API security headers`,
    );
  }
});

test("shared API responses fail closed for caching and correlation", () => {
  const requestId = "security-contract-request";
  const hostileHeaders = {
    "Cache-Control": "public, max-age=86400",
    "Content-Type": "text/html",
    "X-Request-Id": "caller-controlled",
  };
  const json = apiJson(
    { ok: true },
    { requestId, headers: hostileHeaders },
  );
  const problem = problemResponse({
    status: 400,
    code: "invalid_request",
    title: "Invalid request.",
    requestId,
    headers: hostileHeaders,
  });
  const redirect = apiRedirect(
    "https://nodezuno.com/community/newsletter/unsubscribe?state=complete",
    { requestId, status: 303 },
  );

  for (const response of [json, problem, redirect]) {
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
    assert.equal(response.headers.get("x-request-id"), requestId);
  }
  assert.equal(json.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(
    problem.headers.get("content-type"),
    "application/problem+json; charset=utf-8",
  );
  assert.equal(redirect.headers.get("content-type"), null);
  assert.equal(
    redirect.headers.get("location"),
    "https://nodezuno.com/community/newsletter/unsubscribe?state=complete",
  );
});

test("JSON and form media types require an exact base type", async () => {
  const validJson = new Request("https://nodezuno.com/api/v1/example", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: "{}",
  });
  assert.deepEqual(await readJsonBody(validJson), {});

  for (const contentType of [
    "application/jsonp",
    "application/json-seq",
    "text/json",
  ]) {
    await assert.rejects(
      () =>
        readJsonBody(
          new Request("https://nodezuno.com/api/v1/example", {
            method: "POST",
            headers: { "Content-Type": contentType },
            body: "{}",
          }),
        ),
      (error) =>
        error instanceof HttpProblem &&
        error.status === 415 &&
        error.code === "unsupported_media_type",
    );
  }

  assert.equal(
    requestHasMediaType(
      new Request("https://nodezuno.com/api/v1/example", {
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded; charset=UTF-8",
        },
      }),
      "application/x-www-form-urlencoded",
    ),
    true,
  );
  assert.equal(
    requestHasMediaType(
      new Request("https://nodezuno.com/api/v1/example", {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded-json",
        },
      }),
      "application/x-www-form-urlencoded",
    ),
    false,
  );
});

test("non-decimal Content-Length values fail before body parsing", async () => {
  for (const contentLength of ["", "1e2", "0x20", "+2", "2.0"]) {
    await assert.rejects(
      () =>
        readJsonBody(
          new Request("https://nodezuno.com/api/v1/example", {
            method: "POST",
            headers: {
              "Content-Length": contentLength,
              "Content-Type": "application/json",
            },
            body: "{}",
          }),
        ),
      (error) =>
        error instanceof HttpProblem &&
        error.status === 400 &&
        error.code === "invalid_content_length",
    );
  }
});

test("container request IDs ignore caller-supplied Cloudflare markers", () => {
  const previousRuntime = process.env.NODEZUNO_RUNTIME;
  try {
    process.env.NODEZUNO_RUNTIME = "container";
    const supplied = "spoofed-cf-ray-123";
    const generated = requestIdFor(
      new Request("https://nodezuno.com/api/v1/health", {
        headers: { "CF-Ray": supplied },
      }),
    );
    assert.notEqual(generated, supplied);
    assert.match(
      generated,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    delete process.env.NODEZUNO_RUNTIME;
    assert.equal(
      requestIdFor(
        new Request("https://nodezuno.com/api/v1/health", {
          headers: { "CF-Ray": supplied },
        }),
      ),
      supplied,
    );
  } finally {
    if (previousRuntime === undefined) {
      delete process.env.NODEZUNO_RUNTIME;
    } else {
      process.env.NODEZUNO_RUNTIME = previousRuntime;
    }
  }
});

test("unexpected exception logs never include the exception message", async () => {
  const credential = "nzu_live_must-not-reach-logs";
  const originalError = console.error;
  let logged = "";
  console.error = (...values) => {
    logged += values.join(" ");
  };
  try {
    const response = responseFromError(
      new Error(`upstream failed at https://user:${credential}@provider`),
      "redaction-request",
    );
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "service_unavailable");
  } finally {
    console.error = originalError;
  }
  assert.doesNotMatch(logged, new RegExp(credential));
  assert.match(logged, /"name":"Error"/);
});
