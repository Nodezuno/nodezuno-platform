import assert from "node:assert/strict";
import test from "node:test";
import {
  allowsLocalUnverifiedEmailAuthentication,
  allValuesAreDistinct,
  containerDatabaseDriver,
  containerIngressMode,
  hasValidDirectIngressRequest,
  hasValidOriginGatewaySecret,
  normalizeSqliteDatabasePath,
  normalizedRuntimeSecret,
  optionalAccessIdentityConfigurationIsValid,
  optionalEmailDeliveryConfigurationIsValid,
  optionalGoogleConfigurationIsValid,
  optionalNotificationDeliveryConfigurationIsValid,
  optionalPairIsComplete,
  runtimeConfigurationSnapshot,
} from "../lib/server/runtime-config.ts";

const productionEnvironment = {
  NODEZUNO_RUNTIME: "container",
  NODEZUNO_INGRESS_MODE: "trusted-gateway",
  NODEZUNO_LOCAL_PREVIEW: "false",
  NODEZUNO_DOMAIN: "nodezuno.com",
  PUBLIC_ORIGIN: "https://nodezuno.com",
  BETTER_AUTH_URL: "https://nodezuno.com",
  RATE_LIMIT_SECRET:
    "rate-limit-prod-3a91f7c20e5d84b619c2f7a05d1e",
  BETTER_AUTH_SECRET:
    "better-auth-prod-5d84b619a3f07c20e1d9c2f75",
  REVIEW_CAPABILITY_SECRET:
    "review-capability-prod-92d1f6a43b8c75e10f2a9d6c",
  NODEZUNO_ORIGIN_SECRET:
    "origin-gateway-prod-619a3f07c20e5d84b1e9c2f7",
  NODEZUNO_ADMIN_EMAILS: "info@nodezuno.com",
  CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
  CLOUDFLARE_D1_DATABASE_ID:
    "11111111-1111-4111-8111-111111111111",
  CLOUDFLARE_D1_API_TOKEN:
    "cloudflare-d1-prod-token-8f31c6a20d9e74b51f6a",
  CF_ACCESS_TEAM_DOMAIN:
    "https://nodezuno.cloudflareaccess.com",
  CF_ACCESS_AUDIENCE:
    "nodezuno-access-audience-5e84b619a3f07c20",
  GOOGLE_CLIENT_ID: undefined,
  GOOGLE_CLIENT_SECRET: undefined,
  ZOHO_SMTP_HOST: "smtp.zoho.in",
  ZOHO_SMTP_PASSWORD: "zoho-app-password-for-test",
  AWS_REGION: "ap-south-1",
  NODEZUNO_DELIVERABLE_BUCKET: "nodezuno-production-deliverables",
  NODEZUNO_DELIVERABLE_KMS_KEY_ARN:
    "arn:aws:kms:ap-south-1:123456789012:key/11111111-1111-4111-8111-111111111111",
};

