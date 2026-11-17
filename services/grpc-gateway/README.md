# Nodezuno native gRPC gateway

This directory is a separate Go deployment target for authenticated native
gRPC clients. It is not part of the Next.js process and is not an HTTP/JSON
transcoder.

The gateway currently exposes one Ethereum service:

```text
/nodezuno.ethereum.v1.EthereumProxy/Call
```

The production authentication mode uses the same workspace, service, and API
key lifecycle as the Nodezuno console. A company can create a `grpc-api`
service and a `grpc:invoke` key without contacting Nodezuno. Each call is
authorized against the private website control-plane route before the gateway
forwards one allowlisted method to the configured Ethereum provider set.

The repository does not contain a blockchain node, provider credential,
fallback response, or claim that a public gRPC deployment exists. Operators
must attach a real Ethereum mainnet endpoint and complete the release evidence
in this document.

## Architecture

```text
Customer gRPC client
  | TLS and HTTP/2
  v
Trusted gRPC edge
  | HTTP/2 cleartext, h2c, only on the private platform network
  v
Native Go gateway
  | private HTTPS authorization decision
  +--------------------------> Nodezuno website control plane and D1
  |
  | HTTPS with isolated provider credentials
  v
Ordered operator-managed Ethereum mainnet providers
```

Control-plane mode is the supported shared-customer model:

1. The client sends exactly one bearer key and one service identifier.
2. The gateway sends the service identifier and raw key to the private
   authorization route over HTTPS with a separate gateway secret.
3. The control plane hashes and validates the key against D1, requires the
   `grpc:invoke` scope, checks any service restriction, and confirms that the
   target is an active `grpc-api` service in the same workspace.
4. Only an authorized call reaches the Ethereum upstream.

The raw customer key is used only for the decision request. It is not stored by
the gateway or forwarded to the Ethereum node. The gateway secret is an
internal machine credential and must never be issued to customers.

## Protobuf contract

The source contract is
[`proto/nodezuno/ethereum/v1/ethereum_proxy.proto`](proto/nodezuno/ethereum/v1/ethereum_proxy.proto).
It uses `google.protobuf.Struct` so method-specific Ethereum JSON values retain
their shape.

| Request field | Type | Rule |
| --- | --- | --- |
| `method` | string | Required and present in `ETHEREUM_ALLOWED_METHODS` |
| `params` | list | Optional positional JSON-RPC parameters, defaults to `[]` |
| `request_id` | string | Optional 1 to 128 character safe identifier |

The response contains `jsonrpc: "2.0"` and `request_id`, plus either `result`
or a valid upstream JSON-RPC `error`. Authentication, admission, deadline,
transport, size, and malformed-upstream failures use gRPC status codes.

The standard `grpc.health.v1.Health` service is also registered. Its `Check`,
`List`, and `Watch` methods are intentionally unauthenticated for
infrastructure probes. The service name `nodezuno-native-grpc-liveness` stays
`SERVING` while the process can answer gRPC health calls. The named Ethereum
service remains dependency-aware and is the readiness target.

## Customer metadata

Every non-health call requires exactly one value for each metadata field:

```text
authorization: Bearer nzu_live_<key-id>_<secret>
x-nodezuno-service-id: <grpc-api-service-uuid>
```

The service identifier must be a lowercase UUIDv4. Duplicate values, an
invalid key shape, an invalid service identifier, a revoked or expired key, a
missing `grpc:invoke` scope, a service-restricted key used for another service,
or a service from another workspace all fail closed.

Health calls do not require customer metadata. Do not treat unauthenticated
health access as permission to invoke the proxy.

## Readiness semantics

The process starts in `NOT_SERVING`. Every 15 seconds it checks both real
dependencies:

- the configured authorization validator is ready;
- at least one available configured Ethereum upstream answers `eth_chainId`
  with exactly `0x1`.

In `control-plane` mode, authorization readiness calls the private D1-backed
route with a sentinel key and requires a valid denial response. In
`static-digest` mode, readiness requires at least one configured digest.

The named Ethereum service and aggregate health status become `SERVING` only
after both checks pass. The separate liveness service is not a dependency
check. All non-health calls are blocked with `Unavailable` whenever the
readiness gate is closed. A ready result therefore proves recent
authorization-path and Ethereum-mainnet availability through the failover
caller. It does not prove every provider, every allowed method, historical
depth, customer entitlement, or regional capacity.

## Production configuration

Copy [`config.example.env`](config.example.env) into a secret-managed runtime
configuration. Do not commit the populated file.

Required control-plane settings:

