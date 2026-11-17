# Deploy Nodezuno professionally on AWS

This is the production deployment guide for the current stage of Nodezuno.
It uses the smallest practical architecture while keeping the controls that
matter from the first customer: reproducible infrastructure, short-lived
credentials, immutable releases, private secrets, encrypted storage, verified
backups, monitoring, audit history, and an explicit recovery process.

The active production profile is one ARM EC2 instance. It does not claim high
availability. PostgreSQL and multiple application replicas must exist before a
load balancer or Kubernetes can improve availability.

Create a private release record from
[PRODUCTION_RELEASE_EVIDENCE.md](PRODUCTION_RELEASE_EVIDENCE.md) before the
first infrastructure change. Keep each gate `BLOCKED` until current evidence
is attached; source code and local health cannot prove an external AWS fact.

## Architecture selected for launch

```text
Internet
  -> Route 53 or existing DNS
  -> Elastic IP
  -> security group with ports 80 and 443 only
  -> Caddy container for TLS
  -> Nodezuno container
  -> encrypted gp3 data volume for SQLite and Caddy state

systemd timer -> one-shot email-worker container -> Zoho SMTP
systemd timer -> one-shot payment-worker container -> dedicated Ethereum RPC endpoints

administrator browser -> ten-minute presigned POST -> private versioned S3 deliverables
authorized buyer -> five-minute version-pinned signed GET -> private S3 deliverables

GitHub Actions -> OIDC role -> ECR -> restricted SSM deployment document
EC2 -> write-only S3 backup prefix
EC2 -> CloudWatch logs and operational metrics
AWS account -> customer-managed deliverables KMS key
AWS account -> CloudTrail management and deliverable-object data events
AWS account -> Access Analyzer, budget alerts, SNS alarms
```

The Terraform stack creates two public subnets so a future load balancer has a
valid two-Availability-Zone network shape. Only the first subnet is used now.
Empty subnets do not add hourly cost. There is no NAT Gateway, ALB, RDS, ECS,
or EKS resource in the launch stack.

## 1. Prepare the AWS account

Use a dedicated production account under AWS Organizations if possible. Before
creating application resources:

1. Enable MFA for the root user and remove every root access key.
2. Enable IAM Identity Center for human access.
3. Create an administrator permission set for initial infrastructure work.
4. Use that temporary SSO session, not the root user and not a long-lived IAM
   access key.
5. Select one region. The examples use Mumbai, `ap-south-1`.