test("container readiness accepts only a coherent production configuration", () => {
  withEnvironment(productionEnvironment, () => {
    const healthy = runtimeConfigurationSnapshot();
    assert.deepEqual(healthy, {
      runtime: "container",
      publicOrigin: true,
      rateLimitSecret: true,
      reviewCapabilitySecret: true,
      secretIsolation: true,
      administratorAllowlist: true,
      accountAuthentication: true,
      databaseConnection: true,
      ingressBoundary: true,
      accessIdentity: true,
      notificationDelivery: true,
      deliverableStorage: true,
    });

    process.env.NODEZUNO_ORIGIN_SECRET = process.env.RATE_LIMIT_SECRET;
    assert.equal(
      runtimeConfigurationSnapshot().secretIsolation,
      false,
    );

    process.env.NODEZUNO_ORIGIN_SECRET =
      productionEnvironment.NODEZUNO_ORIGIN_SECRET;
    assert.equal(
      runtimeConfigurationSnapshot().secretIsolation,
      true,
    );
    delete process.env.NODEZUNO_ORIGIN_SECRET;
    process.env.BETTER_AUTH_URL = "https://accounts.nodezuno.com";
    assert.equal(
      runtimeConfigurationSnapshot().accountAuthentication,
      false,
    );

    for (const unsafeOrigin of [
      " https://nodezuno.com",
      "https://127.0.0.1",
      "https://auth.internal",
      "https://auth.nodezuno.test",
      "https://example.com",
    ]) {
      process.env.BETTER_AUTH_URL = unsafeOrigin;
      assert.equal(
        runtimeConfigurationSnapshot().accountAuthentication,
        false,
      );
    }

    process.env.BETTER_AUTH_URL = productionEnvironment.BETTER_AUTH_URL;
    process.env.NODEZUNO_DOMAIN = "wrong.nodezuno.com";
    assert.equal(runtimeConfigurationSnapshot().publicOrigin, false);
    process.env.NODEZUNO_DOMAIN = productionEnvironment.NODEZUNO_DOMAIN;
    delete process.env.ZOHO_SMTP_PASSWORD;
    delete process.env.ZOHO_SMTP_HOST;
    assert.equal(
      runtimeConfigurationSnapshot().accountAuthentication,
      false,
    );
    assert.equal(
      runtimeConfigurationSnapshot().notificationDelivery,
      false,
    );

    process.env.ZOHO_SMTP_PASSWORD = productionEnvironment.ZOHO_SMTP_PASSWORD;
    process.env.ZOHO_SMTP_HOST = productionEnvironment.ZOHO_SMTP_HOST;
    process.env.GOOGLE_CLIENT_ID = "configured-client";
    delete process.env.GOOGLE_CLIENT_SECRET;
    assert.equal(
      runtimeConfigurationSnapshot().accountAuthentication,
      false,
    );

    delete process.env.GOOGLE_CLIENT_ID;
    process.env.NODEZUNO_ADMIN_EMAILS = "admin@example.com";
    assert.equal(
      runtimeConfigurationSnapshot().administratorAllowlist,
      false,
    );
    process.env.NODEZUNO_ADMIN_EMAILS =
      productionEnvironment.NODEZUNO_ADMIN_EMAILS;
    delete process.env.CF_ACCESS_TEAM_DOMAIN;
    delete process.env.CF_ACCESS_AUDIENCE;
    assert.equal(
      runtimeConfigurationSnapshot().accessIdentity,
      true,
    );
    process.env.CF_ACCESS_TEAM_DOMAIN =
      productionEnvironment.CF_ACCESS_TEAM_DOMAIN;
    assert.equal(
      runtimeConfigurationSnapshot().accessIdentity,
      false,
    );
  });
});

test("notification delivery configuration supports disabled and complete modes", () => {
  assert.equal(
    optionalNotificationDeliveryConfigurationIsValid(
      undefined,
      undefined,
    ),
    true,
  );
  assert.equal(
    optionalNotificationDeliveryConfigurationIsValid(
      productionEnvironment.ZOHO_SMTP_PASSWORD,
      productionEnvironment.ZOHO_SMTP_HOST,
    ),
    true,
  );
  assert.equal(
    optionalNotificationDeliveryConfigurationIsValid(
      productionEnvironment.ZOHO_SMTP_PASSWORD,
      undefined,
    ),
    false,
  );
});

test("runtime secrets reject placeholders, whitespace, and low diversity", () => {
  assert.equal(
    normalizedRuntimeSecret(
      "replace-with-an-independent-32-byte-random-secret",
    ),
    null,
  );
  assert.equal(normalizedRuntimeSecret("x".repeat(64)), null);
  assert.equal(
    normalizedRuntimeSecret(
      " strong-secret-3a91f7c20e5d84b619c2f7a05d1e",
    ),
    null,
  );
  assert.equal(
    normalizedRuntimeSecret(
      "strong-secret-3a91f7c20e5d84b619c2f7a05d1e",
    ) !== null,
    true,
  );
  assert.equal(
    allValuesAreDistinct(["first", "second", "third"]),
    true,
  );
  assert.equal(allValuesAreDistinct(["same", "same"]), false);
  assert.equal(optionalPairIsComplete(undefined, undefined), true);
  assert.equal(optionalPairIsComplete("client", undefined), false);
  assert.equal(
    optionalAccessIdentityConfigurationIsValid(undefined, undefined),
    true,
  );
  assert.equal(
    optionalAccessIdentityConfigurationIsValid(
      "https://nodezuno.cloudflareaccess.com",
      undefined,
    ),
    false,
  );
  assert.equal(
    optionalAccessIdentityConfigurationIsValid(
      "https://nodezuno.cloudflareaccess.com",
      "audience-0123456789abcdef",
    ),
    true,
  );
  assert.equal(
    allowsLocalUnverifiedEmailAuthentication(
      "http://localhost:3000",
      "true",
    ),
    true,
  );
  assert.equal(
    allowsLocalUnverifiedEmailAuthentication(
      "https://nodezuno.com",
      "true",
    ),
    false,
  );
  assert.equal(
    optionalGoogleConfigurationIsValid(
      "replace-with-google-client",
      "replace-with-google-secret",
    ),
    false,
  );
  assert.equal(
    optionalEmailDeliveryConfigurationIsValid(
      "replace-with-zoho-app-password",
      "smtp.invalid",
    ),
    false,
  );
});

