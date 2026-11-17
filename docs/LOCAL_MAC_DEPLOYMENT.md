# Native macOS single-host deployment

This profile runs Nodezuno as a real long-lived service on one Mac. It models
the low-cost first AWS topology: one application host, one persistent disk,
one supervised web process, and separately supervised blockchain clients on
loopback interfaces. It does not use Docker, ChatGPT Sites, or an ephemeral
development server.

The profile is appropriate for local integration, operator rehearsal, and a
private founder environment. It is not a public production launch by itself.
The generated origin is loopback HTTP, external email delivery is disabled by
default, there is no TLS load balancer, and one SQLite process cannot be
scaled horizontally. The AWS mapping later in this document identifies the
production replacements.

## What the installer creates

The default runtime root is:

```text
~/Library/Application Support/Nodezuno/
├── backups/       Verified SQLite backups and manifests
├── bin/           Private service runner
├── config/        Owner-only environment file
├── data/          Durable SQLite database and WAL files
├── locks/         Persistent files for kernel-managed operation locks
├── logs/          launchd standard output and error logs
├── releases/      Immutable Next.js standalone releases
├── tmp/           Atomic release-switch staging
├── toolchains/    Optional pinned Node.js and pnpm installation
└── current        Symlink to the active release
```

Directories are mode `0700`. The generated environment and database are mode
`0600`. Secrets are created independently with `openssl rand`, written only to
the owner-only environment file, and never printed. The committed launchd
template contains the runtime root but contains no application secret.

Three user LaunchAgents are installed at:

```text
~/Library/LaunchAgents/com.nodezuno.web.plist
~/Library/LaunchAgents/com.nodezuno.email-worker.plist
~/Library/LaunchAgents/com.nodezuno.payment-worker.plist
```

launchd restarts the web process after a crash. The service runner uses an
absolute Node.js path and refuses a missing environment, unsafe permissions,
or a release link outside the private releases directory. The email and
payment agents each run one bounded worker pass every 60 seconds under separate
kernel locks that prevent overlapping passes. Each worker replaces its shell
with the Node.js process while retaining the lock descriptor. macOS releases
the lock when its last process exits, including after a forced stop or reboot.
The empty lock files stay on disk; their presence does not block a later pass.
When any required email value is absent, its runner exits successfully and
leaves queued work untouched.
When stablecoin mode is disabled, the payment runner exits successfully. When
enabled, it requires valid dedicated Ethereum endpoints and leaves unresolved
claims fail closed.

## Prerequisites

- macOS on Apple Silicon or Intel
- `curl`, `openssl`, `shasum`, `tar`, `plutil`, `launchctl`, and macOS
  `/usr/bin/lockf`
- a real administrator mailbox controlled by the operator
- Node.js 22.18 or newer with `node:sqlite`
- pnpm 11.9.0, matching `package.json`

The normal macOS `PATH` must not silently fall back to a Codex-bundled runtime.
Use a system-managed Node installation, provide an absolute
`NODEZUNO_NODE_BIN`, or install the repository's private pinned toolchain.

### Private pinned toolchain

This explicit command downloads the official Node.js 24.14.0 macOS archive,
verifies a hard-coded SHA-256 digest published for that exact artifact, and
installs pnpm 11.9.0 under the private runtime root. It does not use `sudo` and
does not change the system Node.js installation.

```bash
bash deploy/local-mac/bootstrap-toolchain.sh
```

The bootstrap is idempotent. It reuses already verified installed versions.
Run it explicitly again when the repository pins a newer runtime. Do not edit
the version or digest without reviewing the official Node.js release checksum.

## First installation

From the repository root, provide a mailbox you actually control:

```bash
bash deploy/local-mac/install.sh \
  --admin-email 'info@nodezuno.com'
```

Replace the example organizational address with the real mailbox before
running the command. A comma-separated minimal allowlist is supported.

If Node.js and pnpm are managed elsewhere, pass immutable absolute paths:

```bash
bash deploy/local-mac/install.sh \
  --admin-email 'info@nodezuno.com' \
  --node '/absolute/path/to/node' \
  --pnpm '/absolute/path/to/pnpm'
```

The installer performs these gates in order:

1. Validate the runtime, package manager, port, and administrator mailbox.
2. Create persistent directories and four independent application secrets.
3. Preserve an existing environment unchanged on repeated runs.
4. Render and validate the secret-free web, email-worker, and payment-worker
   LaunchAgents.
5. Install the frozen dependency graph and create a standalone Next.js build
   in a sanitized build environment with no runtime secrets.
6. Validate control-plane configuration.
7. Verify the dedicated Ethereum payment endpoints when stablecoin settlement
   is enabled, then verify the customer Ethereum attachment when its separate
   RPC configuration is present.
8. Create and verify a pre-deployment SQLite backup when a database exists.
9. Stop the old service, apply migrations, and switch the active release.
10. Start all three launchd services and require web liveness, readiness, and backend
    health within 30 seconds.

If the new app release fails health checks, the script selects the previous app
release and starts it. Database migrations are not automatically reversed. The
verified pre-deployment backup is the recovery boundary for a reviewed manual
database restore.

