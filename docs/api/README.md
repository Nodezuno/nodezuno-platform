# Website and private-portal API

These endpoints are the first-party interface used by the Nodezuno website,
customer portal, and administration UI. They are not a third-party RPC, node,
explorer, or developer-workspace API.

The active API surface is implemented by `app/api/v1/` and Better Auth routes
under `app/api/auth/`. There is no public OpenAPI endpoint. The route inventory
and security boundaries are documented in [API.md](../API.md).

Public health, status, and intake-chain endpoints describe the website and
request form only. A chain listed for review intake does not mean Nodezuno
operates a node or provides RPC access for that chain.

Review-order access uses an order-specific capability and server-side checks.
Administrative operations require an authenticated allowlisted administrator.
Payment hashes are customer-submitted claims, not payment proof; Cloudflare's
current launch profile keeps automatic verification disabled and relies on
manual operator reconciliation after approval.

The internal Zoho SMTP delivery worker is not a customer API. No Resend
webhook or RPC-gateway authorization endpoint is part of the current API.