```dotenv
ETHEREUM_UPSTREAMS_JSON=[{"name":"primary","url":"https://primary.example/rpc-secret-path","timeout":"3s","headers":{"Authorization":"Bearer <provider-token>"}},{"name":"secondary","url":"https://secondary.example/mainnet","timeout":"3s","headers":{}}]
ETHEREUM_RPC_URL=
ETHEREUM_RPC_HEADERS_JSON=
NODEZUNO_GRPC_AUTH_MODE=control-plane
NODEZUNO_GRPC_AUTH_URL=https://nodezuno.com/api/v1/internal/grpc/authorize
NODEZUNO_GRPC_AUTH_SECRET=<distinct-32-to-256-character-secret>
NODEZUNO_GRPC_AUTH_TIMEOUT=2s
GRPC_API_KEY_SHA256=
```

`NODEZUNO_GRPC_AUTH_URL` must be the exact HTTPS path shown above on a public
DNS hostname using port 443. The same `NODEZUNO_GRPC_AUTH_SECRET` must be
supplied to the website control plane and the Go gateway. It must contain 32
to 256 safe ASCII characters, contain at least eight distinct characters, and
remain different from `BETTER_AUTH_SECRET`, `API_KEY_PEPPER`,
`RATE_LIMIT_SECRET`, and `NODEZUNO_ORIGIN_SECRET`.

`ETHEREUM_UPSTREAMS_JSON` is the production provider contract. It must be one
JSON array with one to four ordered objects and no trailing document. The raw
value is limited to 64 KiB. Every object requires exactly these fields:

| Field | Rule |
| --- | --- |
| `name` | Unique lowercase slug matching `^[a-z][a-z0-9-]{0,31}$` |
| `url` | Unique exact HTTPS URL without user information or a fragment |
| `timeout` | Per-attempt duration from 100 ms through 30 seconds |
| `headers` | Provider-only credential object, including `{}` when unused |

Unknown fields, duplicate object fields, duplicate names, duplicate canonical
URLs, missing fields, HTTP URLs, and unsafe headers fail startup. Multi-provider
mode also rejects `GRPC_ALLOW_INSECURE_UPSTREAM=true`.

Each `headers` object accepts `Authorization` and normal provider headers such
as `X-API-Key`. Values must be strings with 8 to 2,048 visible ASCII
characters and no surrounding whitespace. Each object is limited to 16
headers and 16 KiB. Duplicate names are rejected without regard to case.
Request-control, forwarding, proxy, hop-by-hop, tracing, Nodezuno identity,
content framing, and idempotency headers are rejected. Configured headers are
copied into one provider client at startup and cannot override the gateway's
fixed JSON content headers.

Keep the entire populated array in one platform secret. URLs can contain path
or query credentials, so the whole value is sensitive. Never place it in a
committed environment file, build argument, image layer, support ticket, or
deployment log. A provider receives only its own configured headers. Customer
gRPC metadata and another provider's credentials are never forwarded to it.

The upstream URL validator intentionally accepts HTTPS IP literals, internal
DNS names, and private-network nodes because operators may attach a managed
cloud node through private networking. It does not resolve DNS or claim to
prevent DNS rebinding. Production egress controls must restrict the gateway to
the intended endpoint, port, and network path. Prefer provider-owned DNS,
private service networking, certificate validation, and an egress allowlist.

### Ordered failover behavior

Provider order is deterministic. A successful primary response makes one
provider request and does not touch a secondary. For a provider-level
transport, HTTP status, deadline, size, malformed-response, or wrong-mainnet
chain result, the safe read-only caller can try the next available provider.
One customer call makes no more than two provider attempts.

Each failed provider circuit cools down for 30 seconds. Calls skip open
circuits while retaining configured order. With three or four providers, later
calls and readiness probes can advance to providers that were not among an
earlier call's two attempts. When every circuit is open, the caller fails
closed without exposing a provider name, URL, header, or transport error.

Per-provider deadlines are also constrained by the request's overall
`GRPC_UPSTREAM_TIMEOUT`; when two attempts are available, the first cannot
consume the entire remaining request budget. An `eth_chainId` attempt is capped
at two seconds and counts as usable only for the exact string `0x1`. A valid
JSON-RPC application error is returned without retry for normal methods.

Failover applies only to the hardcoded read-only beta catalog. The configuration
parser rejects privileged namespaces, signing, account, mining, filter,
subscription, transaction submission, and unknown methods.
`eth_sendRawTransaction` is not enabled in this beta.

### Single-upstream compatibility path