Use `--prepare-only` to create configuration and the LaunchAgent without a
build. Use `--no-start` to build and migrate while leaving the service stopped.
The loopback port defaults to `3000` and can be set only during the first
install with `--port`.

The normal deploy command refreshes the installed worker runners after it has
stopped the supervised jobs. An installer run that would replace changed worker
runners requires those jobs to be stopped first; unchanged runner files can be
reused while the jobs are loaded.
Runner files are installed using macOS `install -S`, which replaces a file
atomically and flushes it to disk. If runner installation fails after the
services stop, deployment restarts the still-selected previous release when
it was previously loaded and reports any failure to restore its health.

## Routine commands

```bash
# Build, back up, migrate, switch release, restart, and verify
bash deploy/local-mac/deploy.sh

# Process and application health
bash deploy/local-mac/status.sh
bash deploy/local-mac/health.sh

# Lifecycle
bash deploy/local-mac/stop.sh
bash deploy/local-mac/start.sh

# Logs
bash deploy/local-mac/logs.sh --lines 200
bash deploy/local-mac/logs.sh --follow

# Run one bounded pass through the installed owner-only runner
"$HOME/Library/Application Support/Nodezuno/bin/run-email-worker"
"$HOME/Library/Application Support/Nodezuno/bin/run-payment-worker"

# Online SQLite backup followed by manifest verification
bash deploy/local-mac/backup.sh
```

The site is available only on the local machine at
`http://localhost:3000` unless a different first-install port was selected.
`HOSTNAME=127.0.0.1` prevents direct LAN exposure.

The private proposal portal uses the same direct Ethereum payment path as
production. The safe local default keeps payment issuance closed until the
dedicated Ethereum verification endpoints pass preflight. The portal never
falls back to a synthetic payment or marks a proposal paid without verified
mainnet evidence.

## Worker and deployment lock recovery

The native profile uses macOS `lockf` against descriptor `9` in the calling
shell. The same descriptor stays open in the worker's Node.js process and in
deployment subprocesses. Lock acquisition has no wait: contention exits with
a failure code and records a small redacted diagnostic. The existing database
leases, payment idempotency, and email delivery guards remain independent.
Acquire the deployment lock once in the current shell. Command substitution
and other subshell acquisition are rejected because they would lose the
owning descriptor when that subshell exits.
Do not delete, truncate through replacement, or rename a `*.kernel.lock` file
while services may run. A new inode would allow two operations to take
different locks for the same job.

Releases before this change used ownerless directories named `deploy.lock`,
`email-worker.lock`, and `payment-worker.lock`. The new runners refuse to
ignore or delete these legacy paths because a directory alone cannot prove
whether an old process remains active.

For a one-time legacy recovery:

1. Stop the supervised services with `bash deploy/local-mac/stop.sh`.
2. Confirm no manual worker or deployment process remains. Inspect the process
   list for `process-notification-outbox.mjs`,
   `process-stablecoin-payments.mjs`, and `deploy/local-mac/deploy.sh`.
3. Only after confirming those operations have exited, remove the empty legacy
   directory with `rmdir` against the exact inspected path. Never remove a
   `*.kernel.lock` file. A nonempty or unexpected path requires investigation.
4. Run `bash deploy/local-mac/deploy.sh` to install the updated runners and
   select a release, or `install.sh --prepare-only` followed by `start.sh`
   when the existing application release should be retained.
5. Confirm scheduled worker events, the payment verifier heartbeat, and web
   readiness. A healthy web process alone does not prove worker activity.

There is no recurring manual lock cleanup with the new kernel locks. A later
blocked lock means a process still holds its descriptor or the private lock
path failed validation; inspect that condition instead of deleting files.

## Ethereum light-client attachment boundary

The installer leaves `NODEZUNO_RPC_UPSTREAMS_JSON` empty. This is deliberate:
the web service must not claim Ethereum RPC until a separately supervised
client is healthy and the gateway has verified chain identity.

The Ethereum client must bind only to loopback. After the client workstream
has installed its reviewed environment entry, every deployment runs:

```bash
node scripts/preflight-node-attachments.mjs ethereum
```

The command verifies only the attached Ethereum network for this local
profile. It does not turn missing Base or Solana nodes into false deployment
failures. A nonempty RPC configuration that does not pass the Ethereum
preflight blocks release before the existing web service is stopped.

Treat every upstream URL and header in
`~/Library/Application Support/Nodezuno/config/nodezuno.env` as a secret.
Keep the file at mode `0600`, do not commit it, and restart the web service
after an approved change. A light client is not a full archive node and must
be represented as a verified local light-client profile in product claims.

## Configuration changes

The generated environment is shell-escaped owner-only data. Before changing
it, create a backup and stop the service. Keep these invariants:

- `PUBLIC_ORIGIN` and `BETTER_AUTH_URL` are exactly equal.
- `NODEZUNO_INGRESS_MODE=direct` has an empty
  `NODEZUNO_ORIGIN_SECRET` in this loopback profile.
