# API audiences

The API contract is documentation, not an authorization mechanism. Route handlers must still enforce their own identity, ownership, origin, rate, and replay controls.

| Audience | Contract | Access boundary |
| --- | --- | --- |
| Customer and public website | `lib/public-api.ts`, served by `/api/v1/openapi` | Per-operation browser session, private order capability, developer key, or explicitly anonymous route |
| Internal gateway operator | `lib/api/internal.ts`, not served by an HTTP route | Separate gateway control-plane secret; customer credentials do not grant this privilege |
| Email delivery | Outbound Zoho SMTP through the fixed `info@nodezuno.com` mailbox; no provider callback route | SMTP credential is stored as a server secret |
| Administrator | `app/api/v1/admin/`, documented in the restricted operations reference | Fresh authenticated allowlisted administrator plus operation-specific controls |

The public OpenAPI document excludes `/internal/` and `/admin/` operations and the internal gateway's security scheme and payload schemas. Shared Problem schemas live in `lib/api/shared.ts`. The internal document is assembled independently so public publication cannot accidentally include it through a spread of every contract.

Customer workspace and RPC beta contracts remain documented for compatibility. Their presence is not a claim that Nodezuno markets or deploys a node service. The sole public offer is [the upgrade review](../product/SCOPE_AND_PRICING.md).

Use [API.md](../API.md) for request/response details. Review-order input fields retain their existing wire names, including `affectedContracts` for all supported component types and `proposalVersion` for the accepted service-order version. Renaming these fields requires a separate compatibility plan.

Further decomposition should move one coherent domain at a time, keeping operation IDs, status codes, security definitions, references, nullability, and runtime behavior unchanged. Do not create a new public route for the internal document.