`ETHEREUM_RPC_URL` and `ETHEREUM_RPC_HEADERS_JSON` remain compatibility-only.
They are accepted only when `ETHEREUM_UPSTREAMS_JSON` is empty. Setting either
legacy variable together with the multi-provider array fails startup. The
legacy URL uses `GRPC_UPSTREAM_TIMEOUT` as its single attempt timeout.

HTTPS remains the default for the compatibility path. Plain HTTP is accepted
only when `GRPC_ALLOW_INSECURE_UPSTREAM=true`; use that exception only for a
protected private network. New production deployments should use the strict
secret-backed multi-provider array even when initially configuring one entry.

Other bounded settings are documented in
[`config.example.env`](config.example.env):

- request size: 1 MiB default, 4 MiB maximum;
- response size: 4 MiB default, 16 MiB maximum;
- concurrent calls: 128 default, 10,000 configuration maximum;
- upstream timeout: 12 seconds default, 100 ms to 60 seconds;
- authorization timeout: 2 seconds default, 100 ms to 10 seconds;
- graceful shutdown timeout: 20 seconds default, 1 second to 2 minutes;
- configured Ethereum method set, restricted to the read-only beta catalog.

## TLS edge and h2c boundary

Internet-facing customer traffic must use TLS and native HTTP/2.

Behind Cloud Run or another trusted gRPC-capable TLS edge, leave
`GRPC_TLS_CERT_FILE` and `GRPC_TLS_KEY_FILE` empty. The edge terminates TLS and
forwards h2c to the container on the platform's private network. Never expose
that cleartext container listener directly to the public internet.

When the Go process terminates TLS itself, configure both certificate file
variables. Configuring only one fails startup. Mount the files read-only and
rotate them through the platform secret or certificate manager.

Do not deploy through an edge that downgrades the backend connection to
HTTP/1.1. On AWS, use a load balancer and target group configured for gRPC and
HTTP/2. Verify the public endpoint with a real gRPC health call after every
network or deployment change.

## Local validation with the website

Go 1.25 or newer is required. The container build pins its own Go toolchain.

From this directory:

```bash
node ./scripts/verify-contract.mjs
go test ./...
go build ./cmd/server
```

For an integrated local test, run the website with a real D1 binding and the
same secret used by the gateway. Because production URL validation requires a
public HTTPS control-plane hostname, use a protected HTTPS development
hostname or test the Go packages with their injected HTTP clients. The
repository's Compose profile is intended for a deployment-like environment.
Run these commands from the repository root:

```bash
cp services/grpc-gateway/config.example.env \
  services/grpc-gateway/config.env
docker compose --profile native-grpc up --build
```

The profile binds the local gateway only to `127.0.0.1:50051`. Populate
`config.env` with a real Ethereum provider set and valid control-plane values
before starting it.

Invoke the proxy with the customer key and its provisioned service ID:

```bash
grpcurl -plaintext \
  -H "authorization: Bearer ${NODEZUNO_API_KEY}" \
  -H "x-nodezuno-service-id: ${NODEZUNO_GRPC_SERVICE_ID}" \
  -import-path ./services/grpc-gateway/proto \
  -proto nodezuno/ethereum/v1/ethereum_proxy.proto \
  -d '{"method":"eth_chainId","params":[],"request_id":"local-check"}' \
  localhost:50051 \
  nodezuno.ethereum.v1.EthereumProxy/Call
```

Probe health without a customer key:

```bash
grpcurl -plaintext \
  -d '{"service":"nodezuno.ethereum.v1.EthereumProxy"}' \
  localhost:50051 \
  grpc.health.v1.Health/Check
```

Expected healthy output includes `"status": "SERVING"`. Also prove that a
missing header, wrong service ID, revoked key, and mismatched key restriction
cannot invoke the proxy.

## Isolated static-digest fallback

`static-digest` mode is an explicit isolated or emergency fallback. It is not
managed by the customer console and does not share revocation, expiry, scope,
workspace, or service lifecycle with D1.

To use it:

1. Set `NODEZUNO_GRPC_AUTH_MODE=static-digest`.
2. Clear `NODEZUNO_GRPC_AUTH_URL`, `NODEZUNO_GRPC_AUTH_SECRET`,
   `NODEZUNO_GRPC_AUTH_TIMEOUT`, and the unsupported
   `NODEZUNO_GRPC_SERVICE_ID`.
3. Set `GRPC_API_KEY_SHA256` to one or more comma-separated SHA-256 digests,
   with at most 32 unique digests.
4. Continue sending a syntactically valid
   `x-nodezuno-service-id` value on client calls. Static mode ignores its
   value, but the transport metadata contract remains strict.