test("container readiness accepts a bounded absolute SQLite volume path", () => {
  withEnvironment(
    {
      ...productionEnvironment,
      NODEZUNO_DATABASE_DRIVER: "sqlite",
      NODEZUNO_SQLITE_PATH: "/var/lib/nodezuno/nodezuno.sqlite",
      CLOUDFLARE_ACCOUNT_ID: undefined,
      CLOUDFLARE_D1_DATABASE_ID: undefined,
      CLOUDFLARE_D1_API_TOKEN: undefined,
    },
    () => {
      assert.equal(
        runtimeConfigurationSnapshot().databaseConnection,
        true,
      );
      process.env.NODEZUNO_SQLITE_PATH = "../nodezuno.sqlite";
      assert.equal(
        runtimeConfigurationSnapshot().databaseConnection,
        false,
      );
      process.env.NODEZUNO_SQLITE_PATH =
        "/var/lib/nodezuno/../secrets.sqlite";
      assert.equal(
        runtimeConfigurationSnapshot().databaseConnection,
        false,
      );
    },
  );

  assert.equal(containerDatabaseDriver(undefined), "d1-rest");
  assert.equal(containerDatabaseDriver("sqlite"), "sqlite");
  assert.equal(containerDatabaseDriver(" sqlite"), null);
  assert.equal(containerDatabaseDriver("postgres"), null);
  assert.equal(
    normalizeSqliteDatabasePath(
      "/var/lib/nodezuno/nodezuno.sqlite3",
    ),
    "/var/lib/nodezuno/nodezuno.sqlite3",
  );
  assert.equal(
    normalizeSqliteDatabasePath(
      "/Users/operator/Library/Application Support/Nodezuno/nodezuno.sqlite",
    ),
    "/Users/operator/Library/Application Support/Nodezuno/nodezuno.sqlite",
  );
  assert.equal(
    normalizeSqliteDatabasePath("/tmp/nodezuno"),
    null,
  );
  assert.equal(
    normalizeSqliteDatabasePath("/tmp/nodezuno\tdata.sqlite"),
    null,
  );
});

test("direct container ingress is explicit, origin-bound, and secret-free", () => {
  withEnvironment(
    {
      ...productionEnvironment,
      NODEZUNO_INGRESS_MODE: "direct",
      NODEZUNO_ORIGIN_SECRET: undefined,
    },
    () => {
      const snapshot = runtimeConfigurationSnapshot();
      assert.equal(snapshot.ingressBoundary, true);
      assert.equal(snapshot.secretIsolation, true);

      assert.equal(
        hasValidDirectIngressRequest(
          new Request("https://nodezuno.com/api/v1/status", {
            headers: {
              Host: "nodezuno.com",
              "x-forwarded-proto": "https",
            },
          }),
        ),
        true,
      );
      for (const headers of [
        {
          Host: "attacker.invalid",
          "x-forwarded-proto": "https",
        },
        {
          Host: "nodezuno.com",
          "x-forwarded-host":
            "nodezuno.com, attacker.invalid",
          "x-forwarded-proto": "https",
        },
        {
          Host: "nodezuno.com",
          "x-forwarded-proto": "http",
        },
      ]) {
        assert.equal(
          hasValidDirectIngressRequest(
            new Request(
              "https://nodezuno.com/api/v1/status",
              { headers },
            ),
          ),
          false,
        );
      }

      process.env.NODEZUNO_ORIGIN_SECRET =
        productionEnvironment.NODEZUNO_ORIGIN_SECRET;
      assert.equal(
        runtimeConfigurationSnapshot().ingressBoundary,
        false,
      );
    },
  );

  assert.equal(containerIngressMode(undefined), "trusted-gateway");
  assert.equal(containerIngressMode("direct"), "direct");
  assert.equal(
    containerIngressMode("trusted-gateway"),
    "trusted-gateway",
  );
  assert.equal(containerIngressMode(" direct"), null);
  assert.equal(containerIngressMode("proxy"), null);
});

test("origin gateway rejects a repository placeholder even if it is presented", () => {
  withEnvironment(
    {
      NODEZUNO_RUNTIME: "container",
      NODEZUNO_ORIGIN_SECRET:
        "replace-with-at-least-32-random-characters",
    },
    () => {
      const request = new Request("https://nodezuno.com/", {
        headers: {
          "x-nodezuno-origin-secret":
            "replace-with-at-least-32-random-characters",
        },
      });
      assert.equal(hasValidOriginGatewaySecret(request), false);
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
