import assert from "node:assert/strict";
import test from "node:test";
import {
  applyRpcAccessPolicyToCalls,
  evaluateRpcAccessPolicy,
  ipAddressMatchesAnyCidr,
  validateRpcAccessPolicy,
  validateRpcAccessPolicyUpdate,
} from "../lib/server/rpc-access-policy.ts";

test("validates and normalizes a bounded RPC access policy", () => {
  const result = validateRpcAccessPolicy({
    allowedOrigins: [
      "https://console.example.org",
      "https://app.example.org:8443",
    ],
    allowedIpCidrs: [
      "2001:db8:abcd::/48",
      "203.0.113.0/24",
      "198.51.100.18",
    ],
    allowedMethods: ["eth_getBalance", "eth_blockNumber"],
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      allowedOrigins: [
        "https://app.example.org:8443",
        "https://console.example.org",
      ],
      allowedIpCidrs: [
        "198.51.100.18",
        "2001:db8:abcd::/48",
        "203.0.113.0/24",
      ],
      allowedMethods: ["eth_blockNumber", "eth_getBalance"],
    },
  });
});

test("rejects unsafe origins, invalid CIDRs, methods, and extra fields", () => {
  for (const payload of [
    { allowedOrigins: ["http://app.example.org"] },
    { allowedOrigins: ["https://*.example.org"] },
    { allowedOrigins: ["https://example.org/path"] },
    { allowedOrigins: ["https://example.org", "https://example.org"] },
    { allowedIpCidrs: ["203.0.113.999/24"] },
    { allowedIpCidrs: ["2001:db8::/129"] },
    { allowedIpCidrs: ["203.0.113.1/24/7"] },
    { allowedMethods: ["eth getBalance"] },
    { allowedMethods: ["eth_call", "eth_call"] },
    { unrestricted: true },
  ]) {
    const result = validateRpcAccessPolicy(payload);
    assert.equal(result.ok, false);
  }
});

test("empty or omitted policy lists are valid and unrestricted", () => {
  assert.deepEqual(validateRpcAccessPolicy({}), {
    ok: true,
    value: {
      allowedOrigins: [],
      allowedIpCidrs: [],
      allowedMethods: [],
    },
  });
});

test("policy updates require an exact optimistic revision", () => {
  assert.deepEqual(
    validateRpcAccessPolicyUpdate({
      revision: 4,
      allowedOrigins: ["https://app.example.org"],
      allowedIpCidrs: [],
      allowedMethods: ["eth_blockNumber"],
    }),
    {
      ok: true,
      value: {
        revision: 4,
        allowedOrigins: ["https://app.example.org"],
        allowedIpCidrs: [],
        allowedMethods: ["eth_blockNumber"],
      },
    },
  );
  for (const revision of [-1, 1.5, "4", Number.MAX_SAFE_INTEGER]) {
    const result = validateRpcAccessPolicyUpdate({
      revision,
      allowedOrigins: [],
      allowedIpCidrs: [],
      allowedMethods: [],
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.fields.revision);
  }
});

test("matches exact IPv4, IPv4 CIDR, IPv6 CIDR, and mapped IPv4", () => {
  assert.equal(
    ipAddressMatchesAnyCidr("203.0.113.7", ["203.0.113.0/24"]),
    true,
  );
  assert.equal(
    ipAddressMatchesAnyCidr("203.0.114.7", ["203.0.113.0/24"]),
    false,
  );
  assert.equal(
    ipAddressMatchesAnyCidr("198.51.100.18", ["198.51.100.18"]),
    true,
  );
  assert.equal(
    ipAddressMatchesAnyCidr("2001:db8:abcd:1::7", [
      "2001:db8:abcd::/48",
    ]),
    true,
  );
  assert.equal(
    ipAddressMatchesAnyCidr("2001:db8:abce::7", [
      "2001:db8:abcd::/48",
    ]),
    false,
  );
  assert.equal(
    ipAddressMatchesAnyCidr("::ffff:203.0.113.7", [
      "203.0.113.0/24",
    ]),
    true,
  );
  assert.equal(
    ipAddressMatchesAnyCidr("unknown", ["0.0.0.0/0"]),
    false,
  );
});

test("transport controls reject the whole envelope before method filtering", () => {
  const calls = [
    { method: "eth_chainId", blocked: false },
    {
      method: "eth_getBalance",
      blocked: true,
      policyError: {
        message: "Invalid params",
        data: {
          code: "rpc_params_out_of_policy",
          detail: "Existing parameter policy.",
        },
      },
    },
  ];
  applyRpcAccessPolicyToCalls({
    calls,
    policy: {
      allowedOrigins: ["https://app.example.org"],
      allowedIpCidrs: ["203.0.113.0/24"],
      allowedMethods: ["eth_chainId"],
    },
    origin: "https://app.example.org",
    clientAddress: "198.51.100.8",
  });
  assert.equal(calls.every((call) => call.blocked), true);
  assert.equal(
    calls.every(
      (call) => call.policyError?.data.code === "rpc_ip_not_allowed",
    ),
    true,
  );
  assert.equal(
    calls.every((call) => call.policyError?.jsonRpcCode === -32003),
    true,
  );
});

test("method controls reject only disallowed batch members", () => {
  const calls = [
    { method: "eth_chainId", blocked: false },
    { method: "eth_getBalance", blocked: false },
    { method: "debug_traceCall", blocked: true },
  ];
  applyRpcAccessPolicyToCalls({
    calls,
    policy: {
      allowedOrigins: [],
      allowedIpCidrs: [],
      allowedMethods: ["eth_chainId"],
    },
    origin: null,
    clientAddress: null,
  });
  assert.equal(calls[0].blocked, false);
  assert.equal(calls[0].policyError, undefined);
  assert.equal(calls[1].blocked, true);
  assert.equal(
    calls[1].policyError?.data.code,
    "rpc_method_not_allowed",
  );
  assert.equal(calls[2].blocked, true);
  assert.equal(calls[2].policyError, undefined);
});

test("fails closed for configured method, origin, and address controls", () => {
  const policy = {
    allowedOrigins: ["https://app.example.org"],
    allowedIpCidrs: ["203.0.113.0/24"],
    allowedMethods: ["eth_blockNumber"],
  };

  assert.deepEqual(
    evaluateRpcAccessPolicy({
      policy,
      method: "eth_getBalance",
      origin: "https://app.example.org",
      clientAddress: "203.0.113.8",
    }),
    {
      allowed: false,
      code: "rpc_method_not_allowed",
      detail: "The RPC method is not enabled for this service.",
    },
  );
  assert.equal(
    evaluateRpcAccessPolicy({
      policy,
      method: "eth_blockNumber",
      origin: null,
      clientAddress: "203.0.113.8",
    }).allowed,
    false,
  );
  assert.equal(
    evaluateRpcAccessPolicy({
      policy,
      method: "eth_blockNumber",
      origin: "https://app.example.org",
      clientAddress: "198.51.100.8",
    }).allowed,
    false,
  );
  assert.deepEqual(
    evaluateRpcAccessPolicy({
      policy,
      method: "eth_blockNumber",
      origin: "https://app.example.org/",
      clientAddress: "203.0.113.8",
    }),
    { allowed: true },
  );
});