Generate one isolated key and digest locally:

```bash
GRPC_API_KEY="$(openssl rand -hex 32)"
GRPC_API_KEY_SHA256="$(
  printf '%s' "$GRPC_API_KEY" | shasum -a 256 | awk '{print $1}'
)"
```

Store the raw key only in the client secret manager and the digest only in the
gateway secret manager. Use overlapping digests during static-key rotation.
Return to control-plane mode as soon as the isolated incident is resolved.

## Control-plane secret rotation

Customer API keys can be created, restricted, revoked, and replaced through
the normal console lifecycle. The internal
`NODEZUNO_GRPC_AUTH_SECRET` has a different rotation procedure.

The current source accepts one control-plane secret at a time and does not
provide an old/new overlap window. Rotate it as a coordinated maintenance
operation:

1. Generate a new random value in the secret manager without printing it to
   logs, shell history, tickets, or deployment output.
2. Record only the secret version identifiers and rollout owner.
3. Update the website and gateway secret references through the deployment
   platform.
4. Roll both services in a controlled window. A version mismatch must produce
   `NOT_SERVING` and blocked proxy calls, never an authorization bypass.
5. Confirm the sentinel authorization readiness check, Ethereum mainnet
   readiness, one authorized customer call, and one denied call.
6. Retire the previous secret version after every old instance has drained.

If uninterrupted overlap is required, first implement and review dual-secret
acceptance in both components. Do not improvise overlap by reusing another
runtime secret.

## Container and Cloud Run

Build from the gateway directory:

```bash
docker build -t nodezuno-native-grpc:local .
```

The final image is a non-root static binary with CA roots and no shell. The
builder uses a pinned Go toolchain newer than the `go 1.25.0` module language
floor, disables automatic toolchain switching, verifies downloaded modules,
and builds with `-mod=readonly`. Supply all secrets at runtime and record the
immutable image digest.

[`cloudrun.service.example.yaml`](cloudrun.service.example.yaml) is the
provider-specific example for a low-idle-cost first deployment. It configures
an h2c container port, control-plane mode, bounded scale and resources, gRPC
health probes, and Secret Manager references for the complete upstream array
and internal authorization secret:

```bash
gcloud run services replace \
  services/grpc-gateway/cloudrun.service.example.yaml \
  --region REGION
```

Create `nodezuno-ethereum-upstreams` with the complete
`ETHEREUM_UPSTREAMS_JSON` value and `nodezuno-grpc-auth-secret` with the
internal control-plane secret. Grant the placeholder runtime service account
access only to those required secret versions and network destinations.

Replace every placeholder and image tag before use. The example is source
configuration, not evidence that a Cloud Run service exists. Choose ingress
and Cloud Run IAM deliberately. If the public customer endpoint does not
require IAM, the Nodezuno bearer and service checks remain mandatory for every
proxy call. If IAM remains enabled, customers must satisfy both authentication
layers.

The Cloud Run startup and liveness probes use
`nodezuno-native-grpc-liveness`. The readiness probe uses
`nodezuno.ethereum.v1.EthereumProxy`, so a revision receives traffic only
after authorization readiness and an Ethereum mainnet proof both succeed.

Configure `NODEZUNO_GRPC_PUBLIC_ENDPOINT` on the website only after the public
TLS endpoint passes the named health check. The website hides gRPC provisioning
when endpoint validation, internal-secret validation, or live health fails.

## Provider-neutral Kubernetes example

[`kubernetes.deployment.example.yaml`](kubernetes.deployment.example.yaml)
contains a Deployment, an internal `ClusterIP` Service, and a
PodDisruptionBudget. It targets Kubernetes v1.27 or newer because built-in gRPC
probes became stable in that release.

The Deployment includes:

- two replicas with a rolling update policy of zero unavailable and one surge;
- non-root UID and GID `65532`, `RuntimeDefault` seccomp, all capabilities
  dropped, no privilege escalation, and a read-only root filesystem;
- no mounted service-account token or injected Service environment variables;
- CPU and memory requests and limits that are starting bounds, not measured
  capacity claims;
- a 35-second termination grace period for the configured 20-second gRPC
  graceful shutdown;
- gRPC startup and liveness probes against the process-only liveness service;
- a gRPC readiness probe against the dependency-aware Ethereum service;
- Secret references for `ETHEREUM_UPSTREAMS_JSON` and the control-plane
  authorization secret;
- a preferred topology spread and a disruption budget requiring one available
  replica during voluntary evictions.

