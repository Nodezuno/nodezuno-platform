# Ethereum verified light-client runbook

**Audience:** Nodezuno operators and security reviewers

**Evidence date:** 3 August 2026

**Capability label:** Local verified light-client lab

## What is running

The local Mac profile runs Helios `0.11.1` as a real Ethereum Mainnet light
client. It serves JSON-RPC only on `http://127.0.0.1:18545`, is supervised by
the macOS `launchd` service `com.nodezuno.ethereum-light`, and stores its small
runtime state outside the repository under:

```text
~/Library/Application Support/Nodezuno/ethereum-light
```

Its login-persistent launch definition is stored at:

```text
~/Library/LaunchAgents/com.nodezuno.ethereum-light.plist
```

The plist contains runtime paths, not provider credentials. Helios reads its
owner-only configuration after launch, so the service loads again at the next
user login instead of depending on a terminal session.

The endpoint is attached to the native Nodezuno application through the exact
operator configuration:

```dotenv
NODEZUNO_ALLOW_ETHEREUM_HTTP_LOOPBACK=true
NODEZUNO_RPC_UPSTREAMS_JSON='{"ethereum":[{"name":"helios","url":"http://127.0.0.1:18545/","timeoutMs":8000}]}'
```

This is a useful, real integration target under the requested 100 GB limit. It
is not a full Ethereum node and it is not ready to support a commercial RPC
service-level agreement.

## Why this profile uses a light client

