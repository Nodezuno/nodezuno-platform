# Nodezuno account authentication

Nodezuno uses Better Auth 1.6.23 with the configured application database as
the durable account and session store. Sites uses a direct Cloudflare D1
binding. A container can use D1 REST or SQLite on one persistent-volume
instance. A stable `auth_users.id` owns workspace memberships and service
resources. Email is profile and recovery data, not the authorization key.

## Product access boundary

Account creation provides website identity, request history, and the retained
account console. It does not accept an Upgrade Assurance engagement, create a
paid entitlement, authorize a contract deployment, or activate any retained
RPC or gRPC capability. Review acceptance remains a written commercial and
technical decision after intake.

Application sessions authenticate people to the console. Developer API keys
authenticate workloads and carry exactly one least-privilege scope. An
unbound key uses `platform:identity` or `services:manage`; a callable
service-bound key uses only `rpc:invoke` or `grpc:invoke` according to the
service product. The target service must be active in the same workspace and
the immutable binding must match it. A `services:manage` key must remain
unbound and cannot invoke customer traffic. Native gRPC additionally requires
a separately deployed ready gateway; no current public deployment evidence
exists.

## Supported account methods

| Method | Current state | External dependency |
| --- | --- | --- |
| Email and password | Implemented; hidden and disabled unless the Zoho SMTP host and app password are configured, except explicit loopback local preview | Zoho Mail account for `info@nodezuno.com` |
| Google OpenID Connect | Implementation ready, disabled until configured | Google OAuth client |
| Injected EVM wallet | Implemented for supported externally owned accounts; local HTTP signature, session, and replay checks pass; production verification required | Browser wallet |
| Solana Wallet Standard | Implemented for SIWS or sign-message wallets; local HTTP signature, session, and replay checks pass; production verification required | Browser wallet |
| WalletConnect QR | Not claimed | Reown project ID and domain setup |
| EVM contract wallet | Not claimed | Reliable per-chain RPC verification |

Email account creation requires a name, a valid email address, and a password
between 12 and 128 characters. Passwords are hashed by Better Auth. When
`ZOHO_SMTP_HOST` and `ZOHO_SMTP_PASSWORD` are configured, signup requires mailbox
verification, duplicate signup responses resist enumeration, and the
forgot-password flow sends a short-lived reset link. Mail is sent from the
single Nodezuno address `info@nodezuno.com`. Without a complete valid pair, the
provider manifest hides email, Better Auth disables email/password, and
deployed readiness fails. The only exception is
`NODEZUNO_LOCAL_PREVIEW=true` with `BETTER_AUTH_URL` set to the exact HTTP
loopback origin. It exists for local testing and is not a private hosted
preview mode.

Google requests only `openid`, `email`, and `profile`. Access is online-only.
OAuth tokens are encrypted before database storage. Google remains disabled in
the interface unless both Google credentials are present.

Source code alone does not establish a production identity provider. Public
email login requires the Zoho SMTP host and app password in the deployed
runtime.
Google appears only when both deployed OAuth values are valid. Wallet methods
require production browser and replay testing. Record those checks for the
actual release before making an availability claim.

## Session contract

- Opaque session records are stored in `auth_sessions`.
- Session lifetime is seven days.
- Session refresh age is one day.
- Sensitive-session freshness is 15 minutes.
- Cookie caching is disabled so database revocation takes effect immediately.
- The cookie is host-only, HttpOnly, SameSite=Lax, and Secure on HTTPS.
- CSRF and origin validation remain enabled.
- Authentication rate limits are stored in the configured application
  database.
- Implicit account linking is disabled.

The required production variables are:

```dotenv
BETTER_AUTH_SECRET=<at-least-32-random-characters>
BETTER_AUTH_URL=https://nodezuno.com
```

Generate the secret from a cryptographically secure random source and manage it
in the cloud provider secret store. Do not copy it into source control, logs, or
client-side variables.

A container admits authentication traffic through one explicit ingress mode.
`NODEZUNO_INGRESS_MODE=direct` checks the effective host and protocol against
`PUBLIC_ORIGIN` and requires `NODEZUNO_ORIGIN_SECRET` to be completely blank.
`trusted-gateway` requires a separately managed gateway and a strong distinct
origin secret. Missing or empty mode defaults to fail-closed
`trusted-gateway`. Cloudflare Access is not a customer or administrator
application-session dependency. It is an optional verified identity overlay.
A verified Better Auth account with a real contact email is the portable
administrator default, and it must still match `NODEZUNO_ADMIN_EMAILS`.

Google additionally requires:

```dotenv
GOOGLE_CLIENT_ID=<google-client-id>
GOOGLE_CLIENT_SECRET=<google-client-secret>
```

Verified email signup, password recovery, and Nodezuno operational notices use
the existing Zoho mailbox. Configure:

```dotenv
ZOHO_SMTP_HOST=smtp.zoho.in
ZOHO_SMTP_PASSWORD=<zoho-app-password>
```

Use the exact SMTP host shown in the Zoho account's mail settings. With
multi-factor authentication enabled, create an app-specific password and
store it in the deployment secret manager. The sender and Nodezuno operational
recipient are fixed to `info@nodezuno.com`. Authentication, customer notices,
newsletter confirmations, and payment notifications use the same mailbox and
Zoho SMTP transport. Successful SMTP acceptance is not proof of inbox
delivery, and no provider webhook is configured. Confirm receipt in the actual
mailbox before public launch.