AWS documents these controls in its
[root-user guidance](https://docs.aws.amazon.com/IAM/latest/UserGuide/root-user-best-practices.html)
and [IAM best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html).

Configure the AWS CLI on the Mac:

```bash
aws configure sso --profile nodezuno-prod
aws sso login --profile nodezuno-prod
export AWS_PROFILE=nodezuno-prod
export AWS_REGION=ap-south-1
aws sts get-caller-identity
```

Confirm that the returned account ID is the intended production account.

The AWS operator boundary uses MFA and temporary credentials from day one.
The Nodezuno application currently supports verified email, Google, EVM, and
Solana sign-in, but it does not yet enforce a second factor for the allowlisted
administrator account. For the initial public launch, keep the administrator
allowlist to one account protected by provider MFA. The public intake form must
not accept customer source or sensitive evidence. Final reports, evidence
archives, and manifests use the restricted S3 deliverables workflow described
below. Treat application-level passkey or TOTP enforcement as a release
requirement before adding team administrators or expanding confidential input
handling.

Install Terraform 1.15.x and keep the committed provider lock files. Do not
run infrastructure commands with unreviewed provider upgrades.

## 2. Create the remote Terraform state bucket

Terraform cannot place its first state in a bucket that does not exist yet.
Create the bucket once with local state, then migrate that small bootstrap
state into the new bucket.

```bash
cd deploy/aws/terraform/state-bootstrap
terraform init -backend=false
terraform plan -out=state-bootstrap.tfplan
terraform apply state-bootstrap.tfplan
terraform output
```

Copy `backend.tf.example` to the ignored file `backend.tf`. Copy
`backend.hcl.example` to the ignored file `backend.hcl`, replace the account ID
in the bucket name with the output, then migrate:

```bash
cp backend.tf.example backend.tf
cp backend.hcl.example backend.hcl
terraform init -migrate-state -backend-config=backend.hcl
terraform state list
```

The state bucket has versioning, default encryption, public-access blocking,
TLS enforcement, and deletion protection. The EC2 role cannot read it.

## 3. Configure and review the production stack

```bash
cd ../bootstrap
cp terraform.tfvars.example terraform.tfvars
cp backend.hcl.example backend.hcl
```

Edit both ignored files. At minimum, set:

```hcl
domain_name      = "nodezuno.com"
operator_email   = "your-real-operations-email@example.org"
aws_region       = "ap-south-1"
instance_type    = "t4g.micro"
monthly_budget_usd = 30
github_repository = "YOUR_GITHUB_OWNER/YOUR_REPOSITORY"
```

Set `route53_zone_id` when the domain already has a public Route 53 hosted
zone. Leave it empty when DNS is hosted elsewhere. The Terraform output will
show the Elastic IP to enter at that provider.

An AWS account can have only one GitHub Actions OIDC provider for the same
issuer. If the account already has one, set
`create_github_oidc_provider=false` and provide its ARN through
`github_oidc_provider_arn` instead of trying to create a duplicate.
If regional Session Manager preferences are already managed centrally, set
`configure_session_manager_preferences=false` and retain the stricter central
policy.

The default `t4g.micro` is the lowest-cost launch choice with 1 GiB memory and
a 1 GiB emergency swap file. The application image is built in GitHub, never
on this server. Use `t4g.small` before launch if production-like measurement
shows sustained memory above 75 percent, any OOM termination, or ordinary swap
use. Saving roughly four dollars per month is not worth instability.

Initialize and inspect the exact changes:

```bash
terraform init -backend-config=backend.hcl
terraform fmt -check -recursive
terraform validate
terraform plan -out=production.tfplan
terraform show production.tfplan
terraform apply production.tfplan
terraform output
```

The stack creates:

- a VPC, two public subnets, an internet gateway, routes, and a security group;
- one protected ARM EC2 instance with no key pair and no inbound SSH;
- one Elastic IP;
- a protected encrypted gp3 data volume and daily snapshots;
- an immutable private ECR repository;
- a private versioned S3 backup bucket with Object Lock;
- a separate private versioned S3 deliverables bucket and rotating
  customer-managed KMS key;
- CloudWatch log groups, a dashboard, deployment, readiness, and capacity
  alarms;
- an SNS operations topic and an account-level monthly budget;
- a multi-region CloudTrail trail and audit bucket for management events plus
  read and write data events under the deliverables `reviews/` prefix;
- IAM Access Analyzer;
- a least-privilege EC2 role;
- exact GitHub OIDC build and deployment roles;
- a restricted SSM deployment document.

Confirm the SNS subscription from the operator mailbox. Alarm email does not
work until that confirmation is complete. Readiness and backup-age alarms are
expected to remain active until the first application release and its
post-deployment backup succeed.

## 4. Point DNS to the Elastic IP

If `route53_zone_id` was set, Terraform creates the apex and `www` A records.
For another DNS provider, create these records manually:

```text
nodezuno.com      A     <terraform elastic_ip output>
www.nodezuno.com  A     <terraform elastic_ip output>
```

Use a 300-second TTL for the initial cutover. Caddy obtains and renews the TLS
certificates after DNS resolves and the first release starts. Port 3000 is
never public.

## 5. Create the application environment SecureString

Terraform deliberately does not receive application secret values because
Terraform state would retain them. On the Mac, create a private file from the
example:

```bash
cp .env.production.example "$HOME/.nodezuno-production.env"
chmod 600 "$HOME/.nodezuno-production.env"
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
```

Use four different generated values for `RATE_LIMIT_SECRET`,
`API_KEY_PEPPER`, `BETTER_AUTH_SECRET`, and `REVIEW_CAPABILITY_SECRET`. Back up
the review capability secret and do not rotate it casually because outstanding
private review links depend on it. Configure the Zoho SMTP app password and
the exact SMTP host shown in Zoho Mail settings. Nodezuno sends from and routes
operational notices to `info@nodezuno.com`. Set that address as the verified
administrator account. Keep
`NODEZUNO_LEGAL_LAUNCH_APPROVED=false`,
`NODEZUNO_PUBLIC_INDEXING=false`, and
`NODEZUNO_STABLECOIN_PAYMENT_MODE=disabled` through the launch tests.

Upload the file as one encrypted Standard SecureString without exposing it to
Terraform:

```bash
bash deploy/aws/scripts/upload-production-environment.sh \
  "$HOME/.nodezuno-production.env" \
  /nodezuno/prod/environment
```

The instance can read only this exact parameter. Caddy does not receive the
application environment file. It receives only the public domain and ACME
email from the host configuration.

At deployment time, the host validates the decrypted source once and writes
owner-only role environments. The web container receives the full application
configuration, the notification worker receives only Zoho SMTP, public-origin,
and review-link values, and the payment worker
receives only Ethereum verification and payment-mode values. Rollback restores
all three files together. Caddy receives none of them.

Google login is optional. If enabled, configure both Google values and add
this exact callback to the Google OAuth client:

```text
https://nodezuno.com/api/auth/callback/google
```

Email authentication is not optional for the public production profile. Test
signup verification, password reset, session revocation, Google login when
configured, EVM wallet login, and Solana wallet login before indexing.

### Configure transactional notification delivery

The SQLite notification pipeline requires this Zoho configuration:

```text
ZOHO_SMTP_HOST=smtp.zoho.in
ZOHO_SMTP_PASSWORD=<Zoho app password>
```

Use a Zoho app-specific password when multi-factor authentication is enabled.
Store it in the encrypted production environment and do not add it to Git.
The worker deliberately supports only the single-host SQLite deployment. A
successful SMTP response is stored as `accepted`. There is no provider
callback, and SMTP acceptance is not proof of inbox delivery. Confirm actual
receipt in `info@nodezuno.com` during the controlled deployment rehearsal.

### Configure Upgrade Assurance payments

The committed production example keeps settlement disabled. After the blocking
legal and commerce gate is signed off, direct Ethereum mainnet settlement can
collect each USD 3,750 phase of an approved USD 7,500 proposal. No hosted card
processor is active. Configure two or three dedicated, independently operated
Ethereum RPC endpoints in the private environment file:

```text
NODEZUNO_LEGAL_LAUNCH_APPROVED=true
NODEZUNO_STABLECOIN_PAYMENT_MODE=ethereum_mainnet
NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON=[{"name":"payment-mainnet-primary","provider":"primary-provider","url":"https://<primary-ethereum-rpc>","headers":{},"timeoutMs":8000},{"name":"payment-mainnet-secondary","provider":"secondary-provider","url":"https://<secondary-ethereum-rpc>","headers":{},"timeoutMs":8000}]
NODEZUNO_PAYMENT_CONFIRMATIONS=12
```

Keep payment endpoints separate from customer RPC endpoints. Public URLs must
use HTTPS. URL credentials, query strings, fragments, redirects, cookie and
hop-by-hop headers are rejected. A private HTTP endpoint is accepted only on
loopback, RFC 1918, or `.internal` addressing. Store credential headers only in
the SSM SecureString and never print the JSON.

The recipient is fixed in source and migration constraints:

```text
0x07218C8E2B01fbff950Af65A0f36D3305520aC3b
```

Do not put its private key or recovery phrase on EC2, in SSM, Docker, SQLite,
GitHub, logs, or backups. The application observes incoming transfers only and
cannot sign an outgoing transfer or refund.

After uploading the environment but before allowing a buyer to pay, run the
payment preflight through the reviewed deployment operations path. It must
prove chain ID 1, fresh latest and finalized blocks, canonical USDC and USDT
code, six decimals, and unknown-receipt behavior on every configured endpoint.
Save only endpoint names, chain ID, block numbers, and healthy state.

Ethereum Mainnet stablecoin verification is the only payment implementation.

Follow [UPGRADE_ASSURANCE_COMMERCE.md](UPGRADE_ASSURANCE_COMMERCE.md) and
[OPERATIONS.md](OPERATIONS.md) for the full payment and reconciliation gates.

The payment worker refreshes a persisted verifier heartbeat during every pass.
All configured providers must report Ethereum chain ID 1, fresh latest and
finalized blocks, and a chain-head spread no greater than the enforced bound.
The heartbeat is tied to the exact provider and endpoint configuration. The
buyer portal creates no new payment instruction when the heartbeat is
unhealthy, older than 150 seconds, or belongs to a previous configuration.
An already issued instruction can still accept the buyer's transaction hash so
evidence is not lost during an RPC outage, but the order remains unpaid until
the worker verifies it.

Seller-received anomalies open immutable reconciliation cases. Production
operators must use only the same-origin administrator endpoint with a fresh
allowlisted session, `Idempotency-Key`, exact `apply_to_obligation` action, and
a 12 to 4,000 character decision note. It applies only finalized official
Ethereum USDC or USDT evidence received by the seller, agreed by at least two
providers, and matching the guarded exact-amount rule. Arbitrary amounts and
ambiguous receipts remain blocked. The transaction atomically resolves the
case, advances the order, writes the immutable confirmation and audits, and
queues the buyer lifecycle email. The buyer confirmation download is private
no-store JSON and is not a tax invoice or custody receipt. Follow the exact
procedure in [OPERATIONS.md](OPERATIONS.md); never use a database edit as a
payment operation.

### Configure secure deliverable storage

Terraform provisions the private deliverables bucket and its KMS key. Their
identifiers are written into the versioned host bundle and injected into the
web container as `NODEZUNO_DELIVERABLE_BUCKET`,
`NODEZUNO_DELIVERABLE_KMS_KEY_ARN`, and `AWS_REGION`. Do not duplicate these
values in the application SecureString or grant the application access to
another bucket or key.

The bucket blocks all public access, enforces TLS and the exact KMS key, enables
versioning, expires abandoned temporary uploads after one day, and retains
noncurrent versions for 730 days. With S3 versioning, temporary expiration
creates a delete marker while the underlying noncurrent version follows that
730-day lifecycle. The application role has no object-delete permission.
CloudTrail records read and write object data events under
`reviews/` in the private audit bucket.

The administrator workflow supports `final_report`, `evidence_archive`, and
`manifest` files in PDF, ZIP, JSON, or plain text, up to 100 MiB each. The
browser computes SHA-256 before requesting a ten-minute presigned POST. The
server verifies the exact sealed checksum, size, content type, KMS key,
metadata, ETag, and S3 version ID before marking a file available. Completing
an order is blocked until a verified final report and manifest exist. Completion
releases available deliverables, and an authorized buyer receives only a
five-minute signed download pinned to the verified S3 version.

## 6. Configure GitHub deployment

Push the reviewed repository to the `github_repository` configured in
Terraform. In GitHub, create an environment named `production` and require a
reviewer for deployment. Set its deployment branch policy to protected
branches and allow `main` only. The environment-bound AWS role cannot encode a
branch in its subject, so this GitHub protection is a required part of the
OIDC trust boundary.

Create these repository or environment variables from Terraform outputs:

| GitHub variable | Value |
| --- | --- |
| `AWS_REGION` | `ap-south-1` |
| `AWS_BUILD_ROLE_ARN` | `github_build_role_arn` output |
| `AWS_DEPLOY_ROLE_ARN` | `github_deploy_role_arn` output |
| `AWS_ECR_REPOSITORY` | `nodezuno/web` |
| `AWS_EC2_INSTANCE_ID` | `instance_id` output |
| `AWS_SSM_DEPLOY_DOCUMENT` | `deployment_document_name` output |
| `PUBLIC_ORIGIN` | `https://nodezuno.com` |

Do not add AWS access keys to GitHub secrets. The workflow exchanges GitHub's
short-lived OIDC identity for two narrowly scoped AWS roles. AWS requires the
role trust policy to restrict the GitHub `sub` claim, which this Terraform
stack does.

When a reviewed file under `deploy/aws` changes, run `terraform plan` and
`terraform apply` before the next application release. Terraform updates the
restricted SSM deployment document. That document atomically stages the exact
Compose, Caddy, deployment, backup, and metrics payloads from the reviewed
revision before it invokes the release. This keeps an existing host aligned
without building source code on it or replacing its protected data volume.

Run the `Publish and deploy Nodezuno on AWS` workflow from the `main` branch.
It performs the following sequence:

1. Audit production dependencies, lint, type-check, and test.
2. Build a `linux/arm64` image in GitHub-hosted BuildKit.
3. Produce provenance and an SBOM.
4. Push a unique immutable tag to ECR.
5. Wait for the ECR scan and reject high or critical findings.
6. Resolve the image digest.
7. Wait for production-environment approval.
8. Invoke only the restricted SSM deployment document.
9. Stage and validate one content-addressed host bundle.
10. Switch the host bundle atomically while holding the deployment lock.
11. Reapply the container metadata firewall and prove that only the dedicated
    web egress subnet can reach IMDS.
12. Fetch the encrypted environment on the instance and require both migration
    override settings to remain exactly `false`.
13. Pull the exact digest.
14. Acquire the shared background-operation lock so scheduled SQLite workers
    and backups cannot overlap the migration or rollback boundary, then create
    a verified pre-deployment backup when an earlier database exists.
15. Run the database migration and control-plane preflight as one-shot tasks,
    then run the live payment preflight.
16. Run one payment-worker pass to create a healthy persisted verifier
    heartbeat before the web process is admitted.
17. Start the web release and verify local and edge readiness.
18. Create a verified post-deployment backup, then release the shared
    background-operation lock.
19. Install both worker unit pairs while their timers remain stopped, prove one
    email pass and one payment pass, then enable and prove both one-minute
    timers.
20. Record the current and previous image only after every ownership proof, then
    publish deployment success and run the workflow's public probes and link
    crawl.

If readiness, the post-deployment backup, service ownership, either worker, or
either timer fails and a previous release exists, the host restores the prior
host bundle, role-specific environment files, image digest, image markers,
worker unit files, and timer states automatically. A first-release failure
removes candidate containers and keeps worker timers stopped. Rollback does not
reverse database migrations, so every ordinary migration must remain
backward-compatible.

Migration `0024` is a contract migration and is supported automatically only
on a fresh database before the first application is live. An existing
pre-`0024` installation must follow [MIGRATIONS.md](MIGRATIONS.md). The standard
deployment path refuses the contract override so it cannot automatically roll
back old code onto a contracted schema.

## 7. Verify the first release

### Blocking legal and commerce gate

Keep both `NODEZUNO_PUBLIC_INDEXING=false` and
`NODEZUNO_STABLECOIN_PAYMENT_MODE=disabled` until a qualified adviser has
approved the production documents and operating position for Sanjay Sudagani,
sole proprietor trading as Nodezuno. Record approval for all of the following:

- the seller's legal name, trading name, service address, and contact details;
- governing law, dispute process, service scope, exclusions, and professional
  liability position;
- privacy, retention, data-processing, confidentiality, and security terms;
- Indian tax and GST treatment, invoice or receipt format, accounting records,
  and stablecoin valuation policy;
- FEMA and other cross-border payment treatment;
- sanctions and restricted-party screening procedure;
- proposal expiry, cancellation, scheduling, and delivery terms; and
- the manual-refund policy, including authority, destination verification,
  records, and customer communication.

Store the approved document versions, effective dates, and content hashes in
the release record template. Replace every provisional legal page before
accepting a proposal or issuing a payment instruction. Source code and a
successful cloud deployment cannot satisfy this gate.

After the gate is complete, set
`NODEZUNO_LEGAL_LAUNCH_APPROVED=true` and
`NODEZUNO_STABLECOIN_PAYMENT_MODE=ethereum_mainnet`, upload the reviewed
SecureString, deploy again, and complete the payment evidence checks below.

```bash
curl --fail https://nodezuno.com/api/v1/live
curl --fail https://nodezuno.com/api/v1/ready
curl --fail https://nodezuno.com/api/v1/health
```

Then test from a clean browser profile:

1. desktop and mobile navigation;
2. account signup and mailbox verification;
3. password reset;
4. Google login if configured;
5. Ethereum wallet login;
6. Solana wallet login;
7. protected account, console, and administrator routes;
8. every public form and its confirmation state;
9. one approved controlled test notification from durable outbox intent,
   Zoho SMTP acceptance, and actual receipt in `info@nodezuno.com`;
10. one customer lifecycle email for an administrator transition and one for a
    verified payment, including the reconstructed private tracking link;
11. newsletter confirmation by explicit POST, plus unsubscribe suppression;
12. one separately approved end-to-end mainnet rehearsal using a test order's
    exact server instruction, mandatory Telegram input, pending claim, worker
    verification, and finalized order transition. The fixed transfer is not a
    low-value probe, so approval, treasury control, and manual recovery must be
    explicit;
13. wrong-network, wrong-token, wrong-recipient, wrong-amount, duplicate-hash,
    and RPC disagreement fixtures without sending additional real funds;
14. persisted payment-verifier health in `/api/v1/status`, stale-heartbeat
    fail-closed behavior, and all payment CloudWatch alarms;
15. administrator upload and verification of a final report, evidence archive,
    and manifest, followed by a successful completion gate;
16. authorized version-pinned download, unauthorized denial, expiry after five
    minutes, and matching CloudTrail S3 object data events;
17. privacy, terms, security, contact, pricing, documentation, and whitepaper;
18. 404 behavior and all public links.

The email check must inspect state, not just the worker exit code. `accepted`
means Zoho's SMTP server accepted the message. It is not proof that a mailbox
received it. Confirm receipt in the actual mailbox. The app does not receive
or store delivery, bounce, or complaint callbacks.

Configure an independent external HTTPS monitor for `/api/v1/health` and send
its alert to a channel that does not depend on this server. The built-in local
readiness alarm cannot detect every DNS, routing, certificate, or Caddy-edge
failure.

Only after the release passes should you change
`NODEZUNO_PUBLIC_INDEXING=true`, upload the SecureString again, and run another
approved release.

Before declaring that release publicly indexable, record all of the following
from the deployed origin:

1. the homepage returns a canonical URL of `https://nodezuno.com/` and does not
   emit a `noindex` robots directive;
2. `https://nodezuno.com/robots.txt` allows public content, names the production
   sitemap, and continues to disallow account, administrator, API, and private
   review routes;
3. `https://nodezuno.com/sitemap.xml` contains only canonical public URLs and
   excludes redirects plus private customer paths;
4. the control-plane preflight reports `publicIndexing.state` as `enabled` and
   `publicIndexing.effective` as `true`; and
5. the `Nodezuno public site release check` workflow passes against
   `https://nodezuno.com`, including same-origin pages, fragments, redirects,
   and external documentation references.

## 8. Operate without SSH

Start a shell through Session Manager:

```bash
aws ssm start-session \
  --target "$(terraform output -raw instance_id)" \
  --region ap-south-1
```

Useful host checks:

```bash
sudo systemctl status nodezuno.service
sudo systemctl status nodezuno-email-worker.timer
sudo systemctl status nodezuno-payment-worker.timer
sudo iptables --check DOCKER-USER --source 172.29.243.0/28 --destination 169.254.169.254/32 --jump ACCEPT
sudo iptables --check DOCKER-USER --destination 169.254.169.254/32 --jump DROP
sudo systemctl list-timers nodezuno-backup.timer nodezuno-metrics.timer nodezuno-email-worker.timer nodezuno-payment-worker.timer
sudo docker compose \
  --project-directory /opt/nodezuno \
  --env-file /opt/nodezuno/runtime.env \
  --file /opt/nodezuno/host-current/compose.yaml ps
sudo journalctl -u nodezuno-backup.service --since today
sudo journalctl -u nodezuno-email-worker.service --since today
sudo journalctl -u nodezuno-payment-worker.service --since today
```

Application and Caddy logs go to separate short-retention CloudWatch groups.
Caddy removes request headers and URIs from access logs and masks IP addresses.
Ordinary Session Manager shell activity streams to a 30-day CloudWatch group.
Port forwarding cannot be content-logged, so it is not an approved routine
administration path. Do not print `/opt/nodezuno/config/.env.production` or
the derived email-worker or payment-worker environment files. Do not print
Docker environment data.

The email worker is a one-shot Compose service in the `operations` profile. A
systemd timer invokes one bounded pass every minute under the shared
background-work lock. The process handles at most 25 eligible rows and exits,
so it adds no
second EC2 instance or always-running application replica. The systemd journal
records the invocation result; the application log group's `email-worker`
stream records the aggregate pass event. Monitor aggregate
`accepted`, `delivered`, `failed`, and `retryScheduled` counts without reading
recipient addresses or payloads from logs. Investigate terminal failures and
accepted rows with no later signed event. Never edit a sealed outbox payload
to force a retry.

The payment worker is another one-shot Compose service in the `operations`
profile. Its timer runs once per minute under the shared background-work lock,
selects at most 25 due claims, processes at most three concurrently within a
120-second pass budget, verifies them through every configured dedicated
Ethereum endpoint, and exits. Each pass also refreshes the persisted verifier
heartbeat. Monitor aggregate `selected`, `processed`, `verified`, `confirming`,
`rejected`, `manualReview`, `failed`, `deferred`, and `verifierHealthy` values.
CloudWatch alarms cover an unhealthy or stale heartbeat, the oldest pending
claim age, and any manual-review claim. Logs must not contain RPC URLs or
headers, Telegram usernames, transaction hashes, addresses, or raw receipts. A
stopped timer leaves claims unresolved and new instructions fail closed after
the heartbeat ages out, but neither fact justifies a manual paid-state edit.

### Operate customer deliverables

Use only the administrator order page to prepare and finalize deliverables.
Do not upload directly with an AWS console session because that bypasses the
sealed application manifest and completion gate. Verify these facts before
completion:

1. the final report and manifest are both `available`;
2. every listed SHA-256 value matches the approved local artifact;
3. the S3 object has a retained tag, exact KMS key, ETag, and version ID;
4. the administrator audit contains prepare and verify events; and
5. CloudTrail has the expected object write events without exposing file
   contents.

Completion changes available files to `released` and queues the buyer lifecycle
email. The private page lists released metadata and creates a five-minute
version-pinned signed download only after buyer authorization. Never paste the
signed URL into a ticket or chat. It is bearer access for its short lifetime.

Systems Manager installs approved operating-system patches every seven days
without forcing an unattended reboot. Once per month, review patch compliance,
create a verified backup, schedule a short maintenance window, reboot when AWS
marks one as required, and verify the three health endpoints afterward.

## 9. Backup and recovery policy

The systemd timer creates a verified SQLite online backup every six hours. A
separate one-shot container reads the live database as read-only, writes a
local verified artifact, and uploads it to the write-only S3 prefix with a
checksum. The long-running application cannot write the local backup folder.
S3 Object Lock prevents early deletion. Daily EBS snapshots provide a second
recovery layer.

The SQLite backup contains deliverable metadata but not file bytes. Customer
files remain in the separate versioned KMS-encrypted bucket. A restore drill
must verify that every sampled released metadata row still resolves to its
exact recorded S3 version and SHA-256 under the approved KMS path. Versioning
is durability, not a substitute for testing object and key recovery.

Initial targets, which must be confirmed by a restore drill, are:

- recovery point objective: up to six hours;
- recovery time objective: 30 to 60 minutes;
- availability: best effort, with no public SLA;
- restore drill: once per quarter and before a material data-model change.

Follow [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md) for a real restore. Never
restore an older database merely because an application image failed. Roll
back the image digest first.

## 10. When to spend more

Do not add a load balancer in front of one host. It leaves the host as the
single point of failure. Do not run two application replicas against SQLite.

Use this order:

1. Resize from `t4g.micro` to `t4g.small`, then `t4g.medium`, based on alarms.
2. Add PostgreSQL support and rehearse the SQLite-to-PostgreSQL migration.
3. Move to RDS PostgreSQL.
4. Run two ECS tasks in different Availability Zones.
5. Add an ALB and ACM for zero-downtime releases and failover.
6. Make RDS Multi-AZ when customer commitments justify it.
7. Add WAF or CloudFront for measured abuse, latency, or contractual controls.
8. Consider EKS only when multiple services and a platform owner justify it.

The exact promotion gates and current costs are in
[AWS_COST_MODEL.md](AWS_COST_MODEL.md). The broader operational design is in
[AWS_ARCHITECTURE.md](AWS_ARCHITECTURE.md).
