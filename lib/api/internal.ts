import { problemResponse, problemSchema } from "./shared.ts";

/** Operator reference only. Do not import into a publicly served OpenAPI route. */
export const internalOpenApiDocument = {
  openapi: "3.1.0",
  "x-nodezuno-audience": "operator",
  info: {
    title: "Nodezuno internal gateway contract",
    version: "1.0.0",
    description: "Private server-to-server contracts for separately authenticated Nodezuno infrastructure. This document is not served over HTTP.",
  },
  paths: {
    "/api/v1/internal/grpc/authorize": {
      post: {
        tags: ["Internal gRPC control plane"],
        operationId: "authorizeNativeGrpcInvocation",
        summary: "Authorize and admit one native gRPC invocation",
        description:
          "Private server-to-server boundary used only by the shared native gRPC gateway. It validates an exact service-bound grpc:invoke key, then atomically consumes the bounded method weight from both the key and shared workspace hourly quota before returning authorized true. Credential denials return a non-enumerating false decision without consuming quota. Customer credentials are never returned.",
        security: [{ grpcControlPlaneSecret: [] }],
        "x-nodezuno-internal": true,
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/GrpcAuthorizationInput" } },
          },
        },
        responses: {
          "200": {
            description:
              "A non-enumerating admission decision. Authorized true confirms that the service-bound key and workspace quota were consumed atomically. Invalid, revoked, expired, unbound, cross-workspace, cross-service, and scope-denied keys return authorized false without consuming quota.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/GrpcAuthorizationEnvelope" } },
            },
          },
          "400": problemResponse,
          "401": problemResponse,
          "413": problemResponse,
          "415": problemResponse,
          "429": {
            ...problemResponse,
            description: "The authenticated key or shared workspace hourly RPC quota cannot admit the supplied method weight.",
          },
          "503": problemResponse,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      grpcControlPlaneSecret: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "operator control-plane secret",
        description: "A separate 32-character-or-longer server secret configured only on the website control plane and shared native gRPC gateway.",
      },
    },
    schemas: {
      Problem: problemSchema,
      GrpcAuthorizationInput: {
        type: "object",
        additionalProperties: false,
        required: ["serviceId", "apiKey", "quotaUnits"],
        properties: {
          serviceId: {
            type: "string", format: "uuid",
            description: "The canonical x-nodezuno-service-id metadata value supplied on the native gRPC call.",
          },
          apiKey: {
            type: "string", writeOnly: true, minLength: 89, maxLength: 89,
            pattern: "^nzu_live_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_[A-Za-z0-9_-]{43}$",
          },
          quotaUnits: {
            type: "integer", minimum: 1, maximum: 10,
            description: "Bounded unary admission weight derived by the native gateway: eth_getLogs is 10, eth_getProof is 5, eth_call and eth_feeHistory are 3, and every other or malformed method is 1.",
          },
        },
      },
      GrpcAuthorizationEnvelope: {
        type: "object", additionalProperties: false, required: ["data", "requestId"],
        properties: {
          data: {
            type: "object", additionalProperties: false, required: ["authorized"],
            properties: { authorized: { type: "boolean" } },
          },
          requestId: { type: "string" },
        },
      },
    },
  },
} as const;