The Google OAuth application must allow this exact callback:

```text
https://nodezuno.com/api/auth/callback/google
```

For another deployed environment, replace `https://nodezuno.com` with the exact
deployed HTTPS origin in both `BETTER_AUTH_URL` and the Google console. Local
unverified email is accepted only when all of these are true:

```dotenv
NODEZUNO_LOCAL_PREVIEW=true
BETTER_AUTH_URL=http://127.0.0.1:3000
```

`http://localhost:3000` is also allowed when it is the exact configured origin.
Never set `NODEZUNO_LOCAL_PREVIEW=true` in a deployed environment.

## EVM sign-in

The browser requests an account and chain from the injected provider, then asks
the server for a one-time nonce. The signed EIP-4361 message fixes:

- scheme
- domain
- URI
- version
- statement
- account address
- EIP-155 chain ID
- issued time
- five-minute expiration
- one-time nonce

The server parses and validates all fixed fields before verifying the ECDSA
signature. A nonce is consumed once. The current standalone signature verifier
supports externally owned accounts only. The interface does not claim ERC-1271
or ERC-6492 smart-account support.

Supported chain IDs are:

```text
1, 10, 56, 137, 8453, 42161, 43114, 80002, 84532, 11155111
```

Wallet sign-in never asks for a transaction, gas payment, token approval, or
seed phrase.

## Solana sign-in

The server creates a five-minute Sign In With Solana input with a 32-character
nonce, fixed origin fields, and a unique request ID. Wallets can use the
`solana:signIn` feature directly. Compatible wallets that expose
`standard:connect` and `solana:signMessage` use the same server-generated SIWS
message.

The server:

1. Parses the signed message.
2. Finds and atomically consumes the matching one-time challenge.
3. Compares every signed field with the stored challenge.
4. Validates the issue and expiration window.
5. Decodes the base58 account into a 32-byte Ed25519 public key.
6. Verifies the signature with the official Wallet Standard utility.
7. Creates or resolves the stable account and database session.

Wallet-only accounts receive an internal synthetic email under the reserved
`.invalid` namespace because the core auth model requires an email field. That
value is never displayed, used for contact, used for authorization, or treated
as verified. In particular, it cannot satisfy administrator identity even if
someone mistakenly adds the synthetic value to `NODEZUNO_ADMIN_EMAILS`.

Request history is authorized by stable `auth_users.id`, never by an
unverified profile email or synthetic wallet email. New submissions created
under an application session store the owning account ID. The retained trusted
hosting identity can still resolve legacy email-attributed submissions.

## Account linking

Automatic linking is intentionally disabled. Two providers reporting the same
email is not enough evidence to merge accounts.

A future explicit linking flow must require:

1. A fresh session for the current account.
2. New proof from the identity being attached.
3. An atomic check that the identity is not already owned.
4. A rule that prevents unlinking the last recovery method.

Until that flow ships, users should continue with the provider originally used
for the account.

## Deployment checklist

1. Select one database driver and apply all reviewed migrations before routing
   authentication traffic.
2. Set `BETTER_AUTH_SECRET` and the exact HTTPS `BETTER_AUTH_URL`.
3. For a container, select one ingress mode, verify its exact secret rule, and
   set `PUBLIC_ORIGIN` equal to `BETTER_AUTH_URL`.
4. Configure `ZOHO_SMTP_HOST` and the protected `ZOHO_SMTP_PASSWORD` before
   public email signup. Set the administrator allowlist to
   `info@nodezuno.com`.
5. Verify the email-worker schedule and confirm a real message arrives in the
   `info@nodezuno.com` mailbox. No webhook endpoint is used.
6. Confirm `/api/v1/auth/providers` omits email when the pair is missing or
   invalid, and reports verification and recovery only when both values pass.
7. Verify `/api/v1/ready`.
8. Create an email account, verify the mailbox, reset the password, and confirm
   old sessions are revoked.
9. Sign out and confirm the current session is revoked.
10. Test an EVM signature, a rejected signature, an expired challenge, and a
   replay.
11. Test a Solana signature, a rejected signature, an expired challenge, and a
   replay.
12. Configure Google only after the callback, consent screen, homepage, privacy
   policy, and terms pages use the final production domain.
13. Verify an allowlisted real-email application account can use `/admin`, an
   unlisted real-email account receives `403`, and a wallet-only account
   receives `403`.
14. If a Sites/Cloudflare Access identity overlay is configured, verify its
   signature and claims and require the same administrator allowlist.
15. Keep customer authentication public while protecting `/admin` with the
   application identity, real-email, allowlist, and same-origin controls.
16. Review session and authentication rate-limit events before widening
   access.

For local end-to-end protocol evidence, start the loopback application and run:

```bash
pnpm run smoke:auth -- http://localhost:3000
```

The smoke suite uses real HTTP email signup and session creation, verifies an
EVM SIWE signature and session, verifies a Solana signature and session, and
confirms that both wallet signatures fail on replay. It refuses non-loopback
targets. Passing it does not verify mailbox ownership, Google OAuth,
production-domain wallet prompts, edge policy, or public reachability.
