import assert from "node:assert/strict";
import test from "node:test";
import {
  rpcCorsPreflight,
  rpcCorsResponseHeaders,
} from "../lib/server/rpc-cors.ts";

const policy = {
  allowedOrigins: ["https://app.example.org"],
  allowedIpCidrs: [],
  allowedMethods: [],
};

test("RPC CORS preflight reflects only an exact configured HTTPS origin", () => {
  const decision = rpcCorsPreflight({
    policy,
    origin: "https://app.example.org",
    requestedMethod: "POST",
    requestedHeaders: "authorization, content-type",
  });
  assert.equal(decision.allowed, true);
  if (!decision.allowed) return;
  assert.equal(
    decision.headers.get("Access-Control-Allow-Origin"),
    "https://app.example.org",
  );
  assert.equal(
    decision.headers.get("Access-Control-Allow-Methods"),
    "POST, OPTIONS",
  );
  assert.equal(
    decision.headers.get("Access-Control-Allow-Headers"),
    "Authorization, Content-Type",
  );
  assert.equal(
    decision.headers.get("Access-Control-Allow-Credentials"),
    null,
  );
  assert.equal(decision.headers.get("Access-Control-Max-Age"), "600");
  assert.match(decision.headers.get("Vary") ?? "", /Origin/);
});

test("RPC CORS preflight rejects origins, methods, and headers fail closed", () => {
  for (const options of [
    {
      origin: "https://evil.example",
      requestedMethod: "POST",
      requestedHeaders: "authorization, content-type",
    },
    {
      origin: "https://app.example.org",
      requestedMethod: "DELETE",
      requestedHeaders: "authorization",
    },
    {
      origin: "https://app.example.org",
      requestedMethod: "POST",
      requestedHeaders: "authorization, x-forwarded-for",
    },
  ]) {
    assert.equal(
      rpcCorsPreflight({ policy, ...options }).allowed,
      false,
    );
  }
  assert.equal(
    rpcCorsPreflight({
      policy: { ...policy, allowedOrigins: [] },
      origin: "https://app.example.org",
      requestedMethod: "POST",
      requestedHeaders: "authorization",
    }).allowed,
    false,
  );
});

test("RPC responses expose quota metadata without enabling credentials", () => {
  const allowed = rpcCorsResponseHeaders({
    policy,
    origin: "https://app.example.org",
  });
  assert.ok(allowed);
  assert.equal(
    allowed.get("Access-Control-Allow-Origin"),
    "https://app.example.org",
  );
  assert.match(
    allowed.get("Access-Control-Expose-Headers") ?? "",
    /X-RateLimit-Remaining/,
  );
  assert.equal(allowed.get("Access-Control-Allow-Credentials"), null);

  assert.equal(
    rpcCorsResponseHeaders({
      policy,
      origin: "https://evil.example",
    }),
    null,
  );
  assert.deepEqual(
    [
      ...(rpcCorsResponseHeaders({ policy, origin: null }) ??
        new Headers()),
    ],
    [],
  );
});