- `NODEZUNO_LOCAL_PREVIEW=true` is used only with an HTTP `localhost` origin.
- Only the Ethereum Mainnet stablecoin payment path is present.
  The buyer portal never selects a synthetic fallback.
- `NODEZUNO_STABLECOIN_PAYMENT_MODE=disabled` is the safe local default. To
  run the production settlement path, set it to `ethereum_mainnet`, configure
  two or three independently operated endpoints in
  `NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON`, and keep
  `NODEZUNO_PAYMENT_CONFIRMATIONS` between 6 and 64. Deployment runs the full
  payment preflight before stopping the old service. The local preview
  exception is for controlled operator rehearsal only and is not approval to
  accept customer funds.
- `NODEZUNO_DATABASE_DRIVER=sqlite` points to the private persistent path.
- `NODEZUNO_ALLOW_ETHEREUM_HTTP_LOOPBACK` stays `false` until a reviewed,
  loopback-only Ethereum client has passed its own readiness probe.
- `RATE_LIMIT_SECRET`, `API_KEY_PEPPER`, `BETTER_AUTH_SECRET`, and `REVIEW_CAPABILITY_SECRET` are distinct.
- Node.js and pnpm paths are absolute and stable.
- Google variables are configured as a complete pair or left empty.
- External notification delivery uses `ZOHO_SMTP_HOST` and
  `ZOHO_SMTP_PASSWORD`. Mail is sent from and operator notices go to
  `info@nodezuno.com`. The worker supports this SQLite profile only.

After editing, run:

```bash
chmod 600 "$HOME/Library/Application Support/Nodezuno/config/nodezuno.env"
bash deploy/local-mac/deploy.sh
```

The deploy command runs preflight checks before stopping the active service.
Zoho SMTP acceptance from a Mac proves only that Zoho accepted the request.
The app has no delivery callback, so confirm receipt directly in the Zoho
mailbox before launch.

## Backup and restore rehearsal

Create a verified online backup while the app is running:

```bash
bash deploy/local-mac/backup.sh
```

To rehearse a restore, copy a backup and its manifest to an isolated runtime
root and use the repository's `restore-sqlite.mjs` contract there. For a real
recovery, stop the service, preserve the damaged database and all SQLite
sidecars for incident evidence, verify the chosen backup, restore into an
empty target path, and start the service. Never overwrite a live database in
place. Record the backup manifest hash and health results in the incident log.

Local backups on the same disk do not protect against disk loss. Copy verified
backup and manifest pairs to a separately controlled encrypted destination.

## AWS mapping

| This Mac profile | One-host AWS equivalent | Production responsibility |
| --- | --- | --- |
| Mac login user | Dedicated unprivileged EC2 service user | Deny interactive access except audited operations |
| web LaunchAgent plus one-minute email and payment worker LaunchAgents | web systemd service plus one-minute email and payment timers | Restart policy, boot start, exclusive one-shot workers, deployment health gate |
| `127.0.0.1:3000` | Private application listener | Never expose the raw Next.js port publicly |
| Local browser | Existing Caddy edge on the same EC2 host | HTTPS certificate, canonical host, forwarded header policy |
| `Application Support/Nodezuno/data` | Encrypted EBS volume mounted at `/var/lib/nodezuno` | Capacity alarms, snapshots, tested restore |
| Owner-only environment file | AWS Secrets Manager or SSM Parameter Store | KMS policy, rotation, access audit |
| `logs/` | CloudWatch Logs | Retention, redaction, alerts, incident queries |
| `health.sh` | Caddy readiness checks and external monitor | Probe `/api/v1/live`, `/ready`, and `/health` |
| Versioned `releases/` | Immutable CI artifact or image | Signed build provenance and rollback catalog |
| Loopback blockchain client | Separate private service or instance | Disk, bandwidth, chain sync, authenticated private routing |
| Verified SQLite backup | Encrypted S3 backup plus EBS snapshot | Object lock, lifecycle policy, restore rehearsal |
| macOS firewall | Security groups, NACLs, and host firewall | Minimum ingress and controlled RPC egress |

The first low-cost AWS deployment may use the same SQLite single-instance
shape on encrypted EBS, but it must keep exactly one writer. Move the database
to a managed multi-instance design before autoscaling the web tier. The
existing AWS bundle uses Caddy on the same host, avoiding a separate paid load
balancer for the initial deployment. Configure HTTPS, the Zoho SMTP app password,
Secrets Manager,
CloudWatch, alarms, off-host backups, and named incident owners before public
self-service traffic.

## Operational limits

- launchd user agents start after that user logs in. A public server must use a
  boot-level service manager such as systemd or ECS instead.
- This profile has brief deployment downtime while migrations and the release
  switch occur.
- SQLite provides durable single-host state, not multi-host consensus.
- The scripts do not open firewall ports or modify `/etc/hosts`.
- The scripts do not install or start an Ethereum client.
- The scripts do not create a public DNS name, TLS certificate, alert target,
  off-host backup destination, or cloud account resources.

These boundaries are explicit so a successful local rehearsal is useful
evidence without being misrepresented as a complete public production launch.
