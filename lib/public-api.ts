import { reviewTargetOptions } from "./review-targets.ts";
import { reviewPolicy } from "./review-policy.ts";
import { problemResponse, problemSchema } from "./api/shared.ts";

export type PublicApiEndpoint = {
  method:
    | "GET"
    | "POST"
    | "PUT"
    | "PATCH"
    | "DELETE"
    | "OPTIONS";
  path: string;
  title: string;
  maturity: "live" | "beta" | "prelaunch data";
  /** Omitted means customer-facing; signed integration callbacks are provider-only. */
  audience?: "customer" | "provider";
  description: string;
};

export const publicApiEndpoints: PublicApiEndpoint[] = [
  {
    method: "GET",
    path: "/api/v1/live",
    title: "Process liveness",
    maturity: "live",
    description:
      "Checks that the website process can answer HTTP without calling an external dependency.",
  },
  {
    method: "GET",
    path: "/api/v1/ready",
    title: "Website readiness",
    maturity: "live",
    description:
      "Checks every required selected-database table, seed catalog, and security configuration.",
  },
  {
    method: "GET",
    path: "/api/v1/health",
    title: "Detailed website health",
    maturity: "live",
    description:
      "Reports website database, security-configuration, RPC, and native gRPC configuration details without probing product upstreams.",
  },
  {
    method: "GET",
    path: "/api/v1/status",
    title: "Status catalog",
    maturity: "live",
    description:
      "Returns current control-plane readiness, separate Ethereum, Base, and Solana RPC verification, native Ethereum gRPC serving health, incidents, and explicitly planned product catalog entries.",
  },
  {
    method: "GET",
    path: "/api/v1/chains",
    title: "Chain directory",
    maturity: "prelaunch data",
    description:
      "Returns the curated chain plan with explicit planned, preview, data-only, or full maturity.",
  },
  {
    method: "GET",
    path: "/api/v1/abuse-challenge",
    title: "Browser challenge",
    maturity: "live",
    description:
      "Issues a short-lived SHA-256 proof-of-work challenge for a public form mutation.",
  },
  {
    method: "POST",
    path: "/api/v1/gas-estimate",
    title: "Gas estimate",
    maturity: "live",
    description:
      "Performs a bounded integer cost calculation without relying on a market-price feed.",
  },
  {
    method: "POST",
    path: "/api/v1/submissions",
    title: "Request intake",
    maturity: "live",
    description:
      "Persists validated sales, workspace, support, startup, press, careers, security, or event requests.",
  },
  {
    method: "POST",
    path: "/api/v1/review-orders",
    title: "Create an Upgrade Assurance order",
    maturity: "live",
    description:
      "Creates a fixed-price service order from bounded, non-confidential upgrade details. Returns a private tracking capability for immediate terms acceptance and payment, with exact idempotent retries.",
  },
  {
    method: "POST",
    path: "/api/v1/review-orders/{id}/access",
    title: "Exchange a private tracking capability",
    maturity: "live",
    description:
      "Exchanges the URL-fragment capability for a scoped HttpOnly review cookie.",
  },
  {
    method: "GET",
    path: "/api/v1/review-orders/{id}",
    title: "Read a private review order",
    maturity: "live",
    description:
      "Returns the authorized proposal, payment evidence, and engagement state without secret metadata.",
  },
  {
    method: "POST",
    path: "/api/v1/review-orders/{id}/payment-intents",
    title: "Create an Ethereum stablecoin payment instruction",
    maturity: "live",
    description:
      "Creates or reuses an immutable, server-priced USDC or USDT payment instruction after exact proposal acceptance.",
  },
  {
    method: "POST",
    path: "/api/v1/review-orders/{id}/payment-intents/{intentId}/claims",
    title: "Submit an Ethereum transaction claim",
    maturity: "live",
    description:
      "Records a transaction hash and mandatory Telegram username for asynchronous, fail-closed Ethereum RPC verification.",
  },
  {
    method: "GET",
    path: "/api/v1/review-orders/{id}/payment-confirmations/{confirmationId}",
    title: "Download a payment confirmation record",
    maturity: "live",
    description:
      "Returns an authorized, immutable JSON record of finalized Ethereum payment evidence. The record is not a tax invoice or custody receipt.",
  },
  {
    method: "POST",
    path: "/api/v1/newsletter/subscriptions",
    title: "Newsletter intake",
    maturity: "live",
    description:
      "Persists consent and queues a private double-opt-in confirmation when one is needed.",
  },
  {
    method: "POST",
    path: "/api/v1/newsletter/confirm",
    title: "Newsletter confirmation",
    maturity: "live",
    description:
      "Confirms a pending subscription with an expiring, one-way-hashed private token.",
  },
  {
    method: "POST",
    path: "/api/v1/newsletter/unsubscribe",
    title: "Newsletter unsubscribe",
    maturity: "live",
    description:
      "Suppresses a subscription using a one-way-hashed private link token.",
  },
  {
    method: "GET",
    path: "/api/v1/auth/providers",
    title: "Authentication providers",
    maturity: "live",
    description:
      "Reports which Nodezuno account methods are configured for this deployment.",
  },
  {
    method: "GET",
    path: "/api/v1/auth/session",
    title: "Current account session",
    maturity: "live",
    description:
      "Returns safe current-account metadata without exposing synthetic wallet email.",
  },
  {
    method: "POST",
    path: "/api/v1/account/export",
    title: "Download account data",
    maturity: "live",
    description:
      "Returns a bounded JSON download for the caller's recent Nodezuno application session, with credentials and private request metadata excluded.",
  },
  {
    method: "GET",
    path: "/api/v1/developer/workspace",
    title: "Developer workspace",
    maturity: "live",
    description:
      "Reads the developer workspace attached to the authenticated account.",
  },
  {
    method: "POST",
    path: "/api/v1/developer/workspace",
    title: "Create developer workspace",
    maturity: "live",
    description:
      "Creates a self-service workspace and owner membership for the authenticated account.",
  },
  {
    method: "GET",
    path: "/api/v1/developer/workspace/members",
    title: "List workspace members",
    maturity: "live",
    description:
      "Lists active and pending owner, administrator, and developer memberships.",
  },
  {
    method: "POST",
    path: "/api/v1/developer/workspace/members",
    title: "Add workspace member",
    maturity: "live",
    description:
      "Grants an exact verified email administrator or developer access without a sales step.",
  },
  {
    method: "PUT",
    path: "/api/v1/developer/workspace/members/{id}",
    title: "Change workspace member role",
    maturity: "live",
    description:
      "Lets the workspace owner change a non-owner member between administrator and developer.",
  },
  {
    method: "DELETE",
    path: "/api/v1/developer/workspace/members/{id}",
    title: "Remove workspace member",
    maturity: "live",
    description:
      "Removes a non-owner membership subject to role hierarchy controls.",
  },
  {
    method: "GET",
    path: "/api/v1/developer/workspace/audit-events",
    title: "Read workspace audit trail",
    maturity: "live",
    description:
      "Returns a stable, cursor-paginated owner or administrator view of redacted developer control-plane actions.",
  },
  {
    method: "GET",
    path: "/api/v1/developer/api-keys",
    title: "List developer API keys",
    maturity: "live",
    description:
      "Lists non-secret API key metadata for the signed-in workspace owner.",
  },
  {
    method: "POST",
    path: "/api/v1/developer/api-keys",
    title: "Create developer API key",
    maturity: "live",
    description:
      "Creates a key and returns its plaintext secret exactly once.",
  },
  {
    method: "DELETE",
    path: "/api/v1/developer/api-keys/{id}",
    title: "Revoke developer API key",
    maturity: "live",
    description:
      "Revokes an API key owned by the authenticated workspace.",
  },
  {
    method: "POST",
    path: "/api/v1/developer/api-keys/{id}/rotate",
    title: "Rotate developer API key",
    maturity: "live",
    description:
      "Atomically creates a same-scope replacement, revokes the active source key, and returns the replacement secret exactly once.",
  },
  {
    method: "GET",
    path: "/api/v1/developer/services",
    title: "List workspace services",
    maturity: "live",
    description:
      "Lists live platform services, reconciled Ethereum, Base, and Solana RPC Lab services, and durable Chain Launch Cloud project briefs or other prelaunch configurations.",
  },
  {
    method: "POST",
    path: "/api/v1/developer/services",
    title: "Create workspace service",
    maturity: "live",
    description:
      "Creates a platform service, activates an Ethereum, Base, or Solana RPC Lab service only after chain-specific upstream verification, or saves a structured Chain Launch Cloud design-partner project without deploying infrastructure.",
  },
  {
    method: "GET",
    path: "/api/v1/developer/services/{id}",
    title: "Read workspace service",
    maturity: "live",
    description:
      "Returns one tenant-bound service with current RPC or gRPC operator readiness reconciled.",
  },
  {
    method: "PATCH",
    path: "/api/v1/developer/services/{id}",
    title: "Rename workspace service",
    maturity: "live",
    description:
      "Renames an active workspace service using its exact current updatedAt timestamp.",
  },
  {
    method: "DELETE",
    path: "/api/v1/developer/services/{id}",
    title: "Archive workspace service",
    maturity: "live",
    description:
      "Archives a workspace service or saved product configuration.",
  },
  {
    method: "GET",
    path: "/api/v1/control-plane/services",
    title: "List services by API key",
    maturity: "live",
    description:
      "Lists workspace services for an unbound API key carrying services:manage.",
  },
  {
    method: "POST",
    path: "/api/v1/control-plane/services",
    title: "Create service by API key",
    maturity: "live",
    description:
      "Idempotently creates or configures a workspace service with an unbound services:manage key.",
  },
  {
    method: "GET",
    path: "/api/v1/control-plane/services/{id}",
    title: "Read service by API key",
    maturity: "live",
    description:
      "Returns one tenant-bound service with current readiness for an unbound API key carrying services:manage.",
  },
  {
    method: "PATCH",
    path: "/api/v1/control-plane/services/{id}",
    title: "Rename service by API key",
    maturity: "live",
    description:
      "Optimistically renames a tenant-bound service with an unbound services:manage key.",
  },
  {
    method: "DELETE",
    path: "/api/v1/control-plane/services/{id}",
    title: "Archive service by API key",
    maturity: "live",
    description:
      "Archives a tenant-bound service with an unbound services:manage key.",
  },
  {
    method: "GET",
    path: "/api/v1/control-plane/services/{id}/usage",
    title: "Read service usage by API key",
    maturity: "live",
    description:
      "Returns retained tenant-scoped RPC usage and quota aggregates with a services:manage key.",
  },
  {
    method: "GET",
    path: "/api/v1/control-plane/services/{id}/rpc-access-policy",
    title: "Read access policy by API key",
    maturity: "live",
    description:
      "Reads an RPC service policy with an unbound services:manage key.",
  },
  {
    method: "PUT",
    path: "/api/v1/control-plane/services/{id}/rpc-access-policy",
    title: "Update access policy by API key",
    maturity: "live",
    description:
      "Optimistically updates an RPC service policy with an unbound services:manage key.",
  },
  {
    method: "GET",
    path: "/api/v1/control-plane/services/{id}/quota-guardrail",
    title: "Read service quota guardrail by API key",
    maturity: "live",
    description:
      "Reads the inherited or configured hourly RPC service ceiling with an unbound services:manage key.",
  },
  {
    method: "PUT",
    path: "/api/v1/control-plane/services/{id}/quota-guardrail",
    title: "Update service quota guardrail by API key",
    maturity: "live",
    description:
      "Optimistically updates an RPC or gRPC service ceiling and warning threshold with an unbound services:manage key.",
  },
  {
    method: "GET",
    path: "/api/v1/developer/services/{id}/usage",
    title: "Read RPC service usage",
    maturity: "live",
    description:
      "Returns tenant-isolated, zero-filled RPC traffic, latency, error, quota, byte, and API-key aggregates from retained gateway usage buckets.",
  },
  {
    method: "GET",
    path: "/api/v1/developer/services/{id}/ai-diagnosis",
    title: "Diagnose infrastructure evidence",
    maturity: "beta",
    description:
      "Returns deterministic, tenant-isolated findings with evidence references and runbook actions for RPC services or Chain Launch Cloud project readiness. This release does not call an external AI model.",
  },
  {
    method: "GET",
    path: "/api/v1/developer/services/{id}/rpc-access-policy",
    title: "Read RPC access policy",
    maturity: "live",
    description:
      "Reads the exact browser origins, client address ranges, RPC methods, and optimistic revision configured for a workspace RPC service.",
  },
  {
    method: "PUT",
    path: "/api/v1/developer/services/{id}/rpc-access-policy",
    title: "Update RPC access policy",
    maturity: "live",
    description:
      "Atomically replaces a workspace RPC service policy when its optimistic revision still matches.",
  },
  {
    method: "GET",
    path: "/api/v1/developer/services/{id}/quota-guardrail",
    title: "Read RPC service quota guardrail",
    maturity: "live",
    description:
      "Reads the inherited, configured, and effective hourly ceiling for a workspace RPC or gRPC service.",
  },
  {
    method: "PUT",
    path: "/api/v1/developer/services/{id}/quota-guardrail",
    title: "Update RPC service quota guardrail",
    maturity: "live",
    description:
      "Lets an owner or administrator atomically reduce a service ceiling and set its warning threshold.",
  },
  {
    method: "GET",
    path: "/api/v1/platform/whoami",
    title: "Resolve API key identity",
    maturity: "live",
    description:
      "Authenticates a Nodezuno API key and returns its workspace identity and assigned scopes.",
  },
  {
    method: "OPTIONS",
    path: "/api/v1/rpc/{serviceId}",
    title: "Preflight browser JSON-RPC",
    maturity: "beta",
    description:
      "Allows a browser preflight only for an exact HTTPS origin stored on the RPC service.",
  },
  {
    method: "POST",
    path: "/api/v1/rpc/{serviceId}",
    title: "Invoke multi-chain JSON-RPC",
    maturity: "beta",
    description:
      "Invokes a workspace-owned Ethereum, Base, or Solana RPC beta service through bounded, chain-policy-filtered, quota-enforced JSON-RPC 2.0 routing.",
  },
];

