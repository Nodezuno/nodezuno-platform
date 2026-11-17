export const problemSchema = {
  type: "object",
  required: ["type", "title", "status", "code", "requestId"],
  properties: {
    type: { type: "string", format: "uri" },
    title: { type: "string" },
    status: { type: "integer" },
    code: { type: "string" },
    detail: { type: ["string", "null"] },
    fields: {
      type: ["object", "null"],
      additionalProperties: { type: "string" },
    },
    requestId: { type: "string" },
  },
} as const;

export const problemResponse = {
  description: "A stable application/problem+json error.",
  content: {
    "application/problem+json": {
      schema: { $ref: "#/components/schemas/Problem" },
    },
  },
} as const;
