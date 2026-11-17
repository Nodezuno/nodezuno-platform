import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";
import { permanentPublicRedirects } from "../lib/public-navigation.ts";
import { proxy } from "../proxy.ts";

const originSecret =
  "nodezuno-origin-test-7f4c2a91e8d6b3059c7a1f24";

test("container proxy denies direct origin access outside health probes", () => {
  withEnvironment(
    {
      NODEZUNO_RUNTIME: "container",
      NODEZUNO_ORIGIN_SECRET: originSecret,
      PUBLIC_ORIGIN: "https://nodezuno.com",
      NODEZUNO_LOCAL_PREVIEW: undefined,
    },
    () => {
      const response = proxy(
        new NextRequest("https://nodezuno.com/api/v1/status"),
      );

      assert.equal(response.status, 403);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("x-frame-options"), "DENY");
      assert.equal(
        response.headers.get("x-content-type-options"),
        "nosniff",
      );
      assert.equal(
        response.headers.get("strict-transport-security"),
        "max-age=31536000",
      );
    },
  );
});

test("container proxy accepts the gateway secret but never forwards it", () => {
  withEnvironment(
    {
      NODEZUNO_RUNTIME: "container",
      NODEZUNO_ORIGIN_SECRET: originSecret,
      PUBLIC_ORIGIN: "https://nodezuno.com",
      NODE_ENV: "production",
      NODEZUNO_LOCAL_PREVIEW: undefined,
      AWS_REGION: "ap-south-1",
      NODEZUNO_DELIVERABLE_BUCKET: "nodezuno-production-deliverables",
    },
    () => {
      const response = proxy(
        new NextRequest("https://nodezuno.com/account", {
          headers: {
            Host: "nodezuno.com",
            "x-forwarded-proto": "https",
            "x-forwarded-for": "198.51.100.8, 203.0.113.42",
            "x-nodezuno-client-ip": "192.0.2.250",
            "x-nodezuno-origin-secret": originSecret,
          },
        }),
      );

      assert.equal(response.status, 200);
      assert.equal(
        response.headers.get("x-middleware-request-x-nodezuno-origin-secret"),
        null,
      );
      assert.equal(
        response.headers.get("x-middleware-request-x-nodezuno-origin-verified"),
        "1",
      );
      assert.equal(
        response.headers.get(
          "x-middleware-request-x-nodezuno-client-ip",
        ),
        "203.0.113.42",
      );
      assert.match(
        response.headers.get("content-security-policy") ?? "",
        /script-src 'self' 'nonce-[^']+'/,
      );
      assert.doesNotMatch(
        response.headers.get("content-security-policy") ?? "",
        /script-src[^;]*'unsafe-eval'/,
      );
      assert.match(
        response.headers.get("content-security-policy") ?? "",
        /connect-src 'self' https:\/\/nodezuno-production-deliverables\.s3\.ap-south-1\.amazonaws\.com/,
      );
      assert.equal(
        response.headers.get("cross-origin-opener-policy"),
        "same-origin",
      );
      assert.equal(
        response.headers.get("cross-origin-resource-policy"),
        "same-origin",
      );
    },
  );
});

test("trusted gateway ingress also proves the public host and protocol", () => {
  withEnvironment(
    {
      NODEZUNO_RUNTIME: "container",
      NODEZUNO_INGRESS_MODE: "trusted-gateway",
      NODEZUNO_ORIGIN_SECRET: originSecret,
      PUBLIC_ORIGIN: "https://nodezuno.com",
      NODE_ENV: "production",
      NODEZUNO_LOCAL_PREVIEW: undefined,
    },
    () => {
      for (const headers of [
        {
          Host: "attacker.invalid",
          "x-forwarded-proto": "https",
          "x-nodezuno-origin-secret": originSecret,
        },
        {
          Host: "nodezuno.com",
          "x-forwarded-proto": "http",
          "x-nodezuno-origin-secret": originSecret,
        },
        {
          Host: "nodezuno.com",
          "x-forwarded-host": "nodezuno.com, attacker.invalid",
          "x-forwarded-proto": "https",
          "x-nodezuno-origin-secret": originSecret,
        },
      ]) {
        const response = proxy(
          new NextRequest("https://nodezuno.com/console", {
            headers,
          }),
        );
        assert.equal(response.status, 403);
        assert.equal(
          response.headers.get(
            "x-middleware-request-x-nodezuno-origin-verified",
          ),
          null,
        );
      }
    },
  );
});