Provision `nodezuno-native-grpc-secrets` through the cluster's secret manager,
external secret controller, or another audited channel. It must expose keys
`ethereum-upstreams.json` and `control-plane-auth-secret`. Do not commit a
Kubernetes Secret containing real values. Replace the image placeholder with
an immutable digest before applying the example.

The included Service is `ClusterIP` only. It does not create an Ingress,
`LoadBalancer`, `NodePort`, public endpoint, or TLS policy. Add a
provider-appropriate gRPC edge that terminates public TLS, preserves HTTP/2,
and sends cleartext h2c only across a trusted cluster network. Add egress
policy for the exact control-plane and provider destinations in the target
cluster. The example cannot safely invent those destination CIDRs or DNS
controls.

The PodDisruptionBudget limits voluntary evictions. It does not prevent node,
network, zone, application, or forced-deletion failures, and it does not
control Deployment rolling updates. Validate both the rolling strategy and
the budget in the chosen cluster.

## Security controls

- Redirects from the Ethereum upstream are rejected.
- Each provider client makes one HTTP attempt and rejects redirects. A safe
  read-only gateway call can make at most two attempts across isolated
  providers. Configured idempotency headers are rejected and request bodies
  are not marked replayable by an individual provider client.
- Customer authorization is not forwarded upstream.
- Provider names, URLs, configured header values, customer metadata, and raw
  provider transport errors are not logged or returned to customers.
- Successful upstream responses require an `application/json`,
  `application/json-rpc`, or `application/*+json` media type.
- If a valid upstream JSON-RPC error reflects a configured URL path or query
  token, provider header value, or bearer token, the returned message and
  nested error data replace it with `[redacted]`.
- The private authorization response is limited to 4 KiB, requires JSON,
  rejects unknown fields, and fails closed on any malformed response.
- The private decision route is independently rate limited by gateway identity
  and request fingerprint.
- gRPC request, response, header, connection age, concurrency, and deadline
  limits are enforced in the process.
- The Ethereum method policy is restricted to an explicit read-only beta
  catalog; transaction submission is disabled.
- Customer calls are blocked while either authorization or upstream readiness
  is unavailable.
- The internal authorization URL disallows redirects, user information,
  special-use hostnames, IP literals, query strings, fragments, and non-443
  ports.
- Runtime secrets, customer keys, node URLs, request parameters, and response
  bodies must be absent from application, edge, and deployment logs.

Platform controls must also restrict egress to the intended control-plane and
Ethereum destinations, protect h2c traffic inside the platform network, and
alert on authentication failures, readiness transitions, upstream errors,
saturation, latency, instance count, and spend.

## Production release evidence

Before describing native gRPC as released:

- run `node ./scripts/verify-contract.mjs`, `go test ./...`, and
  `go build ./cmd/server` from the exact commit;
- build the image without embedded secrets and record its digest;
- verify the public endpoint preserves TLS and HTTP/2 through the chosen edge;
- prove readiness is `NOT_SERVING` for only wrong-chain or unavailable
  providers, an unavailable control plane, or a wrong gateway secret;
- prove readiness becomes `SERVING` when at least one available configured
  provider proves `eth_chainId` as `0x1`;
- prove valid, revoked, expired, restricted, cross-workspace, and unscoped
  customer-key decisions against the deployed D1 environment;
- verify all enabled methods against the selected real provider set;
- prove primary success uses one provider, retryable primary failure can use a
  secondary, no call exceeds two attempts, circuits cool down, and credentials
  never cross provider boundaries;
- verify disallowed methods, malformed envelopes, mismatched response IDs,
  timeouts, oversized responses, and saturation fail as documented;
- inspect edge, application, and deployment logs for secret or payload leaks;
- exercise customer-key revocation and the coordinated internal-secret
  rotation procedure;
- configure resource, instance, traffic, and spend limits;
- record the operator, upstream owner, chain, region, release time, rollback,
  monitors, and incident contact.

Until this evidence exists, the gateway is a production-oriented deployment
target in source, not evidence of a live public service.

## Primary references

- [gRPC health checking](https://grpc.io/docs/guides/health-checking/)
- [gRPC for Go](https://grpc.io/docs/languages/go/)
- [Protocol Buffers Go reference](https://protobuf.dev/reference/go/)
- [Cloud Run end-to-end HTTP/2](https://cloud.google.com/run/docs/configuring/http2)
- [Cloud Run gRPC health checks](https://cloud.google.com/run/docs/configuring/healthchecks)
- [Kubernetes gRPC probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
- [Kubernetes disruptions and budgets](https://kubernetes.io/docs/concepts/workloads/pods/disruptions/)
- [AWS gRPC target groups](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-target-groups.html)
