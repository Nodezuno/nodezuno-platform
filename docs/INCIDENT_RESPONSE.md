# Nodezuno incident response

## Before launch

Assign named people for these roles in a private operations record:

| Role | Responsibility |
| --- | --- |
| Incident commander | Severity, decisions, timeline, and closure |
| Operations owner | AWS, deployment, logs, alarms, and recovery |
| Data steward | Backup and deliverable-version selection, restore approval, privacy impact |
| Security reviewer | Containment, credentials, evidence, and disclosure |
| Communications owner | Customer, partner, legal, and public updates |

For a one-person company, Sanjay may hold several roles, but each decision
still needs to be recorded. Add an independent security contact before storing
material customer-confidential data.

## Severity

| Level | Definition | Initial response target |
| --- | --- | --- |
| SEV-1 | Active compromise, secret exposure, material data loss, unsafe authorization, or complete outage affecting a committed customer | 15 minutes |
| SEV-2 | Degraded production, failed backup, repeated login failure, or high-risk control failure without known compromise | 30 minutes |
| SEV-3 | Bounded defect with a workaround and no material security or data impact | One business day |
| SEV-4 | Cosmetic, documentation, or low-risk operational issue | Planned work |

These are internal targets, not customer SLAs.

## First 30 minutes

1. Open an incident record with UTC start time and reporter.
2. Assign severity and incident commander.
3. Preserve the relevant Cloudflare Worker, D1, R2, GitHub Actions, and
   application evidence. Do not paste secrets into the incident record.
4. Decide whether to contain by blocking a release, revoking an identity,
   rotating a secret, stopping a service, or restricting DNS.
5. Check `/api/v1/live`, `/api/v1/ready`, `/api/v1/status`, Worker errors and
   CPU, D1 health and migration head, R2 access, notification backlog, payment
   mode, and the deployed version.
6. Start an internal timeline. Record facts separately from hypotheses.
7. Set the next update time even when there is no customer-facing notice.

## Containment order

Use the smallest reversible action that removes active risk:

1. revoke a compromised customer account session or review-order capability;
2. disable an affected authentication provider;
3. roll back to the last healthy immutable image;
4. rotate one exposed secret and redeploy;
5. disable new payment instructions and stop the payment worker when Ethereum
   evidence, reconciliation, or receipt integrity is in question;
6. restrict public DNS or security-group ingress;
7. stop the application while preserving the database;
8. stop deliverable uploads and downloads by removing runtime access without
   deleting the bucket, object versions, or KMS key;
9. isolate or replace the host;
10. restore data only for confirmed corruption or destructive change.

Do not delete containers, logs, database files, or cloud resources during
initial containment. Preserve them for investigation.

## Secret rotation order

When exposure scope is uncertain, rotate in this order:

1. Google OAuth client secret and Zoho SMTP app password;
2. `BETTER_AUTH_SECRET`, followed by revocation of existing sessions;
3. `RATE_LIMIT_SECRET`;
4. any optional payment-verifier endpoint credential, if used by a non-
   Cloudflare deployment;
5. GitHub repository and Cloudflare account access if the source-control or
   deployment boundary is involved.

Generate every replacement independently. Update the relevant provider secret
store and deploy an immutable release. Never place a secret value in a ticket,
chat, commit, command output, workflow output, or application log.

## Evidence sources

- Cloudflare Worker deployment, D1, R2, and account events available for the
  configured plan;
- GitHub workflow run, approval, commit, and artifact evidence;
- Better Auth and administrator audit records;
- stablecoin instructions, claims, verifier heartbeat, immutable
  reconciliation cases and confirmations, order events, lifecycle-notification
  outbox state, and buyer receipt record hashes;
- D1 recovery/export evidence and verification details;
- sealed deliverable metadata, exact R2 object version, checksum, and
  application prepare/verify/release audit events;
- DNS record history where available.

Access to evidence must use temporary human credentials. Export only the
minimum required data and preserve a hash for each exported artifact.

## Recovery and communications

Follow [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md) for image, host, volume, or
database recovery. Confirm the safety condition before restoring traffic.

Customer communications must state known impact, affected period, current
status, customer action, and next update time. Do not speculate, understate, or
claim that no data was accessed without evidence. Security and privacy events
may create legal notification duties; obtain qualified counsel for the
customer jurisdictions involved.

## Closure

Close an incident only when:

- service and security checks pass;
- backups are current;
- customer impact is bounded;
- exposed credentials are rotated;
- monitoring covers the failure mode;
- every temporary control has an owner and expiry;
- the timeline and evidence list are complete;
- a blameless review is scheduled for SEV-1 and SEV-2.

The review must identify technical cause, control cause, detection gap,
customer impact, actual recovery time, action owners, and due dates. Test the
fix. A written action item without verification is not closure.