A normal post-Merge Ethereum node runs both an execution client and a consensus
client. Ethereum's current node guide recommends a 2 TB SSD and lists current
snap-synced execution data in the hundreds of gigabytes, plus consensus data.
That does not fit the requested under-100-GB Mac profile. See the official
[Ethereum node guide](https://ethereum.org/developers/docs/nodes-and-clients/run-a-node/)
and [node architecture](https://ethereum.org/developers/docs/nodes-and-clients/node-architecture/).

Helios is a consensus and execution light client. Its official documentation
says it can turn an untrusted execution RPC into a locally verified RPC, sync
quickly, and store only a cached checkpoint. See the
[Helios repository](https://github.com/a16z/helios) and the pinned
[Helios 0.11.1 release](https://github.com/a16z/helios/releases/tag/0.11.1).

Ethereum's light-client guide currently says that no light client is known to
be production-ready. Helios also states that it has not been audited and makes
no safety or correctness guarantee. Those constraints are release blockers for
a customer SLA, not reasons to hide or mislabel the working local lab. See the
official [Ethereum light-client guide](https://ethereum.org/developers/docs/nodes-and-clients/light-clients/).

## Trust and availability model

Helios verifies supported execution results against Ethereum consensus state.
It does not obtain all required data from Ethereum peers by itself. The local
profile currently depends on two external data sources:

| Dependency | Current local-lab source | Trust boundary |
| --- | --- | --- |
| Execution data | `https://ethereum-rpc.publicnode.com` | Temporary third-party availability source. It must support `eth_getProof`. Helios verifies supported responses, but the provider can delay, omit, censor, rate-limit, or stop serving data. |
| Consensus light-client updates | `http://testing.mainnet.beacon-api.nimbus.team` | Exact-host exception for the official Nimbus disposable testing endpoint. Helios verifies updates from the pinned checkpoint, but plaintext HTTP permits observation, blocking, delay, and response tampering attempts. Invalid cryptographic data should be rejected, while availability remains vulnerable. |
| Weak-subjectivity root | Recent operator-approved beacon block root | Root of trust. A malicious checkpoint can lead the client to the wrong chain. It must be recent and independently checked. |

Nimbus documents its testing endpoint for tooling tests and warns that it may
be unavailable or disabled without notice. The scripts therefore accept this
one HTTP URL exactly. They do not allow arbitrary plaintext consensus URLs.
Replace it with an operator-controlled HTTPS Beacon API before any production
trial. See the official [Nimbus Beacon API guide](https://nimbus.guide/rest-api.html)
and [Nimbus light-client data guide](https://nimbus.guide/light-client-data.html).

The runtime always enables Helios strict checkpoint-age checking. It does not
enable Helios's community fallback discovery because Helios documents that
fallback as insecure and unsuitable for production.

## Release integrity

The installer is pinned to the official Apple Silicon asset and fails closed
on an unexpected size, archive digest, archive layout, binary digest, CPU, OS,
or reported version.

| Field | Pinned value |
| --- | --- |
| Version | `0.11.1` |
| Asset | `helios_darwin_arm64.tar.gz` |
| Archive size | `5,104,338` bytes |
| Official archive SHA-256 | `fc88981c7fe12e1010115b7bfe61909cfae36f65177325562c57daa0eb30ae8c` |
| Extracted binary SHA-256 | `e4b25bde03b655188900fedd4f57218ed2fe4b023a7873a857f7c26aca09cdc1` |

GitHub's release metadata supplies the archive digest. The binary digest is a
second pin derived from that verified archive. The Mach-O executable is ad hoc
linker-signed, not signed with an identified Apple Developer team. SHA-256
verification is therefore the enforced artifact identity boundary.

Do not update the version, URL, size, or either digest independently. Review a
new official release, retrieve its official asset digest, inspect its source
and release notes, derive the extracted binary digest, then update all pins in
one reviewed change.

## Install and configure

Requirements:

- Apple Silicon Mac
- `curl`, `shasum`, `tar`, `awk`, `jq`, `launchctl`, and `plutil`
- an owner-controlled account and owner-only Nodezuno runtime directory
- a recent independently verified Ethereum Mainnet checkpoint

From the repository root:

```bash
./ops/ethereum-light/install.sh
```

The installer downloads from the pinned GitHub release when no path is passed.
For an already downloaded artifact, it also supports an offline verification
path:

```bash
./ops/ethereum-light/install.sh /absolute/path/to/helios_darwin_arm64.tar.gz
```

Obtain a checkpoint candidate:

```bash
./ops/ethereum-light/checkpoint-candidate.sh
```

That command only prints a candidate and source metadata. It never updates the
runtime configuration. Compare the beacon block root with at least one
independent source, confirm that it is the first block in a finalized epoch,
and record the reviewer and time outside this repository.

Configure without putting a provider token into a process argument:

```bash
HELIOS_EXECUTION_RPC='https://ethereum-rpc.publicnode.com' \
HELIOS_CHECKPOINT='<recent-reviewed-0x-block-root>' \
./ops/ethereum-light/configure.sh
```

`configure.sh` writes `config.json` with mode `0600`. A production-like lab can
also provide a reviewed HTTPS Beacon API:

```bash
HELIOS_EXECUTION_RPC='https://execution.operator.example/v1/project' \
HELIOS_CONSENSUS_RPC='https://beacon.operator.example' \
HELIOS_CHECKPOINT='<recent-reviewed-0x-block-root>' \
./ops/ethereum-light/configure.sh
```

The execution URL is passed to Helios through its environment, not as a visible
command-line argument. It is still readable by the same operating-system user
and administrators. Treat the runtime configuration as a secret.

## Operate and verify

Start or idempotently verify the launch service:

```bash
./ops/ethereum-light/start.sh
```

Check full readiness:

```bash
./ops/ethereum-light/status.sh
./ops/ethereum-light/probe.sh
```

The probe requires all of the following before returning `status: ready`:

- JSON-RPC is reachable only through the configured loopback port;
- `eth_chainId` returns exactly `0x1`;
- `eth_blockNumber` returns a nonzero hexadecimal block number;
- `eth_getBalance` returns a valid quantity for the beacon deposit contract;
- `eth_getProof` returns a structurally valid account proof with at least one
  proof node.

Chain ID alone is not readiness. Helios can open its RPC listener before its
consensus client is synchronized. The start script waits for the full probe and
unloads the launch service if readiness does not arrive within 60 seconds.

Stop cleanly:

```bash
./ops/ethereum-light/stop.sh
```

The stop command asks `launchd` to terminate and unload the service. It does not
use an unconditional force kill.

Logs are owner-only at:

```text
~/Library/Application Support/Nodezuno/ethereum-light/logs/helios.log
```

Do not publish the log before reviewing it for provider URLs and operational
metadata.

## Attach to Nodezuno

Attachment is a separate, explicit action. Installing or starting Helios never
changes the Nodezuno application environment.

First require a passing full probe, then atomically update the native Mac
profile:

```bash
./ops/ethereum-light/attach-nodezuno.sh
./ops/ethereum-light/attach-nodezuno.sh --check
```

The helper:

- refuses symbolic links, unexpected ownership, broad permissions, and
  duplicate definitions;
- requires the full live Helios probe before writing;
- changes only the loopback flag and Ethereum upstream lines;
- hashes all untouched configuration lines before and after the rewrite;
- uses an owner-only temporary file and atomic rename;
- preserves mode `0600`; and
- does not restart Nodezuno.

Load the reviewed change explicitly:

```bash
./deploy/local-mac/stop.sh
./deploy/local-mac/start.sh
./deploy/local-mac/health.sh
```

Only the same-host container runtime accepts this exact uncredentialed loopback
root URL. Sites mode, a disabled flag, credentials, another host, another port,
a path, a fragment, or a non-Ethereum network remains rejected.

## Current evidence

On 3 August 2026, the installed persistent profile passed from a fresh launch
with:

```text
Helios version: 0.11.1
Launch service: com.nodezuno.ethereum-light
Bind: 127.0.0.1:18545
Chain ID: 0x1
Block number: 0x187c6b4
eth_getProof account proof nodes: 8
```

Block numbers and balances change continuously. This record proves only that
the local integration worked at the evidence time. It is not uptime history,
capacity evidence, or a customer SLA.

## Failure handling

### Checkpoint is too old

Do not disable strict checkpoint-age checking. Obtain a fresh candidate,
independently verify it, re-run `configure.sh`, then stop and start the service.
Perform this review well before the two-week limit.

### `out of sync` or invalid `eth_blockNumber`

The consensus source may not support the Beacon light-client update endpoints,
may return an oversized or interrupted response, or may be unavailable. Chain
ID can still work in this state. Treat the service as unavailable, inspect the
owner-only log, and change to a reviewed compatible Beacon API. Do not route
customer traffic based on chain ID alone.

### `unmanaged_listener`

Another process owns the configured port without the Nodezuno launch service.
Identify it with:

```bash
lsof -nP -iTCP:18545 -sTCP:LISTEN
```

Do not kill an unknown process automatically. Confirm its owner and command,
stop it through its supervisor, then start Helios again.

### Public provider failure

PublicNode and the Nimbus testing service have no Nodezuno-controlled
availability commitment. A failure is expected lab behavior. Do not bypass
verification, enable external checkpoint fallback, broaden plaintext URL
acceptance, or expose port 18545 to compensate.

## AWS translation

The Mac profile models one stateful application host. A production AWS design
must replace local conveniences with explicit cloud controls:

| Mac lab | AWS production analogue |
| --- | --- |
| `launchd` | `systemd`, ECS, or another supervised service with health checks |
| Application Support directory | encrypted EBS volume or immutable image plus encrypted state volume |
| owner-only JSON and env files | Secrets Manager or Parameter Store with a narrow IAM role |
| `127.0.0.1:18545` | same-task loopback, Unix socket, or a private subnet endpoint protected by security groups and TLS |
| public execution and Nimbus test endpoints | operator-owned nodes or contracted providers with capacity, regional failover, and alerts |
| manual checkpoint review | documented multi-source checkpoint ceremony with rotation and audit evidence |

Never expose the Helios RPC listener, execution provider credential, Beacon API
administration surface, Engine API, signer, validator keys, or Nodezuno origin
secret to the public internet. If Nodezuno and Helios run on different hosts,
do not use the local HTTP exception. Use private networking plus authenticated
TLS and add a separately reviewed private-upstream mode.

## Production promotion gates

Do not market this profile as production RPC until all of these gates pass:

1. Replace both public lab dependencies with capacity-backed, monitored
   operator endpoints.
2. Replace plaintext consensus transport with HTTPS or a private authenticated
   transport.
3. Establish checkpoint quorum, approval, rotation, and emergency recovery.
4. Complete a security review of Helios, its supported method set, proof
   verification, dependency chain, and release process.
5. Run failure, corruption, stale-head, provider equivocation, rate-limit,
   latency, restart, and host-reboot exercises.
6. Add redundant hosts and independent providers across failure domains.
7. Measure method correctness and latency against independent full nodes.
8. Define support ownership, paging, customer incident communication, and an
   evidence-backed service objective.

Until then, the correct customer-facing description is `verified light-client
lab` or `beta`, never `full node`, `decentralized RPC`, or `production SLA`.