test("direct container ingress accepts only the exact public origin", () => {
  withEnvironment(
    {
      NODEZUNO_RUNTIME: "container",
      NODEZUNO_INGRESS_MODE: "direct",
      NODEZUNO_ORIGIN_SECRET: undefined,
      PUBLIC_ORIGIN: "https://nodezuno.com",
      NODE_ENV: "production",
      NODEZUNO_LOCAL_PREVIEW: undefined,
    },
    () => {
      const accepted = proxy(
        new NextRequest("https://nodezuno.com/account", {
          headers: {
            Host: "nodezuno.com",
            "x-forwarded-for":
              "198.51.100.8, 2001:db8::42",
            "x-forwarded-proto": "https",
            "x-nodezuno-client-ip": "192.0.2.250",
            "x-nodezuno-origin-secret": "attacker-controlled",
          },
        }),
      );
      assert.equal(accepted.status, 200);
      assert.equal(
        accepted.headers.get(
          "x-middleware-request-x-nodezuno-origin-verified",
        ),
        "1",
      );
      assert.equal(
        accepted.headers.get(
          "x-middleware-request-x-nodezuno-origin-secret",
        ),
        null,
      );
      assert.equal(
        accepted.headers.get(
          "x-middleware-request-x-nodezuno-client-ip",
        ),
        "2001:db8::42",
      );

      const wrongHost = proxy(
        new NextRequest("https://nodezuno.com/console", {
          headers: {
            Host: "attacker.invalid",
            "x-forwarded-proto": "https",
          },
        }),
      );
      const wrongProtocol = proxy(
        new NextRequest("https://nodezuno.com/console", {
          headers: {
            Host: "nodezuno.com",
            "x-forwarded-proto": "http",
          },
        }),
      );
      assert.equal(wrongHost.status, 403);
      assert.equal(wrongProtocol.status, 403);
    },
  );
});

test("Sites proxy delegates CSP to the outer worker and strips origin secrets", () => {
  withEnvironment(
    {
      NODEZUNO_RUNTIME: undefined,
      NODEZUNO_ORIGIN_SECRET: undefined,
      PUBLIC_ORIGIN: undefined,
      NODE_ENV: "production",
    },
    () => {
      const response = proxy(
        new NextRequest("https://nodezuno.com/docs", {
          headers: {
            "cf-connecting-ip": "2001:db8::10",
            "x-forwarded-for": "192.0.2.250",
            "x-nodezuno-client-ip": "198.51.100.99",
            "x-nodezuno-origin-verified": "1",
            "x-nodezuno-origin-secret": "attacker-controlled",
          },
        }),
      );

      assert.equal(response.status, 200);
      assert.equal(
        response.headers.get(
          "x-middleware-request-x-nodezuno-origin-secret",
        ),
        null,
      );
      assert.equal(
        response.headers.get(
          "x-middleware-request-x-nodezuno-client-ip",
        ),
        "2001:db8::10",
      );
      assert.equal(
        response.headers.get(
          "x-middleware-request-x-nodezuno-origin-verified",
        ),
        null,
      );
      assert.equal(
        response.headers.get("content-security-policy"),
        null,
      );
      assert.equal(
        response.headers.get("strict-transport-security"),
        null,
      );
      assert.equal(
        response.headers.get("x-middleware-next"),
        "1",
      );
    },
  );
});

test("legacy navigation redirects permanently and preserves the full query", () => {
  withEnvironment(
    {
      NODEZUNO_RUNTIME: undefined,
      NODEZUNO_ORIGIN_SECRET: undefined,
      PUBLIC_ORIGIN: undefined,
      NODE_ENV: "production",
    },
    () => {
      for (const [source, target] of Object.entries(
        permanentPublicRedirects,
      )) {
        const response = proxy(
          new NextRequest(
            `https://nodezuno.com/${source}?campaign=founding%20five&ref=partner%2Fa&ref=email`,
          ),
        );

        assert.equal(response.status, 308, source);
        const location = new URL(response.headers.get("location") ?? "");
        assert.equal(location.origin, "https://nodezuno.com", source);
        const fragmentIndex = target.indexOf("#");
        assert.equal(
          location.pathname,
          fragmentIndex === -1 ? target : target.slice(0, fragmentIndex),
          source,
        );
        assert.equal(
          location.hash,
          fragmentIndex === -1 ? "" : target.slice(fragmentIndex),
          source,
        );
        assert.equal(location.searchParams.get("campaign"), "founding five");
        assert.deepEqual(location.searchParams.getAll("ref"), [
          "partner/a",
          "email",
        ]);
      }
    },
  );
});