export const publicOpenApiDocument = {
  openapi: "3.1.0",
  "x-nodezuno-audience": "customer",
  info: {
    title: "Nodezuno website API",
    version: "1.0.0",
    summary:
      "The Nodezuno website, developer control plane, and multi-chain RPC beta API.",
    description:
      "These contracts operate Nodezuno.com accounts, developer workspaces, service records, API-key identity, and the explicitly beta Ethereum, Base, and Solana JSON-RPC gateway. Other blockchain product APIs remain prelaunch.",
  },
  servers: [
    {
      url: "/",
      description: "The current Nodezuno deployment origin.",
    },
  ],
  tags: [
    { name: "Operations" },
    { name: "Catalogs" },
    { name: "Utilities" },
    { name: "Intake" },
    { name: "Stablecoin settlement" },
    { name: "Authentication" },
    { name: "Developer control plane" },
    { name: "Programmatic control plane" },
    { name: "Multi-chain RPC beta" },
  ],
  paths: {
    "/api/v1/live": {
      get: {
        tags: ["Operations"],
        operationId: "getProcessLiveness",
        summary: "Check process liveness",
        responses: {
          "200": {
            description: "The website process can answer HTTP.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LivenessEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/v1/ready": {
      get: {
        tags: ["Operations"],
        operationId: "getWebsiteReadiness",
        summary: "Check website-backend readiness",
        responses: {
          "200": {
            description: "The website backend is ready.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ReadinessEnvelope",
                },
              },
            },
          },
          "503": {
            description: "The website backend is not ready.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ReadinessEnvelope",
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/health": {
      get: {
        tags: ["Operations"],
        operationId: "getWebsiteHealth",
        summary: "Check website-backend readiness through the legacy alias",
        responses: {
          "200": {
            description: "The website backend is healthy.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthEnvelope" },
              },
            },
          },
          "503": problemResponse,
        },
      },
    },
    "/api/v1/status": {
      get: {
        tags: ["Catalogs"],
        operationId: "getPublicStatus",
        summary: "Read current platform and product status",
        responses: {
          "200": {
            description: "Published status services and incidents.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/PublicStatusEnvelope",
                },
              },
            },
          },
          "503": problemResponse,
        },
      },
    },
    "/api/v1/chains": {
      get: {
        tags: ["Catalogs"],
        operationId: "listChains",
        summary: "List the public chain plan",
        parameters: [
          {
            in: "query",
            name: "q",
            schema: { type: "string", maxLength: 100 },
            description: "Case-insensitive name or slug filter.",
          },
          {
            in: "query",
            name: "family",
            schema: { type: "string", maxLength: 40 },
            description: "Exact execution-family filter.",
          },
        ],
        responses: {
          "200": {
            description: "A filtered chain catalog.",
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: true },
              },
            },
          },
          "400": problemResponse,
          "503": problemResponse,
        },
      },
    },
    "/api/v1/abuse-challenge": {
      get: {
        tags: ["Intake"],
        operationId: "issueAbuseChallenge",
        summary: "Issue a browser form challenge",
        parameters: [
          {
            in: "query",
            name: "purpose",
            required: true,
            schema: {
              type: "string",
              enum: ["submission", "newsletter"],
            },
          },
        ],
        responses: {
          "200": {
            description: "A short-lived challenge and difficulty.",
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: true },
              },
            },
          },
          "400": problemResponse,
          "403": problemResponse,
          "503": problemResponse,
        },
      },
    },
    "/api/v1/gas-estimate": {
      post: {
        tags: ["Utilities"],
        operationId: "calculateGasEstimate",
        summary: "Calculate a bounded EVM gas estimate",
        description:
          "Requires a same-origin browser request. The caller supplies the native asset price; Nodezuno does not treat it as market data.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/GasEstimateInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "A deterministic calculation result.",
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: true },
              },
            },
          },
          "400": problemResponse,
          "403": problemResponse,
          "413": problemResponse,
          "415": problemResponse,
          "422": problemResponse,
          "503": problemResponse,
        },
      },
    },
    "/api/v1/submissions": {
      post: {
        tags: ["Intake"],
        operationId: "createPublicSubmission",
        summary: "Send a customer request to Nodezuno",
        description:
          "Same-origin browser requests only. Requires an Idempotency-Key and a solved first-party submission challenge. Reusing the key with identical details returns the original receipt; changing the details returns a conflict. Do not include credentials, private keys, or confidential source code.",
        parameters: [
          {
            in: "header",
            name: "Idempotency-Key",
            required: true,
            schema: { type: "string", minLength: 16, maxLength: 128 },
          },
          {
            in: "header",
            name: "X-Nodezuno-Challenge",
            required: true,
            schema: { type: "string", minLength: 1, maxLength: 256 },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SubmissionInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "An identical idempotent replay returned its receipt.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SubmissionReceipt" },
              },
            },
          },
          "201": {
            description: "The request was stored for follow-up.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SubmissionReceipt" },
              },
            },
          },
          "202": {
            description: "The request was accepted for processing.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SubmissionReceipt" },
              },
            },
          },
          "400": problemResponse,
          "403": problemResponse,
          "409": problemResponse,
          "413": problemResponse,
          "415": problemResponse,
          "422": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
    },
    "/api/v1/newsletter/subscriptions": {
      post: {
        tags: ["Intake"],
        operationId: "subscribeToNewsletter",
        summary: "Request a Nodezuno Signal subscription",
        description:
          "Same-origin browser requests only. Requires a solved first-party newsletter challenge and explicit consent. The response is intentionally generic; when confirmation is needed, an email is queued for double opt-in.",
        parameters: [
          {
            in: "header",
            name: "X-Nodezuno-Challenge",
            required: true,
            schema: { type: "string", minLength: 1, maxLength: 256 },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/NewsletterInput" },
            },
          },
        },
        responses: {
          "202": {
            description:
              "Accepted with a privacy-preserving generic response.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/NewsletterReceipt" },
              },
            },
          },
          "400": problemResponse,
          "403": problemResponse,
          "413": problemResponse,
          "415": problemResponse,
          "422": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
    },
    "/api/v1/newsletter/confirm": {
      post: {
        tags: ["Intake"],
        operationId: "confirmNewsletterSubscription",
        summary: "Confirm a newsletter subscription",
        description:
          "Accepts JSON or an HTML form post from the emailed confirmation link. Confirmation tokens are private, expiring, and single-purpose. Form posts redirect to the confirmation result page.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/NewsletterTokenInput" },
            },
            "application/x-www-form-urlencoded": {
              schema: { $ref: "#/components/schemas/NewsletterTokenInput" },
            },
          },
        },
        responses: {
          "200": {
            description:
              "The token was evaluated; state explains whether the subscription was confirmed, expired, or replaced.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/NewsletterConfirmation" },
              },
            },
          },
          "303": {
            description:
              "An HTML form request was redirected to the confirmation result page.",
            headers: {
              Location: { schema: { type: "string", format: "uri-reference" } },
            },
          },
          "400": problemResponse,
          "403": problemResponse,
          "413": problemResponse,
          "415": problemResponse,
          "422": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
    },
    "/api/v1/newsletter/unsubscribe": {
      post: {
        tags: ["Intake"],
        operationId: "unsubscribeFromNewsletter",
        summary: "Unsubscribe from Nodezuno Signal",
        description:
          "Accepts JSON or an HTML form post from a private unsubscribe link. The response does not reveal whether an email address matched an active subscription. Form posts redirect to the unsubscribe result page.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/NewsletterTokenInput" },
            },
            "application/x-www-form-urlencoded": {
              schema: { $ref: "#/components/schemas/NewsletterTokenInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "The request completed with a generic confirmation.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/NewsletterUnsubscribeReceipt" },
              },
            },
          },
          "303": {
            description:
              "An HTML form request was redirected to the unsubscribe result page.",
            headers: {
              Location: { schema: { type: "string", format: "uri-reference" } },
            },
          },
          "400": problemResponse,
          "403": problemResponse,
          "413": problemResponse,
          "415": problemResponse,
          "422": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
    },
    "/api/v1/auth/providers": {
      get: {
        tags: ["Authentication"],
        operationId: "getAuthenticationProviders",
        summary: "Read configured account methods",
        responses: {
          "200": {
            description: "Authentication method availability.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AuthProvidersEnvelope",
                },
              },
            },
          },
          "503": problemResponse,
        },
      },
    },
    "/api/v1/auth/session": {
      get: {
        tags: ["Authentication"],
        operationId: "getAuthenticationSession",
        summary: "Read the current safe account identity",
        responses: {
          "200": {
            description: "The current account identity or null.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AuthSessionEnvelope",
                },
              },
            },
          },
          "503": problemResponse,
        },
      },
    },
    "/api/v1/account/export": {
      post: {
        tags: ["Authentication"],
        operationId: "downloadAccountData",
        summary: "Download a bounded private account export",
        description:
          "Requires a fresh Nodezuno application session and a same-origin browser request. Hosted ChatGPT identity is not accepted. The response is limited to the caller's account, own memberships, authorized workspace resources, redacted sessions, redacted audit and usage metadata, account-owned submissions and review orders, and caller-owned Ethereum payment instructions, claims, reconciliation outcomes, and confirmations. Provider credentials, passwords, session credentials, API-key material, stored digests, network addresses, user agents, service configuration, audit details, submission security metadata, RPC endpoint configuration, worker leases, and other tenants are excluded. Owner-only key and audit visibility remains role-scoped. Limited to three downloads per account each hour.",
        "x-nodezuno-auth": "fresh-application-session",
        responses: {
          "200": {
            description:
              "A private JSON attachment no larger than 1 MiB.",
            headers: {
              "Cache-Control": {
                schema: {
                  type: "string",
                  const:
                    "private, no-store, max-age=0, must-revalidate",
                },
              },
              "Content-Disposition": {
                schema: {
                  type: "string",
                  pattern:
                    '^attachment; filename="nodezuno-account-export-\\d{4}-\\d{2}-\\d{2}\\.json"$',
                },
              },
              "X-RateLimit-Limit": {
                schema: { type: "integer", const: 3 },
              },
              "X-RateLimit-Remaining": {
                schema: { type: "integer", minimum: 0, maximum: 2 },
              },
            },
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AccountDataExportEnvelope",
                },
              },
            },
          },
          "401": {
            ...problemResponse,
            description:
              "A Nodezuno application session is missing or no longer valid. Hosted identity does not satisfy this operation.",
          },
          "403": {
            ...problemResponse,
            description:
              "The request is cross-origin or the application session is not fresh.",
          },
          "429": problemResponse,
          "503": problemResponse,
        },
      },
    },
    "/api/v1/developer/workspace": {
      get: {
        tags: ["Developer control plane"],
        operationId: "getDeveloperWorkspace",
        summary: "Read the signed-in developer workspace",
        description:
          "Requires a Nodezuno account session. A signed-in user without a workspace receives workspace: null.",
        "x-nodezuno-auth": "application-session",
        responses: {
          "200": {
            description: "The current workspace or a null workspace.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeveloperWorkspaceEnvelope",
                },
              },
            },
          },
          "401": problemResponse,
          "503": problemResponse,
        },
      },
      post: {
        tags: ["Developer control plane"],
        operationId: "createDeveloperWorkspace",
        summary: "Create a self-service developer workspace",
        description:
          "Requires a Nodezuno account session and a same-origin browser request. Repeated calls return the existing owned workspace.",
        "x-nodezuno-auth": "application-session",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: { type: "string", minLength: 2, maxLength: 80 },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "A workspace and owner membership were created.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeveloperWorkspaceMutationEnvelope",
                },
              },
            },
          },
          "200": {
            description: "The existing owned workspace.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeveloperWorkspaceMutationEnvelope",
                },
              },
            },
          },
          "400": problemResponse,
          "401": problemResponse,
          "403": problemResponse,
          "413": problemResponse,
          "415": problemResponse,
          "422": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
    },
    "/api/v1/developer/workspace/members": {
      get: {
        tags: ["Developer control plane"],
        operationId: "listDeveloperWorkspaceMembers",
        summary: "List workspace members",
        description:
          "Returns up to 100 owner, administrator, and developer memberships. A pending email membership becomes active when a Nodezuno account with that verified email exists.",
        "x-nodezuno-auth": "application-session",
        "x-nodezuno-roles": ["owner", "admin", "developer"],
        responses: {
          "200": {
            description: "The workspace membership collection.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeveloperWorkspaceMemberListEnvelope",
                },
              },
            },
          },
          "401": problemResponse,
          "403": problemResponse,
          "409": problemResponse,
          "503": problemResponse,
        },
      },
      post: {
        tags: ["Developer control plane"],
        operationId: "inviteDeveloperWorkspaceMember",
        summary: "Grant a verified email workspace access",
        description:
          "Requires a same-origin owner or administrator session. Owners can grant administrator or developer access. Administrators can grant developer access only. This endpoint stores the membership but does not claim that an invitation email was delivered.",
        "x-nodezuno-auth": "application-session",
        "x-nodezuno-roles": ["owner", "admin"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/DeveloperWorkspaceMemberInvite",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "A new workspace membership was stored.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeveloperWorkspaceMemberMutationEnvelope",
                },
              },
            },
          },
          "200": {
            description:
              "An identical existing membership was returned without duplication.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeveloperWorkspaceMemberMutationEnvelope",
                },
              },
            },
          },
          "400": problemResponse,
          "401": problemResponse,
          "403": problemResponse,
          "409": problemResponse,
          "413": problemResponse,
          "415": problemResponse,
          "422": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
    },
    "/api/v1/developer/workspace/members/{id}": {
      put: {
        tags: ["Developer control plane"],
        operationId: "updateDeveloperWorkspaceMemberRole",
        summary: "Change a non-owner workspace role",
        description:
          "Requires a same-origin workspace owner session. The owner membership and the current actor are protected from this mutation.",
        "x-nodezuno-auth": "application-session",
        "x-nodezuno-roles": ["owner"],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/DeveloperWorkspaceMemberRoleUpdate",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "The updated membership.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeveloperWorkspaceMemberEnvelope",
                },
              },
            },
          },
          "400": problemResponse,
          "401": problemResponse,
          "403": problemResponse,
          "404": problemResponse,
          "409": problemResponse,
          "413": problemResponse,
          "415": problemResponse,
          "422": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
      delete: {
        tags: ["Developer control plane"],
        operationId: "removeDeveloperWorkspaceMember",
        summary: "Remove a non-owner workspace member",
        description:
          "Requires a same-origin owner or administrator session. Administrators can remove developers only. Owners cannot be removed, and actors cannot remove themselves.",
        "x-nodezuno-auth": "application-session",
        "x-nodezuno-roles": ["owner", "admin"],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "The removed membership metadata.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeveloperWorkspaceMemberEnvelope",
                },
              },
            },
          },
          "400": problemResponse,
          "401": problemResponse,
          "403": problemResponse,
          "404": problemResponse,
          "409": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
    },
    "/api/v1/developer/workspace/audit-events": {
      get: {
        tags: ["Developer control plane"],
        operationId: "listDeveloperAuditEvents",
        summary: "Read the workspace audit trail",
        description:
          "Requires an authenticated workspace owner or administrator. Results use stable descending cursor pagination. Detail fields are selected from an action-specific allowlist, unknown action details are empty, and workspace IDs, API-key secrets, secret hashes, RPC payloads, and policy values are never returned.",
        "x-nodezuno-auth": "application-session",
        "x-nodezuno-roles": ["owner", "admin"],
        parameters: [
          {
            in: "query",
            name: "limit",
            required: false,
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              default: 25,
            },
          },
          {
            in: "query",
            name: "cursor",
            required: false,
            schema: {
              type: "string",
              minLength: 1,
              maxLength: 128,
              pattern: "^[A-Za-z0-9_-]+$",
            },
            description:
              "Opaque cursor from the preceding page. It is pagination state, not an authorization credential.",
          },
        ],
        responses: {
          "200": {
            description: "One redacted page of workspace audit events.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeveloperAuditPageEnvelope",
                },
              },
            },
          },
          "400": problemResponse,
          "401": problemResponse,
          "403": problemResponse,
          "409": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
    },
    "/api/v1/developer/api-keys": {
      get: {
        tags: ["Developer control plane"],
        operationId: "listDeveloperApiKeys",
        summary: "List API key metadata",
        description:
          "Requires an authenticated owner or administrator. Plaintext key secrets and stored digests are never returned.",
        "x-nodezuno-auth": "application-session",
        responses: {
          "200": {
            description: "Up to 100 API key metadata records.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeveloperApiKeyListEnvelope",
                },
              },
            },
          },
          "401": problemResponse,
          "403": problemResponse,
          "409": problemResponse,
          "503": problemResponse,
        },
      },
      post: {
        tags: ["Developer control plane"],
        operationId: "createDeveloperApiKey",
        summary: "Create a one-time developer API key",
        description:
          "Requires an authenticated workspace owner or administrator and a same-origin browser request. A service binding receives exactly its callable least-privilege scope: rpc:invoke for an Ethereum, Base, or Solana RPC service, grpc:invoke for an Ethereum gRPC service, or platform:identity for the platform API. An unbound key defaults to platform:identity and can instead receive exactly services:manage for programmatic service automation. An optional explicit scopes array must contain exactly one compatible scope. The secret is returned only in this response and cannot be recovered.",
        "x-nodezuno-auth": "application-session",
        parameters: [
          {
            in: "header",
            name: "Idempotency-Key",
            required: true,
            schema: {
              type: "string",
              minLength: 16,
              maxLength: 128,
              pattern: "^[A-Za-z0-9._:-]+$",
            },
            description:
              "Reuse only for an exact retry of the same input. A replay never returns or mints another plaintext secret.",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["name"],
                properties: {
                  name: { type: "string", minLength: 2, maxLength: 60 },
                  serviceId: {
                    type: ["string", "null"],
                    format: "uuid",
                    description:
                      "Optional service binding. Omit or send null for a platform:identity or services:manage key.",
                  },
                  scopes: {
                    type: ["array", "null"],
                    minItems: 1,
                    maxItems: 1,
                    uniqueItems: true,
                    description:
                      "Optional explicit least-privilege scope. When omitted, Nodezuno derives the default scope compatible with serviceId.",
                    items: {
                      type: "string",
                      enum: [
                        "platform:identity",
                        "services:manage",
                        "rpc:invoke",
                        "grpc:invoke",
                      ],
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description:
              "The API key metadata and its one-time plaintext secret.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeveloperApiKeyCreateEnvelope",
                },
              },
            },
          },
          "400": problemResponse,
          "401": problemResponse,
          "403": problemResponse,
          "409": {
            ...problemResponse,
            description:
              "The active key limit was reached, the Idempotency-Key was reused with different input, or the same key already issued a one-time secret. Refresh and revoke that key if the secret was lost.",
          },
          "413": problemResponse,
          "415": problemResponse,
          "422": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
    },
    "/api/v1/developer/api-keys/{id}": {
      delete: {
        tags: ["Developer control plane"],
        operationId: "revokeDeveloperApiKey",
        summary: "Revoke an API key",
        description:
          "Requires an authenticated workspace owner or administrator and a same-origin browser request.",
        "x-nodezuno-auth": "application-session",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "The revoked API key metadata.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeveloperApiKeyMutationEnvelope",
                },
              },
            },
          },
          "400": problemResponse,
          "401": problemResponse,
          "403": problemResponse,
          "404": problemResponse,
          "409": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
    },
    "/api/v1/developer/api-keys/{id}/rotate": {
      post: {
        tags: ["Developer control plane"],
        operationId: "rotateDeveloperApiKey",
        summary: "Atomically rotate an active API key",
        description:
          "Requires an authenticated workspace owner or administrator and a same-origin browser request. The source must be active, unexpired, and bound only to an available service. The replacement preserves the source service binding and exact least-privilege scope, can preserve or replace its name, and is inserted before the source is revoked in one database batch. Rotation works at the active-key limit. The replacement secret is returned exactly once and cannot be recovered.",
        "x-nodezuno-auth": "application-session",
        "x-nodezuno-roles": ["owner", "admin"],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            in: "header",
            name: "Idempotency-Key",
            required: true,
            schema: {
              type: "string",
              minLength: 16,
              maxLength: 128,
              pattern: "^[A-Za-z0-9._:-]+$",
            },
            description:
              "Reuse only for an exact retry. A replay never returns or mints another replacement secret.",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: {
                    type: ["string", "null"],
                    minLength: 2,
                    maxLength: 60,
                    description:
                      "Omit or send null to preserve the source key name.",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description:
              "The replacement key metadata and its one-time plaintext secret. The source key is already revoked.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeveloperApiKeyCreateEnvelope",
                },
              },
            },
          },
          "400": problemResponse,
          "401": problemResponse,
          "403": problemResponse,
          "404": problemResponse,
          "409": {
            ...problemResponse,
            description:
              "The source is inactive, the key limit blocks replacement, the Idempotency-Key was reused with changed input, or this exact request already issued its one-time secret.",
          },
          "413": problemResponse,
          "415": problemResponse,
          "422": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
    },
    "/api/v1/developer/services": {
      get: {
        tags: ["Developer control plane"],
        operationId: "listDeveloperServices",
        summary: "List workspace services",
        description:
          "Returns live platform resources, reconciled Ethereum, Base, and Solana RPC Lab services, native Ethereum gRPC Lab services, structured Chain Launch Cloud project briefs, and other saved prelaunch configurations.",
        "x-nodezuno-auth": "application-session",
        responses: {
          "200": {
            description: "The workspace service collection.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeveloperServiceListEnvelope",
                },
              },
            },
          },
          "401": problemResponse,
          "403": problemResponse,
          "409": problemResponse,
          "503": problemResponse,
        },
      },
      post: {
        tags: ["Developer control plane"],
        operationId: "createDeveloperService",
        summary: "Create or configure a service",
        description:
          "The platform-api product becomes active immediately. An rpc-api service for Ethereum or Base becomes active only after the configured upstream verifies the expected mainnet chain ID. A Solana rpc-api service also requires the canonical mainnet-beta genesis hash and a bounded successful getHealth probe. An Ethereum grpc-api service becomes active only when the shared gateway reports same-process service, upstream, and private-control-plane readiness. A rollups product records a structured Chain Launch Cloud design-partner project for one supported stack and remains configuration_saved with no endpoint. Saving it does not provision infrastructure.",
        "x-nodezuno-auth": "application-session",
        parameters: [
          {
            in: "header",
            name: "Idempotency-Key",
            required: true,
            schema: {
              type: "string",
              minLength: 16,
              maxLength: 128,
              pattern: "^[A-Za-z0-9._:-]+$",
            },
            description:
              "Reuse only for an exact retry of the same normalized service input. The original durable service is replayed for 24 hours.",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/DeveloperServiceInput",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "The durable service record.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeveloperServiceMutationEnvelope",
                },
              },
            },
          },
          "400": problemResponse,
          "401": problemResponse,
          "403": problemResponse,
          "409": {
            ...problemResponse,
            description:
              "The service limit was reached or the Idempotency-Key was reused with different input.",
          },
          "413": problemResponse,
          "415": problemResponse,
          "422": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
    },
    "/api/v1/developer/services/{id}": {
      get: {
        tags: ["Developer control plane"],
        operationId: "getDeveloperService",
        summary: "Read an active workspace service",
        description:
          "Requires an authenticated workspace owner, administrator, or developer. The tenant-scoped record is returned with current RPC or gRPC operator readiness reconciled. Missing, archived, and cross-workspace identifiers receive the same not-found response.",
        "x-nodezuno-auth": "application-session",
        "x-nodezuno-roles": ["owner", "admin", "developer"],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "The current tenant-scoped service record.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeveloperServiceMutationEnvelope",
                },
              },
            },
          },
          "400": problemResponse,
          "401": problemResponse,
          "403": problemResponse,
          "404": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
      patch: {
        tags: ["Developer control plane"],
        operationId: "updateDeveloperService",
        summary: "Rename an active workspace service",
        description:
          "Requires an authenticated workspace member and a same-origin browser request. Only the display name is mutable. The update succeeds only when updatedAt exactly matches the current service snapshot, then advances updatedAt and records a redacted service.updated audit event.",
        "x-nodezuno-auth": "application-session",
        "x-nodezuno-roles": ["owner", "admin", "developer"],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/DeveloperServiceUpdate",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "The renamed service record.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeveloperServiceMutationEnvelope",
                },
              },
            },
          },
          "400": problemResponse,
          "401": problemResponse,
          "403": problemResponse,
          "404": problemResponse,
          "409": {
            ...problemResponse,
            description:
              "The service changed after the supplied updatedAt snapshot. Reload before saving.",
          },
          "413": problemResponse,
          "415": problemResponse,
          "422": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
      delete: {
        tags: ["Developer control plane"],
        operationId: "archiveDeveloperService",
        summary: "Archive a workspace service",
        "x-nodezuno-auth": "application-session",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "The archived service record.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeveloperServiceMutationEnvelope",
                },
              },
            },
          },
          "400": problemResponse,
          "401": problemResponse,
          "403": problemResponse,
          "404": problemResponse,
          "409": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
    },
    "/api/v1/control-plane/services": {
      get: {
        tags: ["Programmatic control plane"],
        operationId: "listServicesByApiKey",
        summary: "List workspace services with an API key",
        description:
          "Requires an active, unbound Nodezuno API key carrying exactly services:manage. The key and workspace are revalidated in the database before tenant-scoped service records are returned.",
        security: [{ developerApiKey: [] }],
        "x-nodezuno-required-scope": "services:manage",
        responses: {
          "200": {
            description:
              "The workspace service collection with current operator-attachment readiness reconciled.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeveloperServiceListEnvelope",
                },
              },
            },
          },
          "401": problemResponse,
          "403": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
      post: {
        tags: ["Programmatic control plane"],
        operationId: "createServiceByApiKey",
        summary: "Create or configure a service with an API key",
        description:
          "Requires an active, unbound services:manage key. Uses the same validation, service limits, chain-specific node verification, durable idempotency namespace, and audit trail as browser-console creation. The authorizing API-key identifier is recorded in the audit event, never its secret or digest.",
        security: [{ developerApiKey: [] }],
        "x-nodezuno-required-scope": "services:manage",
        parameters: [
          {
            in: "header",
            name: "Idempotency-Key",
            required: true,
            schema: {
              type: "string",
              minLength: 16,
              maxLength: 128,
              pattern: "^[A-Za-z0-9._:-]+$",
            },
            description:
              "Reuse only for an exact retry of the same normalized service input. The original durable service is replayed for 24 hours.",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/DeveloperServiceInput",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "The durable tenant-scoped service record.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeveloperServiceMutationEnvelope",
                },
              },
            },
          },
          "400": problemResponse,
          "401": problemResponse,
          "403": problemResponse,
          "409": {
            ...problemResponse,
            description:
              "The service limit was reached or the Idempotency-Key was reused with different input.",
          },
          "413": problemResponse,
          "415": problemResponse,
          "422": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
    },
    "/api/v1/control-plane/services/{id}": {
      get: {
        tags: ["Programmatic control plane"],
        operationId: "getServiceByApiKey",
        summary: "Read a workspace service with an API key",
        description:
          "Requires an active, unbound services:manage key. The key and workspace are revalidated in the database before one tenant-scoped record is returned with current RPC or gRPC operator readiness reconciled. Missing, archived, and cross-workspace identifiers receive the same not-found response.",
        security: [{ developerApiKey: [] }],
        "x-nodezuno-required-scope": "services:manage",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "The current tenant-scoped service record.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeveloperServiceMutationEnvelope",
                },
              },
            },
          },
          "400": problemResponse,
          "401": problemResponse,
          "403": problemResponse,
          "404": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
      patch: {
        tags: ["Programmatic control plane"],
        operationId: "updateServiceByApiKey",
        summary: "Rename a workspace service with an API key",
        description:
          "Requires an active, unbound services:manage key. Only the display name is mutable. The tenant-scoped update succeeds when updatedAt exactly matches, records the authorizing API-key identifier, and never stores a credential or service name in audit detail.",
        security: [{ developerApiKey: [] }],
        "x-nodezuno-required-scope": "services:manage",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/DeveloperServiceUpdate",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "The renamed tenant-scoped service record.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeveloperServiceMutationEnvelope",
                },
              },
            },
          },
          "400": problemResponse,
          "401": problemResponse,
          "403": problemResponse,
          "404": problemResponse,
          "409": {
            ...problemResponse,
            description:
              "The service changed after the supplied updatedAt snapshot. Reload before saving.",
          },
          "413": problemResponse,
          "415": problemResponse,
          "422": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
      delete: {
        tags: ["Programmatic control plane"],
        operationId: "archiveServiceByApiKey",
        summary: "Archive a workspace service with an API key",
        description:
          "Requires an active, unbound services:manage key. The service lookup and archival mutation are constrained to the key's workspace, and the authorizing API-key identifier is retained in the redacted audit trail.",
        security: [{ developerApiKey: [] }],
        "x-nodezuno-required-scope": "services:manage",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "The archived service record.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeveloperServiceMutationEnvelope",
                },
              },
            },
          },
          "400": problemResponse,
          "401": problemResponse,
          "403": problemResponse,
          "404": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
    },
    "/api/v1/control-plane/services/{id}/usage": {
      get: {
        tags: ["Programmatic control plane"],
        operationId: "getServiceUsageByApiKey",
        summary: "Read an RPC service usage window with an API key",
        description:
          "Requires an active, unbound services:manage key. Returns the same fixed-size, zero-filled, tenant-scoped usage, quota, traffic, latency, and non-secret per-key aggregates as the signed-in console. RPC bodies, parameters, results, key secrets, and secret hashes are never retained or returned.",
        security: [{ developerApiKey: [] }],
        "x-nodezuno-required-scope": "services:manage",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            in: "query",
            name: "window",
            required: false,
            schema: {
              type: "string",
              enum: ["24h", "7d", "30d"],
              default: "24h",
            },
          },
        ],
        responses: {
          "200": {
            description: "The tenant-scoped RPC usage report.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeveloperRpcUsageEnvelope",
                },
              },
            },
          },
          "400": problemResponse,
          "401": problemResponse,
          "403": problemResponse,
          "404": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
    },
    "/api/v1/control-plane/services/{id}/rpc-access-policy": {
      get: {
        tags: ["Programmatic control plane"],
        operationId: "getServiceAccessPolicyByApiKey",
        summary: "Read an RPC access policy with an API key",
        description:
          "Requires an active, unbound services:manage key. Returns revision 0 with empty lists until a policy is saved, constrained to the key's workspace.",
        security: [{ developerApiKey: [] }],
        "x-nodezuno-required-scope": "services:manage",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "The current RPC access policy snapshot.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/RpcAccessPolicyEnvelope",
                },
              },
            },
          },
          "400": problemResponse,
          "401": problemResponse,
          "403": problemResponse,
          "404": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
      put: {
        tags: ["Programmatic control plane"],
        operationId: "updateServiceAccessPolicyByApiKey",
        summary: "Replace an RPC access policy with an API key",
        description:
          "Requires an active, unbound services:manage key. Replaces the complete policy only when revision matches, increments it exactly once, and records the authorizing API-key identifier plus redacted counts in the audit trail. Policy values, key secrets, and secret hashes are not written to audit.",
        security: [{ developerApiKey: [] }],
        "x-nodezuno-required-scope": "services:manage",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/RpcAccessPolicyUpdate",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "The updated RPC access policy snapshot.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/RpcAccessPolicyEnvelope",
                },
              },
            },
          },
          "400": problemResponse,
          "401": problemResponse,
          "403": problemResponse,
          "404": problemResponse,
          "409": {
            ...problemResponse,
            description:
              "The supplied revision is stale. Reload the latest snapshot before retrying.",
          },
          "413": problemResponse,
          "415": problemResponse,
          "422": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
    },
    "/api/v1/control-plane/services/{id}/quota-guardrail": {
      get: {
        tags: ["Programmatic control plane"],
        operationId: "getServiceQuotaGuardrailByApiKey",
        summary: "Read an RPC service quota guardrail with an API key",
        description:
          "Requires an active, unbound services:manage key. Returns the configured override, effective service ceiling, platform workspace ceiling, warning threshold, and optimistic revision for an RPC or native gRPC service in the key's workspace.",
        security: [{ developerApiKey: [] }],
        "x-nodezuno-required-scope": "services:manage",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "The current service quota guardrail.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/RpcServiceGuardrailEnvelope",
                },
              },
            },
          },
          "400": problemResponse,
          "401": problemResponse,
          "403": problemResponse,
          "404": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
      put: {
        tags: ["Programmatic control plane"],
        operationId: "updateServiceQuotaGuardrailByApiKey",
        summary: "Update an RPC service quota guardrail with an API key",
        description:
          "Requires an active, unbound services:manage key. Replaces the configured hourly override and warning threshold only when revision matches. A service override can reduce, but never widen, the platform workspace ceiling.",
        security: [{ developerApiKey: [] }],
        "x-nodezuno-required-scope": "services:manage",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/RpcServiceGuardrailUpdate",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "The updated service quota guardrail.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/RpcServiceGuardrailEnvelope",
                },
              },
            },
          },
          "400": problemResponse,
          "401": problemResponse,
          "403": problemResponse,
          "404": problemResponse,
          "409": {
            ...problemResponse,
            description:
              "The supplied revision is stale or exhausted. Reload before retrying.",
          },
          "413": problemResponse,
          "415": problemResponse,
          "422": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
    },
    "/api/v1/developer/services/{id}/usage": {
      get: {
        tags: ["Developer control plane"],
        operationId: "getDeveloperRpcUsage",
        summary: "Read an RPC service usage window",
        description:
          "Requires an authenticated workspace member. Returns a fixed-size, zero-filled time series plus current-hour quota and per-key aggregates from retained gateway usage buckets. It never stores or returns RPC request bodies, parameters, results, API-key secrets, or secret hashes. The retention window is 35 days.",
        "x-nodezuno-auth": "application-session",
        "x-nodezuno-roles": ["owner", "admin", "developer"],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            in: "query",
            name: "window",
            required: false,
            schema: {
              type: "string",
              enum: ["24h", "7d", "30d"],
              default: "24h",
            },
            description:
              "Uses 1-hour, 6-hour, or 1-day points respectively.",
          },
        ],
        responses: {
          "200": {
            description:
              "The tenant-scoped RPC usage report. The final point can represent a partial interval.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeveloperRpcUsageEnvelope",
                },
              },
            },
          },
          "400": problemResponse,
          "401": problemResponse,
          "403": problemResponse,
          "404": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
    },
    "/api/v1/developer/services/{id}/ai-diagnosis": {
      get: {
        tags: ["Developer control plane"],
        operationId: "getInfrastructureAiDiagnosis",
        summary: "Diagnose infrastructure evidence",
        description:
          "Requires an authenticated workspace member. The default provider applies deterministic rules to allowlisted service state, configuration, and tenant-scoped aggregate usage. It never returns request bodies, parameters, results, API-key metadata, credentials, arbitrary configuration values, or evidence from another workspace. Chain Launch Cloud project briefs receive readiness-only coverage. Unsupported product previews return 409. No external model is called in this release.",
        "x-nodezuno-auth": "application-session",
        "x-nodezuno-roles": ["owner", "admin", "developer"],
        "x-nodezuno-ai-mode": "deterministic",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            in: "query",
            name: "window",
            required: false,
            schema: {
              type: "string",
              enum: ["24h", "7d", "30d"],
              default: "24h",
            },
            description:
              "Selects the retained RPC aggregate window. Chain project readiness reports retain the requested value without claiming runtime coverage.",
          },
        ],
        responses: {
          "200": {
            description:
              "An auditable diagnosis backed only by allowlisted tenant evidence.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AiInfrastructureDiagnosisEnvelope",
                },
              },
            },
          },
          "400": problemResponse,
          "401": problemResponse,
          "403": problemResponse,
          "404": problemResponse,
          "409": {
            ...problemResponse,
            description:
              "The service product is not supported or required RPC evidence is unavailable.",
          },
          "429": problemResponse,
          "503": problemResponse,
        },
      },
    },
    "/api/v1/developer/services/{id}/rpc-access-policy": {
      get: {
        tags: ["Developer control plane"],
        operationId: "getRpcAccessPolicy",
        summary: "Read an RPC service access policy",
        description:
          "Returns revision 0 with empty lists until a policy has been saved. Empty origin, address, and method lists add no transport or method restriction. Empty origins never enable cross-origin browser access.",
        "x-nodezuno-auth": "application-session",
        "x-nodezuno-roles": ["owner", "admin", "developer"],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "The current RPC access policy snapshot.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/RpcAccessPolicyEnvelope",
                },
              },
            },
          },
          "400": problemResponse,
          "401": problemResponse,
          "403": problemResponse,
          "404": problemResponse,
          "409": problemResponse,
          "503": problemResponse,
        },
      },
      put: {
        tags: ["Developer control plane"],
        operationId: "updateRpcAccessPolicy",
        summary: "Replace an RPC service access policy",
        description:
          "Requires an authenticated workspace owner or administrator and a same-origin browser request. The complete policy is replaced only if revision matches the stored snapshot. A successful update increments revision exactly once and writes a redacted audit event containing counts, never policy values.",
        "x-nodezuno-auth": "application-session",
        "x-nodezuno-roles": ["owner", "admin"],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/RpcAccessPolicyUpdate",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "The updated RPC access policy snapshot.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/RpcAccessPolicyEnvelope",
                },
              },
            },
          },
          "400": problemResponse,
          "401": problemResponse,
          "403": problemResponse,
          "404": problemResponse,
          "409": {
            ...problemResponse,
            description:
              "The supplied revision is stale. Reload the latest snapshot before retrying.",
          },
          "413": problemResponse,
          "415": problemResponse,
          "422": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
    },
    "/api/v1/developer/services/{id}/quota-guardrail": {
      get: {
        tags: ["Developer control plane"],
        operationId: "getRpcServiceQuotaGuardrail",
        summary: "Read an RPC service quota guardrail",
        description:
          "Requires an authenticated workspace member. Returns revision 0 with an inherited platform workspace ceiling until an override is saved. RPC and native gRPC services are supported.",
        "x-nodezuno-auth": "application-session",
        "x-nodezuno-roles": ["owner", "admin", "developer"],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "The current service quota guardrail.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/RpcServiceGuardrailEnvelope",
                },
              },
            },
          },
          "400": problemResponse,
          "401": problemResponse,
          "403": problemResponse,
          "404": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
      put: {
        tags: ["Developer control plane"],
        operationId: "updateRpcServiceQuotaGuardrail",
        summary: "Update an RPC service quota guardrail",
        description:
          "Requires a workspace owner or administrator and a same-origin browser request. The configured hourly override and warning threshold are replaced only when revision matches. Null restores inheritance from the platform workspace ceiling.",
        "x-nodezuno-auth": "application-session",
        "x-nodezuno-roles": ["owner", "admin"],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/RpcServiceGuardrailUpdate",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "The updated service quota guardrail.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/RpcServiceGuardrailEnvelope",
                },
              },
            },
          },
          "400": problemResponse,
          "401": problemResponse,
          "403": problemResponse,
          "404": problemResponse,
          "409": {
            ...problemResponse,
            description:
              "The supplied revision is stale or exhausted. Reload before retrying.",
          },
          "413": problemResponse,
          "415": problemResponse,
          "422": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
    },
    "/api/v1/platform/whoami": {
      get: {
        tags: ["Developer control plane"],
        operationId: "getPlatformIdentity",
        summary: "Resolve a developer API key",
        description:
          "Authenticates a developer key and returns its assigned scopes. The platform:identity scope is required for this endpoint.",
        security: [{ developerApiKey: [] }],
        responses: {
          "200": {
            description: "The key and workspace identity.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/PlatformIdentityEnvelope",
                },
              },
            },
          },
          "401": problemResponse,
          "403": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
    },
    "/api/v1/rpc/{serviceId}": {
      options: {
        tags: ["Multi-chain RPC beta"],
        operationId: "preflightJsonRpc",
        summary: "Preflight a browser JSON-RPC request",
        description:
          "Unauthenticated CORS preflight. It reflects only an exact HTTPS origin saved on the requested service, accepts POST only, allows Authorization and Content-Type only, never enables credentials or wildcards, and caches the browser decision for at most 600 seconds.",
        security: [],
        parameters: [
          {
            in: "path",
            name: "serviceId",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            in: "header",
            name: "Origin",
            required: true,
            schema: { type: "string", format: "uri" },
          },
          {
            in: "header",
            name: "Access-Control-Request-Method",
            required: true,
            schema: { type: "string", const: "POST" },
          },
          {
            in: "header",
            name: "Access-Control-Request-Headers",
            required: false,
            schema: {
              type: "string",
              description:
                "A comma-separated subset of Authorization and Content-Type.",
            },
          },
        ],
        responses: {
          "204": {
            description: "The exact browser origin may submit POST requests.",
            headers: {
              "Access-Control-Allow-Origin": {
                schema: { type: "string", format: "uri" },
              },
              "Access-Control-Allow-Methods": {
                schema: { type: "string", const: "POST, OPTIONS" },
              },
              "Access-Control-Allow-Headers": {
                schema: {
                  type: "string",
                  const: "Authorization, Content-Type",
                },
              },
              "Access-Control-Max-Age": {
                schema: { type: "integer", maximum: 600 },
              },
            },
          },
          "403": problemResponse,
          "404": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
      post: {
        tags: ["Multi-chain RPC beta"],
        operationId: "invokeJsonRpc",
        summary: "Invoke an Ethereum, Base, or Solana JSON-RPC service",
        description:
          "Requires a workspace-owned rpc-api service, a chain-verified upstream for that service's Ethereum, Base, or Solana network, and a service-authorized Nodezuno Bearer key carrying rpc:invoke. The persisted exact-origin, client-address, and method policy is enforced before quota. A disallowed batch member fails independently when transport access is valid. Accepts one JSON-RPC 2.0 call or a batch of at most 20 calls. Standard parse and invalid-request errors use codes -32700 and -32600, while valid members of a mixed batch continue independently. Ethereum and Base use an EVM namespace policy that blocks node administration, managed accounts, filter lifecycle, subscriptions, tracing, and unsafe namespaces. Solana uses an explicit platform allowlist and rejects validator administration, airdrop, and unrecognized methods. Expensive reads are bounded and consume method-weighted quota units. Pulse deterministically explores verified retry-safe read routes and ranks them with bounded process-local successful-latency EWMA plus failure and circuit state, with at most two provider attempts. This is adaptive routing, not predictive or machine-learning inference. Transaction submissions, including eth_sendRawTransaction and Solana sendTransaction, use the configured primary and receive exactly one upstream attempt.",
        security: [{ developerApiKey: [] }],
        "x-nodezuno-required-scope": "rpc:invoke",
        "x-nodezuno-networks": ["ethereum", "base", "solana"],
        "x-nodezuno-routing": {
          strategy: "pulse_adaptive_failover",
          stateScope: "process-local",
          safeReads:
            "verified successful-latency EWMA plus failure and circuit state; at most two attempts",
          writes: "configured primary; exactly one attempt",
        },
        "x-nodezuno-chain-verification": {
          ethereum: { method: "eth_chainId", result: "0x1" },
          base: { method: "eth_chainId", result: "0x2105" },
          solana: {
            methods: ["getGenesisHash", "getHealth"],
            genesisHash:
              "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
            healthResult: "ok",
          },
        },
        "x-nodezuno-gateway-error-codes": [
          "rpc_parse_error",
          "rpc_invalid_request",
          "rpc_duplicate_id",
          "rpc_params_out_of_policy",
          "rpc_method_blocked",
          "rpc_origin_not_allowed",
          "rpc_ip_not_allowed",
          "rpc_method_not_allowed",
          "api_key_scope_denied",
          "api_key_service_denied",
          "rpc_upstream_unavailable",
          "rpc_mainnet_upstream_unverified",
          "rpc_quota_exceeded",
          "rpc_upstream_failed",
          "rpc_upstream_timeout",
        ],
        parameters: [
          {
            in: "path",
            name: "serviceId",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/JsonRpcRequestPayload",
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "A JSON-RPC response or ordered batch response. Individual calls can contain JSON-RPC errors.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/JsonRpcResponsePayload",
                },
              },
            },
          },
          "204": {
            description:
              "The request contained only notifications, so no JSON-RPC response body is returned.",
          },
          "400": {
            description:
              "The body could not be parsed as JSON, or no executable member of the request was structurally valid. The response uses JSON-RPC code -32700 or -32600.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/JsonRpcResponsePayload",
                },
              },
            },
          },
          "401": problemResponse,
          "403": {
            description:
              "The API key lacks rpc:invoke, is bound to another service, the request fails the saved exact-origin or client-address policy, or every requested method is blocked by the customer or platform policy. Gateway-generated errors use JSON-RPC code -32003 or -32004.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/JsonRpcResponsePayload",
                },
              },
            },
          },
          "404": problemResponse,
          "413": problemResponse,
          "415": problemResponse,
          "429": {
            description:
              "The per-key service quota, cross-service workspace quota, or admission limit was exceeded. JSON-RPC quota errors use code -32005.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/JsonRpcResponsePayload",
                },
              },
              "application/problem+json": {
                schema: { $ref: "#/components/schemas/Problem" },
              },
            },
          },
          "502": {
            description:
              "A configured upstream returned an unusable transport or JSON-RPC response.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/JsonRpcResponsePayload",
                },
              },
            },
          },
          "503": {
            description:
              "No usable chain-verified upstream is configured for the service network, or a required backend dependency is unavailable. Gateway upstream-availability errors use code -32002.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/JsonRpcResponsePayload",
                },
              },
              "application/problem+json": {
                schema: { $ref: "#/components/schemas/Problem" },
              },
            },
          },
          "504": {
            description: "The attempted upstream timed out.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/JsonRpcResponsePayload",
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/review-orders": {
      post: {
        tags: ["Intake"],
        operationId: "createReviewOrder",
        summary: "Create a fixed-price Upgrade Assurance order",
        description:
          "Same-origin only. Requires Idempotency-Key and a solved first-party browser challenge. Returns the same private capability for an exact idempotent retry.",
        parameters: [
          {
            in: "header",
            name: "Idempotency-Key",
            required: true,
            schema: { type: "string", minLength: 16, maxLength: 128 },
          },
          {
            in: "header",
            name: "X-Nodezuno-Challenge",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ReviewOrderInput" },
            },
          },
        },
        responses: {
          "200": { description: "An exact idempotent retry returned the original application and reproducible private capability." },
          "201": { description: "Application stored and private tracking capability returned." },
          "400": problemResponse,
          "403": problemResponse,
          "409": problemResponse,
          "413": problemResponse,
          "415": problemResponse,
          "422": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
    },
    "/api/v1/review-orders/{id}/access": {
      post: {
        tags: ["Intake"],
        operationId: "exchangeReviewOrderAccess",
        summary: "Exchange a private tracking capability",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["accessToken"],
                properties: {
                  accessToken: { type: "string", minLength: 40, maxLength: 100, writeOnly: true },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Capability exchanged for a scoped private cookie." },
          "401": problemResponse,
          "422": problemResponse,
        },
      },
    },
    "/api/v1/review-orders/{id}": {
      get: {
        tags: ["Intake"],
        operationId: "getReviewOrder",
        summary: "Read an authorized private review order",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": { description: "Safe proposal, payment, and engagement state." },
          "401": problemResponse,
          "404": problemResponse,
        },
      },
    },
    "/api/v1/review-orders/{id}/payment-intents": {
      post: {
        tags: ["Stablecoin settlement"],
        operationId: "createReviewOrderPaymentIntent",
        summary: "Create an exact Ethereum stablecoin payment instruction",
        description:
          "Requires the private review-order cookie, same-origin request, current accepted service terms, and an Idempotency-Key. The server selects the exact amount and recipient. The current Cloudflare profile is manual: a submitted transaction hash is not automatically verified or treated as payment received.",
        "x-nodezuno-auth": "private-review-order-cookie",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            in: "header",
            name: "Idempotency-Key",
            required: true,
            schema: { type: "string", minLength: 16, maxLength: 128 },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/StablecoinPaymentIntentInput",
              },
            },
          },
        },
        responses: {
          "201": {
            description:
              "The immutable payment instruction, current order state, and operator-configured verification mode.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/StablecoinPaymentIntentEnvelope",
                },
              },
            },
          },
          "200": {
            description: "An exact idempotent retry returned its instruction.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/StablecoinPaymentIntentEnvelope",
                },
              },
            },
          },
          "400": problemResponse,
          "401": problemResponse,
          "403": problemResponse,
          "404": problemResponse,
          "409": problemResponse,
          "413": problemResponse,
          "415": problemResponse,
          "422": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
    },
    "/api/v1/review-orders/{id}/payment-intents/{intentId}/claims": {
      post: {
        tags: ["Stablecoin settlement"],
        operationId: "submitReviewOrderTransactionClaim",
        summary: "Submit a transaction hash and Telegram username",
        description:
          "Requires the private review-order cookie and a same-origin request. A transaction claim is customer-provided information, not proof of payment. In the current manual Cloudflare profile, Nodezuno checks it separately and records payment only after an operator confirms the transfer.",
        "x-nodezuno-auth": "private-review-order-cookie",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            in: "path",
            name: "intentId",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/StablecoinPaymentClaimInput",
              },
            },
          },
        },
        responses: {
          "202": {
            description:
              "The claim was recorded for the configured verification workflow.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/StablecoinPaymentClaimEnvelope",
                },
              },
            },
          },
          "400": problemResponse,
          "401": problemResponse,
          "403": problemResponse,
          "404": problemResponse,
          "409": problemResponse,
          "413": problemResponse,
          "415": problemResponse,
          "422": problemResponse,
          "429": problemResponse,
          "503": problemResponse,
        },
      },
    },
    "/api/v1/review-orders/{id}/payment-confirmations/{confirmationId}": {
      get: {
        tags: ["Stablecoin settlement"],
        operationId: "downloadReviewOrderPaymentConfirmation",
        summary: "Download the private payment confirmation record",
        description:
          "Requires the private review-order cookie. Returns a no-store JSON attachment for a payment that has been confirmed. The confirmation is an evidence record, not a tax invoice or custody receipt.",
        "x-nodezuno-auth": "private-review-order-cookie",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            in: "path",
            name: "confirmationId",
            required: true,
            schema: { type: "string", minLength: 16, maxLength: 100 },
          },
        ],
        responses: {
          "200": {
            description: "A private, no-store JSON confirmation attachment.",
            headers: {
              "Cache-Control": {
                schema: { type: "string", const: "private, no-store, max-age=0" },
              },
              "Content-Disposition": {
                schema: { type: "string", pattern: "^attachment; filename=" },
              },
            },
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true,
                  required: ["recordType", "confirmation"],
                  properties: {
                    recordType: {
                      type: "string",
                      const: "Nodezuno Ethereum payment confirmation",
                    },
                    confirmation: {
                      type: "object",
                      additionalProperties: true,
                    },
                  },
                },
              },
            },
          },
          "400": problemResponse,
          "401": problemResponse,
          "404": problemResponse,
          "503": problemResponse,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      developerApiKey: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "nzu_live_<key-id>_<secret>",
        description:
          "A one-time Nodezuno developer key created in the signed-in console.",
      },
    },
    schemas: {
      Problem: problemSchema,
      AuthProvidersEnvelope: {
        type: "object",
        additionalProperties: false,
        required: ["data", "requestId"],
        properties: {
          data: {
            type: "object",
            additionalProperties: false,
            required: ["providers"],
            properties: {
              providers: {
                type: "object",
                additionalProperties: false,
                required: [
                  "email",
                  "emailVerification",
                  "google",
                  "evm",
                  "solana",
                  "evmChainIds",
                ],
                properties: {
                  email: {
                    type: "boolean",
                    description:
                      "True when verified mailbox delivery is configured, or when an explicit loopback-only local preview permits unverified email accounts.",
                  },
                  emailVerification: {
                    type: "boolean",
                    description:
                      "True when mailbox verification and password recovery delivery are configured.",
                  },
                  google: { type: "boolean" },
                  evm: { const: true },
                  solana: { const: true },
                  evmChainIds: {
                    type: "array",
                    items: { type: "integer", minimum: 1 },
                  },
                },
              },
            },
          },
          requestId: { type: "string" },
        },
      },
      AuthSessionEnvelope: {
        type: "object",
        additionalProperties: false,
        required: ["data", "requestId"],
        properties: {
          data: {
            type: "object",
            additionalProperties: false,
            required: ["user"],
            properties: {
              user: {
                oneOf: [
                  {
                    type: "object",
                    additionalProperties: false,
                    required: [
                      "id",
                      "displayName",
                      "contactEmail",
                      "authMethod",
                      "walletAddress",
                    ],
                    properties: {
                      id: { type: ["string", "null"] },
                      displayName: { type: "string" },
                      contactEmail: {
                        type: ["string", "null"],
                        format: "email",
                      },
                      authMethod: {
                        type: "string",
                        enum: [
                          "email",
                          "google",
                          "evm",
                          "solana",
                          "chatgpt",
                        ],
                      },
                      walletAddress: { type: ["string", "null"] },
                    },
                  },
                  { type: "null" },
                ],
              },
            },
          },
          requestId: { type: "string" },
        },
      },
      AccountDataExportEnvelope: {
        type: "object",
        additionalProperties: false,
        required: ["data", "requestId"],
        properties: {
          data: {
            type: "object",
            additionalProperties: false,
            required: [
              "schemaVersion",
              "exportedAt",
              "account",
              "linkedAccounts",
              "wallets",
              "sessions",
              "workspaces",
              "memberships",
              "services",
              "apiKeys",
              "accessPolicies",
              "auditEvents",
              "usage",
              "submissions",
              "reviewOrders",
              "stablecoinPaymentIntents",
              "stablecoinPaymentClaims",
              "stablecoinPaymentReconciliations",
              "stablecoinPaymentConfirmations",
              "bounds",
              "redactions",
            ],
            properties: {
              schemaVersion: { type: "string", const: "5" },
              exportedAt: { type: "string", format: "date-time" },
              account: {
                type: "object",
                additionalProperties: false,
                required: [
                  "id",
                  "name",
                  "email",
                  "emailVerified",
                  "profileImageRecorded",
                  "createdAt",
                  "updatedAt",
                ],
                properties: {
                  id: { type: "string", format: "uuid" },
                  name: { type: "string" },
                  email: {
                    type: ["string", "null"],
                    format: "email",
                  },
                  emailVerified: { type: "boolean" },
                  profileImageRecorded: { type: "boolean" },
                  createdAt: { type: "string", format: "date-time" },
                  updatedAt: { type: "string", format: "date-time" },
                },
              },
              linkedAccounts: {
                type: "array",
                maxItems: 20,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["provider", "linkedAt", "updatedAt"],
                  properties: {
                    provider: { type: "string" },
                    linkedAt: { type: "string", format: "date-time" },
                    updatedAt: { type: "string", format: "date-time" },
                  },
                },
              },
              wallets: {
                type: "object",
                additionalProperties: false,
                required: ["evm", "solana"],
                properties: {
                  evm: {
                    type: "array",
                    maxItems: 50,
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: [
                        "address",
                        "chainId",
                        "primary",
                        "linkedAt",
                      ],
                      properties: {
                        address: { type: "string" },
                        chainId: { type: "integer", minimum: 1 },
                        primary: { type: "boolean" },
                        linkedAt: {
                          type: "string",
                          format: "date-time",
                        },
                      },
                    },
                  },
                  solana: {
                    type: "array",
                    maxItems: 50,
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["address", "primary", "linkedAt"],
                      properties: {
                        address: { type: "string" },
                        primary: { type: "boolean" },
                        linkedAt: {
                          type: "string",
                          format: "date-time",
                        },
                      },
                    },
                  },
                },
              },
              sessions: {
                type: "array",
                maxItems: 50,
                description:
                  "Session identifiers and timestamps only. Authentication credentials, network addresses, and user-agent values are omitted.",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "id",
                    "current",
                    "createdAt",
                    "updatedAt",
                    "expiresAt",
                    "networkAddressRecorded",
                    "userAgentRecorded",
                  ],
                  properties: {
                    id: { type: "string" },
                    current: { type: "boolean" },
                    createdAt: { type: "string", format: "date-time" },
                    updatedAt: { type: "string", format: "date-time" },
                    expiresAt: { type: "string", format: "date-time" },
                    networkAddressRecorded: { type: "boolean" },
                    userAgentRecorded: { type: "boolean" },
                  },
                },
              },
              workspaces: {
                type: "array",
                maxItems: 20,
                items: {
                  type: "object",
                  additionalProperties: true,
                },
              },
              memberships: {
                type: "array",
                maxItems: 20,
                description:
                  "Only the caller's own membership record in each authorized workspace.",
                items: {
                  type: "object",
                  additionalProperties: true,
                },
              },
              services: {
                type: "array",
                maxItems: 200,
                description:
                  "Service metadata only. Stored service configuration is omitted.",
                items: {
                  type: "object",
                  additionalProperties: true,
                },
              },
              apiKeys: {
                type: "array",
                maxItems: 200,
                description:
                  "Owner or administrator visible API-key metadata only. Plaintext key material and stored digests are omitted.",
                items: {
                  type: "object",
                  additionalProperties: true,
                },
              },
              accessPolicies: {
                type: "array",
                maxItems: 200,
                description:
                  "Access-policy revision and item counts without origin, address-range, or method values.",
                items: {
                  type: "object",
                  additionalProperties: true,
                },
              },
              auditEvents: {
                type: "array",
                maxItems: 500,
                description:
                  "Owner or administrator visible event metadata without actor identifiers or detail values.",
                items: {
                  type: "object",
                  additionalProperties: true,
                },
              },
              usage: {
                type: "array",
                maxItems: 500,
                description:
                  "Aggregated workspace usage without request payload or client metadata.",
                items: {
                  type: "object",
                  additionalProperties: true,
                },
              },
              submissions: {
                type: "array",
                maxItems: 50,
                description:
                  "Only submissions linked to the exact authenticated account identifier. Idempotency, request, network, and user-agent metadata are omitted.",
                items: {
                  type: "object",
                  additionalProperties: true,
                },
              },
              reviewOrders: {
                type: "array",
                maxItems: 50,
                description:
                  "Upgrade Assurance applications owned by the exact authenticated account, including the Telegram username supplied with a payment claim when present.",
                items: {
                  type: "object",
                  additionalProperties: true,
                },
              },
              stablecoinPaymentIntents: {
                type: "array",
                maxItems: 100,
                description:
                  "Ethereum stablecoin instruction snapshots owned by the caller, including their exact token amount, public token contract, and public recipient address.",
                items: {
                  type: "object",
                  additionalProperties: true,
                },
              },
              stablecoinPaymentClaims: {
                type: "array",
                maxItems: 100,
                description:
                  "Caller-owned transaction claims, Telegram usernames, public-chain observations, and verification outcomes. RPC endpoint configuration and worker leases are omitted.",
                items: {
                  type: "object",
                  additionalProperties: true,
                },
              },
              stablecoinPaymentReconciliations: {
                type: "array",
                maxItems: 100,
                description:
                  "Caller-owned Ethereum payment reconciliation cases with public-chain evidence and operator identity removed.",
                items: {
                  type: "object",
                  additionalProperties: true,
                },
              },
              stablecoinPaymentConfirmations: {
                type: "array",
                maxItems: 100,
                description:
                  "Immutable Ethereum payment confirmation records owned by the caller.",
                items: {
                  type: "object",
                  additionalProperties: true,
                },
              },
              bounds: {
                type: "object",
                additionalProperties: false,
                required: ["limits", "truncated"],
                properties: {
                  limits: {
                    type: "object",
                    additionalProperties: {
                      type: "integer",
                      minimum: 1,
                      maximum: 500,
                    },
                  },
                  truncated: {
                    type: "object",
                    additionalProperties: { type: "boolean" },
                  },
                },
              },
              redactions: {
                type: "object",
                additionalProperties: false,
                required: [
                  "authenticationCredentials",
                  "apiKeyMaterial",
                  "networkAddresses",
                  "userAgents",
                  "auditDetails",
                  "serviceConfiguration",
                  "submissionSecurityMetadata",
                  "paymentVerificationWorkerLeases",
                  "paymentReconciliationOperatorIdentity",
                  "rpcEndpointConfiguration",
                ],
                properties: {
                  authenticationCredentials: {
                    type: "boolean",
                    const: true,
                  },
                  apiKeyMaterial: { type: "boolean", const: true },
                  networkAddresses: { type: "boolean", const: true },
                  userAgents: { type: "boolean", const: true },
                  auditDetails: { type: "boolean", const: true },
                  serviceConfiguration: {
                    type: "boolean",
                    const: true,
                  },
                  submissionSecurityMetadata: {
                    type: "boolean",
                    const: true,
                  },
                  paymentVerificationWorkerLeases: {
                    type: "boolean",
                    const: true,
                  },
                  paymentReconciliationOperatorIdentity: {
                    type: "boolean",
                    const: true,
                  },
                  rpcEndpointConfiguration: {
                    type: "boolean",
                    const: true,
                  },
                },
              },
            },
          },
          requestId: { type: "string" },
        },
      },
      DeveloperWorkspace: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "slug",
          "name",
          "status",
          "role",
          "createdAt",
          "updatedAt",
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          slug: { type: "string" },
          name: { type: "string" },
          status: {
            type: "string",
            enum: ["active", "suspended", "closed"],
          },
          role: {
            type: "string",
            enum: ["owner", "admin", "developer"],
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      DeveloperWorkspaceMember: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "email",
          "role",
          "state",
          "createdAt",
          "updatedAt",
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          email: {
            type: ["string", "null"],
            format: "email",
          },
          role: {
            type: "string",
            enum: ["owner", "admin", "developer"],
          },
          state: {
            type: "string",
            enum: ["active", "pending"],
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      DeveloperWorkspaceMemberInvite: {
        type: "object",
        additionalProperties: false,
        required: ["email", "role"],
        properties: {
          email: {
            type: "string",
            format: "email",
            maxLength: 254,
          },
          role: {
            type: "string",
            enum: ["admin", "developer"],
          },
        },
      },
      DeveloperWorkspaceMemberRoleUpdate: {
        type: "object",
        additionalProperties: false,
        required: ["role"],
        properties: {
          role: {
            type: "string",
            enum: ["admin", "developer"],
          },
        },
      },
      DeveloperWorkspaceMemberListEnvelope: {
        type: "object",
        additionalProperties: false,
        required: ["data", "requestId"],
        properties: {
          data: {
            type: "object",
            additionalProperties: false,
            required: ["members"],
            properties: {
              members: {
                type: "array",
                maxItems: 100,
                items: {
                  $ref: "#/components/schemas/DeveloperWorkspaceMember",
                },
              },
            },
          },
          requestId: { type: "string" },
        },
      },
      DeveloperWorkspaceMemberMutationEnvelope: {
        type: "object",
        additionalProperties: false,
        required: ["data", "requestId"],
        properties: {
          data: {
            type: "object",
            additionalProperties: false,
            required: ["member", "created"],
            properties: {
              member: {
                $ref: "#/components/schemas/DeveloperWorkspaceMember",
              },
              created: { type: "boolean" },
            },
          },
          requestId: { type: "string" },
        },
      },
      DeveloperWorkspaceMemberEnvelope: {
        type: "object",
        additionalProperties: false,
        required: ["data", "requestId"],
        properties: {
          data: {
            type: "object",
            additionalProperties: false,
            required: ["member"],
            properties: {
              member: {
                $ref: "#/components/schemas/DeveloperWorkspaceMember",
              },
            },
          },
          requestId: { type: "string" },
        },
      },
      DeveloperAuditEvent: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "actor",
          "action",
          "entity",
          "detail",
          "createdAt",
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          actor: {
            type: "object",
            additionalProperties: false,
            required: ["accountId", "email", "apiKeyId"],
            properties: {
              accountId: { type: ["string", "null"] },
              email: {
                type: ["string", "null"],
                format: "email",
              },
              apiKeyId: {
                type: ["string", "null"],
                format: "uuid",
              },
            },
          },
          action: {
            type: "string",
            pattern: "^[a-z_]+\\.[a-z_]+$",
          },
          entity: {
            type: "object",
            additionalProperties: false,
            required: ["type", "id"],
            properties: {
              type: {
                type: "string",
                pattern: "^[a-z_]{1,64}$",
              },
              id: { type: "string", maxLength: 128 },
            },
          },
          detail: {
            type: "object",
            description:
              "Only action-specific non-secret fields are returned. Unknown actions produce an empty object.",
            additionalProperties: true,
          },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      DeveloperAuditPageEnvelope: {
        type: "object",
        additionalProperties: false,
        required: ["data", "requestId"],
        properties: {
          data: {
            type: "object",
            additionalProperties: false,
            required: ["events", "nextCursor"],
            properties: {
              events: {
                type: "array",
                maxItems: 100,
                items: {
                  $ref: "#/components/schemas/DeveloperAuditEvent",
                },
              },
              nextCursor: {
                type: ["string", "null"],
                maxLength: 128,
              },
            },
          },
          requestId: { type: "string" },
        },
      },
      DeveloperApiKeyMetadata: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "name",
          "prefix",
          "lastFour",
          "scopes",
          "serviceId",
          "createdAt",
          "lastUsedAt",
          "expiresAt",
          "revokedAt",
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          prefix: { type: "string", pattern: "^nzu_live_[0-9a-f]{8}$" },
          lastFour: { type: "string", minLength: 4, maxLength: 4 },
          scopes: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "platform:identity",
                "services:manage",
                "rpc:invoke",
                "grpc:invoke",
              ],
            },
          },
          serviceId: {
            type: ["string", "null"],
            format: "uuid",
            description:
              "The only bound callable service, or null for an unbound platform:identity or services:manage key.",
          },
          createdAt: { type: "string", format: "date-time" },
          lastUsedAt: {
            type: ["string", "null"],
            format: "date-time",
          },
          expiresAt: { type: "string", format: "date-time" },
          revokedAt: {
            type: ["string", "null"],
            format: "date-time",
          },
        },
      },
      DeveloperWorkspaceEnvelope: {
        type: "object",
        additionalProperties: false,
        required: ["data", "requestId"],
        properties: {
          data: {
            type: "object",
            additionalProperties: false,
            required: ["workspace"],
            properties: {
              workspace: {
                oneOf: [
                  { $ref: "#/components/schemas/DeveloperWorkspace" },
                  { type: "null" },
                ],
              },
            },
          },
          requestId: { type: "string" },
        },
      },
      DeveloperWorkspaceMutationEnvelope: {
        type: "object",
        additionalProperties: false,
        required: ["data", "requestId"],
        properties: {
          data: {
            type: "object",
            additionalProperties: false,
            required: ["workspace", "created"],
            properties: {
              workspace: {
                $ref: "#/components/schemas/DeveloperWorkspace",
              },
              created: { type: "boolean" },
            },
          },
          requestId: { type: "string" },
        },
      },
      DeveloperApiKeyListEnvelope: {
        type: "object",
        additionalProperties: false,
        required: ["data", "requestId"],
        properties: {
          data: {
            type: "object",
            additionalProperties: false,
            required: ["apiKeys"],
            properties: {
              apiKeys: {
                type: "array",
                items: {
                  $ref: "#/components/schemas/DeveloperApiKeyMetadata",
                },
              },
            },
          },
          requestId: { type: "string" },
        },
      },
      DeveloperApiKeyMutationEnvelope: {
        type: "object",
        additionalProperties: false,
        required: ["data", "requestId"],
        properties: {
          data: {
            type: "object",
            additionalProperties: false,
            required: ["apiKey"],
            properties: {
              apiKey: {
                $ref: "#/components/schemas/DeveloperApiKeyMetadata",
              },
            },
          },
          requestId: { type: "string" },
        },
      },
      DeveloperApiKeyCreateEnvelope: {
        type: "object",
        additionalProperties: false,
        required: ["data", "requestId"],
        properties: {
          data: {
            type: "object",
            additionalProperties: false,
            required: ["apiKey", "secret"],
            properties: {
              apiKey: {
                $ref: "#/components/schemas/DeveloperApiKeyMetadata",
              },
              secret: {
                type: "string",
                pattern:
                  "^nzu_live_[0-9a-f-]{36}_[A-Za-z0-9_-]{43}$",
                description:
                  "Returned once. Store it securely because Nodezuno cannot recover it.",
              },
            },
          },
          requestId: { type: "string" },
        },
      },
      RpcAllowedOrigins: {
        type: "array",
        maxItems: 20,
        uniqueItems: true,
        description:
          "Exact HTTPS origins only. Paths, credentials, queries, fragments, wildcards, and HTTP origins are rejected.",
        items: {
          type: "string",
          format: "uri",
          maxLength: 2048,
        },
      },
      RpcAllowedIpCidrs: {
        type: "array",
        maxItems: 50,
        uniqueItems: true,
        description:
          "Exact IPv4 or IPv6 addresses and CIDR ranges. When configured, a missing trusted client address fails closed.",
        items: { type: "string", maxLength: 128 },
      },
      RpcAllowedMethods: {
        type: "array",
        maxItems: 100,
        uniqueItems: true,
        description:
          "Exact RPC methods that remain available within the platform policy. This list cannot enable a platform-blocked method.",
        items: {
          type: "string",
          minLength: 1,
          maxLength: 128,
          pattern: "^[A-Za-z][A-Za-z0-9_.:-]*$",
        },
      },
      RpcAccessPolicy: {
        type: "object",
        additionalProperties: false,
        required: [
          "allowedOrigins",
          "allowedIpCidrs",
          "allowedMethods",
        ],
        properties: {
          allowedOrigins: {
            $ref: "#/components/schemas/RpcAllowedOrigins",
          },
          allowedIpCidrs: {
            $ref: "#/components/schemas/RpcAllowedIpCidrs",
          },
          allowedMethods: {
            $ref: "#/components/schemas/RpcAllowedMethods",
          },
        },
      },
      RpcAccessPolicyUpdate: {
        type: "object",
        additionalProperties: false,
        required: [
          "revision",
          "allowedOrigins",
          "allowedIpCidrs",
          "allowedMethods",
        ],
        properties: {
          revision: {
            type: "integer",
            minimum: 0,
            maximum: 2147483647,
          },
          allowedOrigins: {
            $ref: "#/components/schemas/RpcAllowedOrigins",
          },
          allowedIpCidrs: {
            $ref: "#/components/schemas/RpcAllowedIpCidrs",
          },
          allowedMethods: {
            $ref: "#/components/schemas/RpcAllowedMethods",
          },
        },
      },
      RpcAccessPolicySnapshot: {
        type: "object",
        additionalProperties: false,
        required: [
          "serviceId",
          "network",
          "revision",
          "policy",
          "updatedAt",
        ],
        properties: {
          serviceId: { type: "string", format: "uuid" },
          network: {
            type: "string",
            enum: ["ethereum", "base", "solana"],
          },
          revision: { type: "integer", minimum: 0 },
          policy: {
            $ref: "#/components/schemas/RpcAccessPolicy",
          },
          updatedAt: {
            type: ["string", "null"],
            format: "date-time",
          },
        },
      },
      RpcAccessPolicyEnvelope: {
        type: "object",
        additionalProperties: false,
        required: ["data", "requestId"],
        properties: {
          data: {
            $ref: "#/components/schemas/RpcAccessPolicySnapshot",
          },
          requestId: { type: "string" },
        },
      },
      RpcServiceGuardrailUpdate: {
        type: "object",
        additionalProperties: false,
        required: [
          "hourlyQuotaLimit",
          "warningThresholdPercent",
          "revision",
        ],
        properties: {
          hourlyQuotaLimit: {
            type: ["integer", "null"],
            minimum: 100,
            maximum: 10000000,
            description:
              "A service-level hourly ceiling, or null to inherit the platform workspace ceiling.",
          },
          warningThresholdPercent: {
            type: "integer",
            minimum: 50,
            maximum: 95,
          },
          revision: {
            type: "integer",
            minimum: 0,
            maximum: 2147483647,
          },
        },
      },
      RpcServiceGuardrailSnapshot: {
        type: "object",
        additionalProperties: false,
        required: [
          "serviceId",
          "product",
          "network",
          "hourlyQuotaLimit",
          "effectiveHourlyQuotaLimit",
          "platformWorkspaceHourlyQuotaLimit",
          "warningThresholdPercent",
          "revision",
          "inherited",
          "updatedAt",
        ],
        properties: {
          serviceId: { type: "string", format: "uuid" },
          product: {
            type: "string",
            enum: ["rpc-api", "grpc-api"],
          },
          network: {
            type: "string",
            enum: ["ethereum", "base", "solana"],
          },
          hourlyQuotaLimit: {
            type: ["integer", "null"],
            minimum: 100,
            maximum: 10000000,
          },
          effectiveHourlyQuotaLimit: {
            type: "integer",
            minimum: 100,
            maximum: 10000000,
            description:
              "The lower of the configured service override and the platform workspace ceiling.",
          },
          platformWorkspaceHourlyQuotaLimit: {
            type: "integer",
            minimum: 100,
            maximum: 10000000,
          },
          warningThresholdPercent: {
            type: "integer",
            minimum: 50,
            maximum: 95,
          },
          revision: { type: "integer", minimum: 0 },
          inherited: { type: "boolean" },
          updatedAt: {
            type: ["string", "null"],
            format: "date-time",
          },
        },
      },
      RpcServiceGuardrailEnvelope: {
        type: "object",
        additionalProperties: false,
        required: ["data", "requestId"],
        properties: {
          data: {
            $ref: "#/components/schemas/RpcServiceGuardrailSnapshot",
          },
          requestId: { type: "string" },
        },
      },
      DeveloperServiceInput: {
        type: "object",
        additionalProperties: false,
        required: [
          "product",
          "name",
          "environment",
          "network",
          "region",
        ],
        properties: {
          product: {
            type: "string",
            enum: [
              "platform-api",
              "one",
              "rpc-api",
              "grpc-api",
              "rollups",
              "nft-api",
              "webhooks",
              "websockets",
              "transfers-api",
              "token-api",
              "bundler-api",
              "gas-manager-api",
              "vault",
              "atlas",
            ],
          },
          name: { type: "string", minLength: 2, maxLength: 80 },
          environment: {
            type: "string",
            enum: ["development", "staging", "production"],
          },
          network: {
            type: "string",
            enum: [
              "global",
              "ethereum",
              "base",
              "arbitrum",
              "optimism",
              "polygon",
              "solana",
              "multi-chain",
              "op-stack",
              "arbitrum-orbit",
              "avalanche-l1",
              "polygon-cdk",
              "cosmos-evm",
              "custom-chain",
              "custom-rollup",
            ],
          },
          region: {
            type: "string",
            enum: ["global", "us-east", "eu-west", "ap-south"],
          },
        },
        allOf: [
          {
            if: {
              required: ["product"],
              properties: { product: { const: "rpc-api" } },
            },
            then: {
              properties: {
                network: {
                  type: "string",
                  enum: ["ethereum", "base", "solana"],
                },
              },
            },
          },
          {
            if: {
              required: ["product"],
              properties: { product: { const: "grpc-api" } },
            },
            then: {
              properties: {
                network: { type: "string", const: "ethereum" },
              },
            },
          },
          {
            if: {
              required: ["product"],
              properties: { product: { const: "rollups" } },
            },
            then: {
              properties: {
                network: {
                  type: "string",
                  enum: [
                    "op-stack",
                    "arbitrum-orbit",
                    "avalanche-l1",
                    "polygon-cdk",
                    "cosmos-evm",
                    "custom-chain",
                    "custom-rollup",
                  ],
                },
              },
            },
          },
        ],
      },
      DeveloperServiceUpdate: {
        type: "object",
        additionalProperties: false,
        required: ["name", "updatedAt"],
        properties: {
          name: {
            type: "string",
            minLength: 2,
            maxLength: 80,
          },
          updatedAt: {
            type: "string",
            format: "date-time",
            description:
              "The exact updatedAt timestamp from the current service snapshot.",
          },
        },
      },
      DeveloperService: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "product",
          "name",
          "environment",
          "network",
          "region",
          "status",
          "endpointPath",
          "configuration",
          "telemetry",
          "createdAt",
          "updatedAt",
          "archivedAt",
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          product: {
            type: "string",
            enum: [
              "platform-api",
              "one",
              "rpc-api",
              "grpc-api",
              "rollups",
              "nft-api",
              "webhooks",
              "websockets",
              "transfers-api",
              "token-api",
              "bundler-api",
              "gas-manager-api",
              "vault",
              "atlas",
            ],
          },
          name: { type: "string" },
          environment: {
            type: "string",
            enum: ["development", "staging", "production"],
          },
          network: {
            type: "string",
            enum: [
              "global",
              "ethereum",
              "base",
              "arbitrum",
              "optimism",
              "polygon",
              "solana",
              "multi-chain",
              "op-stack",
              "arbitrum-orbit",
              "avalanche-l1",
              "polygon-cdk",
              "cosmos-evm",
              "custom-chain",
              "custom-rollup",
            ],
          },
          region: {
            type: "string",
            enum: ["global", "us-east", "eu-west", "ap-south"],
          },
          status: {
            type: "string",
            enum: ["active", "configuration_saved", "archived"],
          },
          endpointPath: { type: ["string", "null"] },
          configuration: {
            type: "object",
            additionalProperties: true,
          },
          telemetry: {
            oneOf: [
              {
                $ref: "#/components/schemas/DeveloperServiceTelemetry",
              },
              { type: "null" },
            ],
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          archivedAt: {
            type: ["string", "null"],
            format: "date-time",
          },
        },
      },
      DeveloperServiceTelemetry: {
        type: "object",
        additionalProperties: false,
        required: [
          "requests",
          "calls",
          "errors",
          "upstreamFailures",
          "averageLatencyMs",
          "windowStartedAt",
          "updatedAt",
        ],
        properties: {
          requests: {
            type: "integer",
            minimum: 0,
            description:
              "HTTP gateway requests represented by retained usage buckets in the selected database.",
          },
          calls: {
            type: "integer",
            minimum: 0,
            description:
              "JSON-RPC calls, with every batch item counted separately.",
          },
          errors: {
            type: "integer",
            minimum: 0,
            description:
              "JSON-RPC calls that completed with an error.",
          },
          upstreamFailures: {
            type: "integer",
            minimum: 0,
            description:
              "Failed upstream attempts, including bounded adaptive read failover attempts.",
          },
          averageLatencyMs: {
            type: ["integer", "null"],
            minimum: 0,
            description:
              "Average end-to-end gateway latency per measured HTTP request.",
          },
          windowStartedAt: {
            type: ["string", "null"],
            format: "date-time",
          },
          updatedAt: {
            type: ["string", "null"],
            format: "date-time",
          },
        },
      },
      DeveloperRpcUsageMetrics: {
        type: "object",
        additionalProperties: false,
        required: [
          "quotaUnits",
          "requests",
          "calls",
          "errors",
          "upstreamFailures",
          "averageLatencyMs",
          "successRate",
          "bytesIn",
          "bytesOut",
          "lastRequestAt",
        ],
        properties: {
          quotaUnits: { type: "integer", minimum: 0 },
          requests: { type: "integer", minimum: 0 },
          calls: { type: "integer", minimum: 0 },
          errors: { type: "integer", minimum: 0 },
          upstreamFailures: { type: "integer", minimum: 0 },
          averageLatencyMs: {
            type: ["number", "null"],
            minimum: 0,
            description:
              "Average end-to-end gateway latency per HTTP request.",
          },
          successRate: {
            type: ["number", "null"],
            minimum: 0,
            maximum: 1,
            description:
              "One minus JSON-RPC error calls divided by all calls. Null when no calls were measured.",
          },
          bytesIn: { type: "integer", minimum: 0 },
          bytesOut: { type: "integer", minimum: 0 },
          lastRequestAt: {
            type: ["string", "null"],
            format: "date-time",
          },
        },
      },
      DeveloperRpcUsageSeriesPoint: {
        type: "object",
        additionalProperties: false,
        required: [
          "startAt",
          "quotaUnits",
          "requests",
          "calls",
          "errors",
          "upstreamFailures",
          "averageLatencyMs",
          "successRate",
          "bytesIn",
          "bytesOut",
          "lastRequestAt",
        ],
        properties: {
          startAt: { type: "string", format: "date-time" },
          quotaUnits: { type: "integer", minimum: 0 },
          requests: { type: "integer", minimum: 0 },
          calls: { type: "integer", minimum: 0 },
          errors: { type: "integer", minimum: 0 },
          upstreamFailures: { type: "integer", minimum: 0 },
          averageLatencyMs: {
            type: ["number", "null"],
            minimum: 0,
          },
          successRate: {
            type: ["number", "null"],
            minimum: 0,
            maximum: 1,
          },
          bytesIn: { type: "integer", minimum: 0 },
          bytesOut: { type: "integer", minimum: 0 },
          lastRequestAt: {
            type: ["string", "null"],
            format: "date-time",
          },
        },
      },
      DeveloperRpcUsageApiKey: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "name",
          "prefix",
          "lastFour",
          "revokedAt",
          "quotaUnits",
          "requests",
          "calls",
          "errors",
          "upstreamFailures",
          "averageLatencyMs",
          "successRate",
          "bytesIn",
          "bytesOut",
          "lastRequestAt",
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          prefix: { type: "string" },
          lastFour: { type: "string", minLength: 4, maxLength: 4 },
          revokedAt: {
            type: ["string", "null"],
            format: "date-time",
          },
          quotaUnits: { type: "integer", minimum: 0 },
          requests: { type: "integer", minimum: 0 },
          calls: { type: "integer", minimum: 0 },
          errors: { type: "integer", minimum: 0 },
          upstreamFailures: { type: "integer", minimum: 0 },
          averageLatencyMs: {
            type: ["number", "null"],
            minimum: 0,
          },
          successRate: {
            type: ["number", "null"],
            minimum: 0,
            maximum: 1,
          },
          bytesIn: { type: "integer", minimum: 0 },
          bytesOut: { type: "integer", minimum: 0 },
          lastRequestAt: {
            type: ["string", "null"],
            format: "date-time",
          },
        },
      },
      DeveloperRpcUsageEnvelope: {
        type: "object",
        additionalProperties: false,
        required: ["data", "requestId"],
        properties: {
          data: {
            type: "object",
            additionalProperties: false,
            required: [
              "service",
              "window",
              "resolution",
              "generatedAt",
              "startAt",
              "endAt",
              "summary",
              "currentHourQuota",
              "series",
              "apiKeys",
            ],
            properties: {
              service: {
                type: "object",
                additionalProperties: false,
                required: ["id", "name", "network"],
                properties: {
                  id: { type: "string", format: "uuid" },
                  name: { type: "string" },
                  network: {
                    type: "string",
                    enum: ["ethereum", "base", "solana"],
                  },
                },
              },
              window: {
                type: "string",
                enum: ["24h", "7d", "30d"],
              },
              resolution: {
                type: "string",
                enum: ["1h", "6h", "1d"],
              },
              generatedAt: { type: "string", format: "date-time" },
              startAt: { type: "string", format: "date-time" },
              endAt: { type: "string", format: "date-time" },
              summary: {
                $ref: "#/components/schemas/DeveloperRpcUsageMetrics",
              },
              currentHourQuota: {
                type: "object",
                additionalProperties: false,
                required: [
                  "serviceUnits",
                  "workspaceUnits",
                  "workspaceLimit",
                  "workspaceRemaining",
                  "resetAt",
                ],
                properties: {
                  serviceUnits: { type: "integer", minimum: 0 },
                  workspaceUnits: { type: "integer", minimum: 0 },
                  workspaceLimit: {
                    type: ["integer", "null"],
                    minimum: 0,
                  },
                  workspaceRemaining: {
                    type: ["integer", "null"],
                    minimum: 0,
                  },
                  resetAt: {
                    type: "string",
                    format: "date-time",
                  },
                },
              },
              series: {
                type: "array",
                minItems: 24,
                maxItems: 30,
                items: {
                  $ref: "#/components/schemas/DeveloperRpcUsageSeriesPoint",
                },
              },
              apiKeys: {
                type: "array",
                maxItems: 100,
                items: {
                  $ref: "#/components/schemas/DeveloperRpcUsageApiKey",
                },
              },
            },
          },
          requestId: { type: "string" },
        },
      },
      AiDiagnosisEvidenceReference: {
        type: "object",
        additionalProperties: false,
        required: ["ref", "observed", "description"],
        properties: {
          ref: {
            type: "string",
            description:
              "Stable reference to an allowlisted evidence field or deterministic derived value.",
          },
          observed: {
            type: ["string", "number", "boolean", "null"],
          },
          description: { type: "string" },
        },
      },
      AiDiagnosisRunbookAction: {
        type: "object",
        additionalProperties: false,
        required: ["runbook", "priority", "instruction"],
        properties: {
          runbook: { type: "string" },
          priority: { type: "integer", enum: [1, 2, 3] },
          instruction: { type: "string" },
        },
      },
      AiDiagnosisFinding: {
        type: "object",
        additionalProperties: false,
        required: [
          "code",
          "severity",
          "title",
          "explanation",
          "confidence",
          "evidence",
          "actions",
        ],
        properties: {
          code: { type: "string" },
          severity: {
            type: "string",
            enum: ["info", "warning", "critical"],
          },
          title: { type: "string" },
          explanation: { type: "string" },
          confidence: {
            type: "object",
            additionalProperties: false,
            required: ["level", "basis"],
            properties: {
              level: {
                type: "string",
                enum: ["high", "medium"],
              },
              basis: { type: "string" },
            },
          },
          evidence: {
            type: "array",
            minItems: 1,
            items: {
              $ref: "#/components/schemas/AiDiagnosisEvidenceReference",
            },
          },
          actions: {
            type: "array",
            minItems: 1,
            items: {
              $ref: "#/components/schemas/AiDiagnosisRunbookAction",
            },
          },
        },
      },
      AiInfrastructureDiagnosis: {
        type: "object",
        additionalProperties: false,
        required: [
          "schemaVersion",
          "service",
          "window",
          "generatedAt",
          "engine",
          "coverage",
          "summary",
          "metrics",
          "findings",
          "limitations",
        ],
        properties: {
          schemaVersion: { type: "string", const: "2026-08-01" },
          service: {
            type: "object",
            additionalProperties: false,
            required: [
              "id",
              "product",
              "name",
              "environment",
              "network",
              "region",
              "status",
            ],
            properties: {
              id: { type: "string", format: "uuid" },
              product: { type: "string", enum: ["rpc-api", "rollups"] },
              name: { type: "string" },
              environment: {
                type: "string",
                enum: ["development", "staging", "production"],
              },
              network: { type: "string" },
              region: { type: "string" },
              status: {
                type: "string",
                enum: ["active", "configuration_saved"],
              },
            },
          },
          window: {
            type: "string",
            enum: ["24h", "7d", "30d"],
          },
          generatedAt: { type: "string", format: "date-time" },
          engine: {
            type: "object",
            additionalProperties: false,
            required: [
              "provider",
              "version",
              "mode",
              "modelInvoked",
            ],
            properties: {
              provider: {
                type: "string",
                const: "nodezuno-evidence-rules",
              },
              version: { type: "string", const: "1.0.0" },
              mode: { type: "string", const: "deterministic" },
              modelInvoked: { type: "boolean", const: false },
            },
          },
          coverage: {
            type: "object",
            additionalProperties: false,
            required: ["kind", "status", "note"],
            properties: {
              kind: {
                type: "string",
                enum: ["operational", "readiness"],
              },
              status: {
                type: "string",
                enum: ["complete", "limited"],
              },
              note: { type: "string" },
            },
          },
          summary: {
            type: "object",
            additionalProperties: false,
            required: [
              "state",
              "highestSeverity",
              "findingCount",
            ],
            properties: {
              state: {
                type: "string",
                enum: ["healthy", "attention", "critical", "unknown"],
              },
              highestSeverity: {
                type: "string",
                enum: ["none", "info", "warning", "critical"],
              },
              findingCount: { type: "integer", minimum: 0 },
            },
          },
          metrics: {
            type: "object",
            additionalProperties: false,
            required: [
              "requests",
              "calls",
              "errors",
              "upstreamFailures",
              "averageLatencyMs",
              "successRate",
              "lastRequestAt",
              "configuredUpstreams",
              "workspaceQuotaUtilization",
            ],
            properties: {
              requests: { type: ["integer", "null"], minimum: 0 },
              calls: { type: ["integer", "null"], minimum: 0 },
              errors: { type: ["integer", "null"], minimum: 0 },
              upstreamFailures: {
                type: ["integer", "null"],
                minimum: 0,
              },
              averageLatencyMs: {
                type: ["number", "null"],
                minimum: 0,
              },
              successRate: {
                type: ["number", "null"],
                minimum: 0,
                maximum: 1,
              },
              lastRequestAt: {
                type: ["string", "null"],
                format: "date-time",
              },
              configuredUpstreams: {
                type: ["integer", "null"],
                minimum: 0,
                maximum: 100,
              },
              workspaceQuotaUtilization: {
                type: ["number", "null"],
                minimum: 0,
                maximum: 1,
              },
            },
          },
          findings: {
            type: "array",
            items: {
              $ref: "#/components/schemas/AiDiagnosisFinding",
            },
          },
          limitations: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
      AiInfrastructureDiagnosisEnvelope: {
        type: "object",
        additionalProperties: false,
        required: ["data", "requestId"],
        properties: {
          data: {
            type: "object",
            additionalProperties: false,
            required: ["diagnosis"],
            properties: {
              diagnosis: {
                $ref: "#/components/schemas/AiInfrastructureDiagnosis",
              },
            },
          },
          requestId: { type: "string" },
        },
      },
      DeveloperServiceListEnvelope: {
        type: "object",
        additionalProperties: false,
        required: ["data", "requestId"],
        properties: {
          data: {
            type: "object",
            additionalProperties: false,
            required: ["services"],
            properties: {
              services: {
                type: "array",
                items: {
                  $ref: "#/components/schemas/DeveloperService",
                },
              },
            },
          },
          requestId: { type: "string" },
        },
      },
      DeveloperServiceMutationEnvelope: {
        type: "object",
        additionalProperties: false,
        required: ["data", "requestId"],
        properties: {
          data: {
            type: "object",
            additionalProperties: false,
            required: ["service"],
            properties: {
              service: {
                $ref: "#/components/schemas/DeveloperService",
              },
            },
          },
          requestId: { type: "string" },
        },
      },
      PlatformIdentityEnvelope: {
        type: "object",
        additionalProperties: false,
        required: ["data", "requestId"],
        properties: {
          data: {
            type: "object",
            additionalProperties: false,
            required: ["workspace", "apiKey"],
            properties: {
              workspace: {
                type: "object",
                additionalProperties: false,
                required: ["id", "slug", "name"],
                properties: {
                  id: { type: "string", format: "uuid" },
                  slug: { type: "string" },
                  name: { type: "string" },
                },
              },
              apiKey: {
                type: "object",
                additionalProperties: false,
                required: [
                  "id",
                  "name",
                  "prefix",
                  "lastFour",
                  "scopes",
                  "serviceId",
                  "expiresAt",
                ],
                properties: {
                  id: { type: "string", format: "uuid" },
                  name: { type: "string" },
                  prefix: { type: "string" },
                  lastFour: { type: "string", minLength: 4, maxLength: 4 },
                  scopes: {
                    type: "array",
                    items: {
                      type: "string",
                      enum: [
                        "platform:identity",
                        "services:manage",
                        "rpc:invoke",
                        "grpc:invoke",
                      ],
                    },
                  },
                  serviceId: {
                    type: ["string", "null"],
                    format: "uuid",
                  },
                  expiresAt: { type: "string", format: "date-time" },
                },
              },
            },
          },
          requestId: { type: "string" },
        },
      },
      JsonRpcId: {
        oneOf: [
          { type: "string", maxLength: 256 },
          { type: "integer" },
          { type: "null" },
        ],
      },
      JsonRpcParams: {
        oneOf: [
          { type: "array", items: true },
          { type: "object", additionalProperties: true },
        ],
      },
      JsonRpcRequest: {
        type: "object",
        additionalProperties: false,
        required: ["jsonrpc", "method"],
        properties: {
          jsonrpc: { const: "2.0" },
          method: {
            type: "string",
            pattern: "^[A-Za-z][A-Za-z0-9_.:-]{0,127}$",
          },
          params: { $ref: "#/components/schemas/JsonRpcParams" },
          id: { $ref: "#/components/schemas/JsonRpcId" },
        },
      },
      JsonRpcRequestPayload: {
        oneOf: [
          { $ref: "#/components/schemas/JsonRpcRequest" },
          {
            type: "array",
            minItems: 1,
            maxItems: 20,
            items: { $ref: "#/components/schemas/JsonRpcRequest" },
          },
        ],
      },
      JsonRpcErrorDetail: {
        type: "object",
        additionalProperties: true,
        required: ["code", "message"],
        properties: {
          code: {
            type: "integer",
            description:
              "Standard protocol errors use -32700 or -32600. Nodezuno policy, authorization, availability, quota, and transport errors use stable -320xx codes. Upstream application errors retain the upstream numeric code.",
          },
          message: { type: "string" },
          data: {
            description:
              "Gateway-generated errors include a stable machine code. Successful upstream transport can also return provider-defined error data.",
            anyOf: [
              {
                $ref: "#/components/schemas/JsonRpcGatewayErrorData",
              },
              true,
            ],
          },
        },
      },
      JsonRpcGatewayErrorData: {
        type: "object",
        required: ["code"],
        properties: {
          code: {
            type: "string",
            enum: [
              "rpc_parse_error",
              "rpc_invalid_request",
              "rpc_duplicate_id",
              "rpc_params_out_of_policy",
              "rpc_method_blocked",
              "rpc_origin_not_allowed",
              "rpc_ip_not_allowed",
              "rpc_method_not_allowed",
              "api_key_scope_denied",
              "api_key_service_denied",
              "rpc_upstream_unavailable",
              "rpc_mainnet_upstream_unverified",
              "rpc_quota_exceeded",
              "rpc_upstream_failed",
              "rpc_upstream_timeout",
            ],
          },
          detail: { type: "string" },
        },
        additionalProperties: true,
      },
      JsonRpcSuccessResponse: {
        type: "object",
        additionalProperties: false,
        required: ["jsonrpc", "id", "result"],
        properties: {
          jsonrpc: { const: "2.0" },
          id: { $ref: "#/components/schemas/JsonRpcId" },
          result: true,
        },
      },
      JsonRpcErrorResponse: {
        type: "object",
        additionalProperties: false,
        required: ["jsonrpc", "id", "error"],
        properties: {
          jsonrpc: { const: "2.0" },
          id: { $ref: "#/components/schemas/JsonRpcId" },
          error: { $ref: "#/components/schemas/JsonRpcErrorDetail" },
        },
      },
      JsonRpcResponse: {
        oneOf: [
          { $ref: "#/components/schemas/JsonRpcSuccessResponse" },
          { $ref: "#/components/schemas/JsonRpcErrorResponse" },
        ],
      },
      JsonRpcResponsePayload: {
        oneOf: [
          { $ref: "#/components/schemas/JsonRpcResponse" },
          {
            type: "array",
            minItems: 1,
            maxItems: 20,
            items: { $ref: "#/components/schemas/JsonRpcResponse" },
          },
        ],
      },
      PublicStatusService: {
        type: "object",
        additionalProperties: false,
        required: [
          "slug",
          "name",
          "description",
          "state",
          "updatedAt",
        ],
        properties: {
          slug: {
            type: "string",
            description:
              "RPC readiness uses rpc-ethereum, rpc-base, and rpc-solana; native gRPC uses grpc-ethereum. The legacy rpc-mesh seed is translated and is never emitted beside them.",
          },
          name: { type: "string" },
          description: { type: "string" },
          state: {
            type: "string",
            enum: [
              "preview",
              "operational",
              "degraded",
              "partial_outage",
              "major_outage",
              "maintenance",
            ],
          },
          updatedAt: { type: "integer", minimum: 0 },
        },
      },
      PublicStatusIncident: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "slug",
          "title",
          "severity",
          "state",
          "impact",
          "startedAt",
          "resolvedAt",
          "updatedAt",
        ],
        properties: {
          id: { type: "string" },
          slug: { type: "string" },
          title: { type: "string" },
          severity: {
            type: "string",
            enum: ["none", "minor", "major", "critical"],
          },
          state: {
            type: "string",
            enum: [
              "investigating",
              "identified",
              "monitoring",
              "resolved",
            ],
          },
          impact: { type: "string" },
          startedAt: { type: "integer", minimum: 0 },
          resolvedAt: {
            oneOf: [
              { type: "integer", minimum: 0 },
              { type: "null" },
            ],
          },
          updatedAt: { type: "integer", minimum: 0 },
        },
      },
      PublicStatusEnvelope: {
        type: "object",
        additionalProperties: false,
        required: ["data", "requestId"],
        properties: {
          data: {
            type: "object",
            additionalProperties: false,
            required: [
              "overall",
              "services",
              "incidents",
              "generatedAt",
              "disclaimer",
            ],
            properties: {
              overall: {
                type: "string",
                enum: [
                  "unknown",
                  "preview",
                  "operational",
                  "mixed",
                  "maintenance",
                  "degraded",
                  "incident",
                ],
              },
              services: {
                type: "array",
                items: {
                  $ref: "#/components/schemas/PublicStatusService",
                },
              },
              incidents: {
                type: "array",
                items: {
                  $ref: "#/components/schemas/PublicStatusIncident",
                },
              },
              generatedAt: { type: "string", format: "date-time" },
              disclaimer: { type: "string" },
            },
          },
          requestId: { type: "string" },
        },
      },
      LivenessEnvelope: {
        type: "object",
        required: ["data", "requestId"],
        properties: {
          data: {
            type: "object",
            required: ["service", "status", "runtime", "checkedAt"],
            properties: {
              service: { type: "string" },
              status: { const: "alive" },
              runtime: { type: "string", enum: ["sites", "container"] },
              checkedAt: { type: "string", format: "date-time" },
            },
          },
          requestId: { type: "string" },
        },
      },
      ReadinessEnvelope: {
        type: "object",
        required: ["data", "requestId"],
        properties: {
          data: {
            type: "object",
            required: ["service", "status", "checkedAt"],
            properties: {
              service: { type: "string" },
              status: {
                type: "string",
                enum: ["ready", "not_ready"],
              },
              checkedAt: { type: "string", format: "date-time" },
            },
          },
          requestId: { type: "string" },
        },
      },
      RpcConfigurationReadiness: {
        type: "object",
        additionalProperties: false,
        required: ["configured", "upstreamCount", "scope"],
        properties: {
          configured: { type: "boolean" },
          upstreamCount: {
            type: "integer",
            minimum: 0,
            maximum: 4,
          },
          scope: {
            type: "string",
            description:
              "States that the value represents validated configuration, not a live upstream or chain health probe.",
          },
        },
      },
      HealthEnvelope: {
        type: "object",
        required: ["data", "requestId"],
        properties: {
          data: {
            type: "object",
            required: [
              "service",
              "status",
              "database",
              "configuration",
              "ethereumRpc",
              "rpcNetworks",
              "nativeGrpc",
              "checkedAt",
              "scope",
            ],
            properties: {
              service: { type: "string" },
              status: { type: "string", enum: ["healthy", "unavailable"] },
              database: { type: "boolean" },
              configuration: { type: "boolean" },
              ethereumRpc: {
                type: "object",
                additionalProperties: false,
                required: ["configured", "upstreamCount", "scope"],
                properties: {
                  configured: { type: "boolean" },
                  upstreamCount: {
                    type: "integer",
                    minimum: 0,
                    maximum: 4,
                  },
                  scope: {
                    type: "string",
                    description:
                      "States that this is configuration readiness, not a chain-head or upstream health probe.",
                  },
                },
              },
              rpcNetworks: {
                type: "object",
                additionalProperties: false,
                required: ["ethereum", "base", "solana"],
                properties: {
                  ethereum: {
                    $ref: "#/components/schemas/RpcConfigurationReadiness",
                  },
                  base: {
                    $ref: "#/components/schemas/RpcConfigurationReadiness",
                  },
                  solana: {
                    $ref: "#/components/schemas/RpcConfigurationReadiness",
                  },
                },
              },
              nativeGrpc: {
                type: "object",
                additionalProperties: false,
                required: [
                  "configured",
                  "endpointConfigured",
                  "authenticationConfigured",
                  "scope",
                ],
                properties: {
                  configured: { type: "boolean" },
                  endpointConfigured: { type: "boolean" },
                  authenticationConfigured: { type: "boolean" },
                  scope: {
                    type: "string",
                    description:
                      "States that this is native gateway configuration readiness, not a gRPC serving-health probe.",
                  },
                },
              },
              checkedAt: { type: "string", format: "date-time" },
              scope: { type: "string" },
            },
          },
          requestId: { type: "string" },
        },
      },
      GasEstimateInput: {
        type: "object",
        additionalProperties: false,
        required: ["gasUnits", "gwei", "assetPrice"],
        properties: {
          gasUnits: {
            oneOf: [{ type: "string" }, { type: "number" }],
            examples: ["21000"],
          },
          gwei: {
            oneOf: [{ type: "string" }, { type: "number" }],
            examples: ["2.5"],
          },
          assetPrice: {
            oneOf: [{ type: "string" }, { type: "number" }],
            examples: ["3500"],
          },
        },
      },
      ReviewOrderInput: {
        type: "object",
        additionalProperties: false,
        required: [
          "contactName",
          "workEmail",
          "company",
          "teamType",
          "targetChain",
          "auditedBaseline",
          "proposedRelease",
          "changeSummary",
          "affectedContracts",
          "changedLines",
          "consent",
          "sourcePath",
        ],
        properties: {
          contactName: { type: "string", minLength: 2, maxLength: 100 },
          workEmail: { type: "string", format: "email", maxLength: 254 },
          company: { type: "string", minLength: 2, maxLength: 160 },
          website: { type: ["string", "null"], format: "uri", maxLength: 500 },
          teamType: { type: "string", minLength: 2, maxLength: 80 },
          targetChain: {
            type: "string",
            enum: reviewTargetOptions,
          },
          auditedBaseline: { type: "string", minLength: 3, maxLength: 500 },
          proposedRelease: { type: "string", minLength: 3, maxLength: 500 },
          changeSummary: { type: "string", minLength: 30, maxLength: 5000 },
          affectedContracts: { type: "integer", minimum: reviewPolicy.affectedComponents.min, maximum: reviewPolicy.affectedComponents.max },
          changedLines: { type: "integer", minimum: reviewPolicy.materiallyChangedLines.min, maximum: reviewPolicy.materiallyChangedLines.max },
          artifactReadyDate: { type: ["string", "null"], format: "date" },
          targetReleaseDate: { type: ["string", "null"], format: "date" },
          publicLinks: { type: ["string", "null"], maxLength: 2000 },
          consent: { const: true },
          sourcePath: { type: "string", pattern: "^/" },
        },
      },
      StablecoinPaymentIntentInput: {
        type: "object",
        additionalProperties: false,
        required: ["acceptTerms", "proposalVersion", "phase", "asset"],
        properties: {
          acceptTerms: { const: true },
          proposalVersion: { type: "integer", minimum: 1 },
          phase: { type: "string", enum: ["deposit", "balance"] },
          asset: { type: "string", enum: ["USDC", "USDT"] },
        },
      },
      StablecoinPaymentClaimInput: {
        type: "object",
        additionalProperties: false,
        required: ["transactionHash", "telegramUsername"],
        properties: {
          transactionHash: {
            type: "string",
            pattern: "^0x[0-9a-fA-F]{64}$",
          },
          telegramUsername: {
            type: "string",
            pattern: "^@?[A-Za-z][A-Za-z0-9_]{4,31}$",
            description:
              "A mandatory Telegram username. The server stores it in normalized lowercase form with one leading @.",
          },
        },
      },
      StablecoinPaymentIntent: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "phase",
          "state",
          "asset",
          "network",
          "chainId",
          "tokenContract",
          "tokenDecimals",
          "recipient",
          "amount",
          "currency",
          "tokenAmount",
          "amountAtomic",
          "referenceUnits",
          "proposalVersion",
          "termsAcceptedAt",
          "expiresAt",
          "createdAt",
          "verifiedAt",
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          phase: { type: "string", enum: ["deposit", "balance"] },
          state: {
            type: "string",
            enum: [
              "awaiting_transfer",
              "submitted",
              "confirming",
              "verified",
              "manual_review",
              "expired",
              "cancelled",
              "refunded",
            ],
          },
          asset: { type: "string", enum: ["USDC", "USDT"] },
          network: { type: "string", const: "Ethereum Mainnet" },
          chainId: { type: "integer", const: 1 },
          tokenContract: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
          tokenDecimals: { type: "integer", const: 6 },
          recipient: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
          amount: {
            type: "integer",
            const: reviewPolicy.depositAmountMinor,
            description: "The USD obligation in minor units.",
          },
          currency: { type: "string", const: reviewPolicy.currency },
          tokenAmount: {
            type: "string",
            pattern: "^[0-9]+\\.[0-9]{6}$",
            description:
              "The exact server-issued token quantity, including its unique reference-unit suffix. Transfer this exact value.",
          },
          amountAtomic: { type: "string", pattern: "^[0-9]{1,78}$" },
          referenceUnits: { type: "integer", minimum: 1, maximum: 9999 },
          proposalVersion: { type: "integer", minimum: 1 },
          termsAcceptedAt: { type: "string", format: "date-time" },
          expiresAt: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          verifiedAt: {
            type: ["string", "null"],
            format: "date-time",
          },
        },
      },
      StablecoinPaymentClaim: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "state",
          "transactionHash",
          "telegramUsername",
          "failureCode",
          "confirmations",
          "submittedAt",
          "verifiedAt",
          "explorerUrl",
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          state: {
            type: "string",
            enum: [
              "submitted",
              "checking",
              "confirming",
              "verified",
              "rejected",
              "manual_review",
            ],
          },
          transactionHash: { type: "string", pattern: "^0x[0-9a-f]{64}$" },
          telegramUsername: { type: "string", pattern: "^@[a-z][a-z0-9_]{4,31}$" },
          failureCode: { type: ["string", "null"] },
          confirmations: { type: "integer", minimum: 0 },
          submittedAt: { type: "string", format: "date-time" },
          verifiedAt: {
            type: ["string", "null"],
            format: "date-time",
          },
          explorerUrl: { type: "string", format: "uri" },
        },
      },
      StablecoinPayment: {
        type: "object",
        additionalProperties: false,
        required: ["intent", "claim"],
        properties: {
          intent: { $ref: "#/components/schemas/StablecoinPaymentIntent" },
          claim: {
            oneOf: [
              { $ref: "#/components/schemas/StablecoinPaymentClaim" },
              { type: "null" },
            ],
          },
        },
      },
      StablecoinPaymentConfiguration: {
        type: "object",
        additionalProperties: false,
        required: [
          "confirmationsRequired",
          "explorerTxBase",
          "seller",
          "paymentExperience",
          "automaticVerification",
          "verification",
        ],
        properties: {
          confirmationsRequired: { type: "integer", minimum: 6, maximum: 64 },
          explorerTxBase: { type: "string", format: "uri" },
          seller: { type: "string" },
          paymentExperience: {
            type: "string",
            enum: ["disabled", "manual_ethereum", "ethereum_mainnet"],
          },
          automaticVerification: { type: "boolean" },
          verification: {
            type: "string",
            enum: ["manual_operator_review", "Ethereum JSON-RPC evidence"],
          },
        },
      },
      StablecoinPaymentIntentEnvelope: {
        type: "object",
        additionalProperties: false,
        required: ["data", "requestId"],
        properties: {
          data: {
            type: "object",
            additionalProperties: false,
            required: ["payment", "order", "configuration"],
            properties: {
              payment: { $ref: "#/components/schemas/StablecoinPayment" },
              order: { type: "object", additionalProperties: true },
              configuration: {
                $ref: "#/components/schemas/StablecoinPaymentConfiguration",
              },
            },
          },
          requestId: { type: "string" },
        },
      },
      StablecoinPaymentClaimEnvelope: {
        type: "object",
        additionalProperties: false,
        required: ["data", "requestId"],
        properties: {
          data: {
            type: "object",
            additionalProperties: false,
            required: ["payment", "configuration"],
            properties: {
              payment: { $ref: "#/components/schemas/StablecoinPayment" },
              configuration: {
                $ref: "#/components/schemas/StablecoinPaymentConfiguration",
              },
            },
          },
          requestId: { type: "string" },
        },
      },
      SubmissionInput: {
        type: "object",
        additionalProperties: false,
        required: [
          "kind",
          "name",
          "email",
          "company",
          "team",
          "message",
          "consent",
          "sourcePath",
        ],
        properties: {
          kind: {
            type: "string",
            enum: [
              "sales",
              "workspace_access",
              "support",
              "startup_program",
              "press",
              "career_interest",
              "security_contact",
              "event_interest",
            ],
          },
          name: { type: "string", minLength: 2, maxLength: 100 },
          email: { type: "string", format: "email", maxLength: 254 },
          company: { type: "string", minLength: 2, maxLength: 160 },
          team: { type: "string" },
          message: { type: "string", minLength: 20, maxLength: 5000 },
          consent: { const: true },
          sourcePath: { type: "string", pattern: "^/" },
          website: {
            type: "string",
            description: "First-party honeypot. Leave empty.",
          },
          utmSource: { type: ["string", "null"], maxLength: 100 },
          utmMedium: { type: ["string", "null"], maxLength: 100 },
          utmCampaign: { type: ["string", "null"], maxLength: 100 },
        },
      },
      NewsletterInput: {
        type: "object",
        additionalProperties: false,
        required: ["email", "consent", "sourcePath"],
        properties: {
          email: { type: "string", format: "email", maxLength: 254 },
          name: { type: ["string", "null"], maxLength: 100 },
          consent: { const: true },
          sourcePath: { type: "string", pattern: "^/" },
          website: {
            type: "string",
            description: "First-party honeypot. Leave empty.",
          },
        },
      },
      NewsletterTokenInput: {
        type: "object",
        additionalProperties: false,
        required: ["token"],
        properties: {
          token: { type: "string", minLength: 40, maxLength: 200, writeOnly: true },
        },
      },
      SubmissionReceipt: {
        type: "object",
        additionalProperties: false,
        required: ["data", "requestId"],
        properties: {
          data: {
            type: "object",
            additionalProperties: false,
            required: ["id", "status", "createdAt"],
            properties: {
              id: { type: "string", format: "uuid" },
              status: { type: "string" },
              createdAt: { type: "string", format: "date-time" },
            },
          },
          replayed: { type: "boolean" },
          requestId: { type: "string" },
        },
      },
      NewsletterReceipt: {
        type: "object",
        additionalProperties: false,
        required: ["data", "requestId"],
        properties: {
          data: {
            type: "object",
            additionalProperties: false,
            required: ["state", "message"],
            properties: {
              state: { type: "string", const: "pending" },
              message: { type: "string" },
            },
          },
          requestId: { type: "string" },
        },
      },
      NewsletterConfirmation: {
        type: "object",
        additionalProperties: false,
        required: ["data", "requestId"],
        properties: {
          data: {
            type: "object",
            additionalProperties: false,
            required: ["state", "message"],
            properties: {
              state: {
                type: "string",
                enum: ["subscribed", "expired", "invalid"],
              },
              message: { type: "string" },
            },
          },
          requestId: { type: "string" },
        },
      },
      NewsletterUnsubscribeReceipt: {
        type: "object",
        additionalProperties: false,
        required: ["data", "requestId"],
        properties: {
          data: {
            type: "object",
            additionalProperties: false,
            required: ["state", "message"],
            properties: {
              state: { type: "string", const: "unsubscribed" },
              message: { type: "string" },
            },
          },
          requestId: { type: "string" },
        },
      },
    },
  },
} as const;