test("legacy redirects cannot bypass the container ingress boundary", () => {
  withEnvironment(
    {
      NODEZUNO_RUNTIME: "container",
      NODEZUNO_INGRESS_MODE: "trusted-gateway",
      NODEZUNO_ORIGIN_SECRET: originSecret,
      PUBLIC_ORIGIN: "https://nodezuno.com",
      NODE_ENV: "production",
      NODEZUNO_LOCAL_PREVIEW: undefined,
    },
    () => {
      for (const pathname of [
        "/start",
        "/console",
        "/contact/upgrade-assurance",
        "/developers/docs",
      ]) {
        const response = proxy(
          new NextRequest(`https://nodezuno.com${pathname}?source=legacy`),
        );
        assert.equal(response.status, 403, pathname);
        assert.equal(response.headers.get("location"), null, pathname);
      }

      const verified = proxy(
        new NextRequest(
          "https://nodezuno.com/contact/chain-launch?source=legacy&source=bookmark",
          {
            headers: {
              Host: "nodezuno.com",
              "x-forwarded-proto": "https",
              "x-nodezuno-origin-secret": originSecret,
            },
          },
        ),
      );
      assert.equal(verified.status, 308);
      const location = new URL(verified.headers.get("location") ?? "");
      assert.equal(location.pathname, "/review/start");
      assert.deepEqual(location.searchParams.getAll("source"), [
        "legacy",
        "bookmark",
      ]);
      const policy = verified.headers.get("content-security-policy") ?? "";
      assert.ok(/script-src 'self' 'nonce-[^']+'/.test(policy));
    },
  );
});

test("proxy drops spoofed client identity when ingress addresses are missing or invalid", () => {
  withEnvironment(
    {
      NODEZUNO_RUNTIME: undefined,
      NODEZUNO_ORIGIN_SECRET: undefined,
      PUBLIC_ORIGIN: undefined,
      NODE_ENV: "production",
    },
    () => {
      for (const headers of [
        {
          "x-nodezuno-client-ip": "198.51.100.99",
        },
        {
          "cf-connecting-ip": "not-an-address",
          "x-forwarded-for": "203.0.113.42",
          "x-nodezuno-client-ip": "198.51.100.99",
        },
      ]) {
        const response = proxy(
          new NextRequest("https://nodezuno.com/api/auth/session", {
            headers,
          }),
        );
        assert.equal(response.status, 200);
        assert.equal(
          response.headers.get(
            "x-middleware-request-x-nodezuno-client-ip",
          ),
          null,
        );
      }
    },
  );

  withEnvironment(
    {
      NODEZUNO_RUNTIME: "container",
      NODEZUNO_INGRESS_MODE: "direct",
      NODEZUNO_ORIGIN_SECRET: undefined,
      PUBLIC_ORIGIN: "https://nodezuno.com",
      NODE_ENV: "production",
      NODEZUNO_LOCAL_PREVIEW: undefined,
    },
    () => {
      for (const forwardedFor of [
        undefined,
        "203.0.113.42, not-an-address",
        "203.0.113.42, 999.1.1.1",
      ]) {
        const headers = new Headers({
          Host: "nodezuno.com",
          "x-forwarded-proto": "https",
          "x-nodezuno-client-ip": "198.51.100.99",
        });
        if (forwardedFor) {
          headers.set("x-forwarded-for", forwardedFor);
        }
        const response = proxy(
          new NextRequest("https://nodezuno.com/api/auth/session", {
            headers,
          }),
        );
        assert.equal(response.status, 200);
        assert.equal(
          response.headers.get(
            "x-middleware-request-x-nodezuno-client-ip",
          ),
          null,
        );
      }
    },
  );
});

test("health probes remain public without trusting forwarded identity", () => {
  withEnvironment(
    {
      NODEZUNO_RUNTIME: "container",
      NODEZUNO_ORIGIN_SECRET: originSecret,
      PUBLIC_ORIGIN: "https://nodezuno.com",
      NODEZUNO_LOCAL_PREVIEW: undefined,
    },
    () => {
      for (const pathname of ["/api/v1/live", "/api/v1/ready"]) {
        const response = proxy(
          new NextRequest(`https://nodezuno.com${pathname}`, {
            headers: {
              "x-forwarded-for": "203.0.113.42",
              "x-nodezuno-client-ip": "198.51.100.99",
            },
          }),
        );
        assert.equal(response.status, 200);
        assert.equal(
          response.headers.get(
            "x-middleware-request-x-nodezuno-origin-verified",
          ),
          "0",
        );
        assert.equal(
          response.headers.get(
            "x-middleware-request-x-nodezuno-client-ip",
          ),
          null,
        );
      }
    },
  );
});

test("local preview bypass is limited to a local configured origin", () => {
  withEnvironment(
    {
      NODEZUNO_RUNTIME: "container",
      NODEZUNO_ORIGIN_SECRET: originSecret,
      PUBLIC_ORIGIN: "http://localhost:3000",
      NODEZUNO_LOCAL_PREVIEW: "true",
    },
    () => {
      const local = proxy(
        new NextRequest("http://localhost:3000/api/v1/status"),
      );
      const remote = proxy(
        new NextRequest("http://example.test/api/v1/status"),
      );

      assert.equal(local.status, 200);
      assert.equal(remote.status, 403);
    },
  );
});

function withEnvironment(values, run) {
  const previous = Object.fromEntries(
    Object.keys(values).map((name) => [name, process.env[name]]),
  );
  try {
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    return run();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}
