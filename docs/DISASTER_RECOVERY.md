# Nodezuno disaster recovery

## Scope and targets

This runbook covers the AWS single-host profile, its SQLite application data,
Caddy certificate state, immutable ECR release image, and private versioned S3
customer deliverables encrypted by the dedicated KMS key.

Initial objectives are:

- recovery point objective: up to six hours;
- recovery time objective: 30 to 60 minutes after an operator begins work;
- backup schedule: every six hours and before each deployment;
- EBS snapshot schedule: daily, retaining seven snapshots;
- restore rehearsal: quarterly and before a material data-model migration.

These are internal targets until a timed drill proves them. Nodezuno must not
publish an SLA for the launch profile.

## Recovery sources

Use recovery sources in this order:

1. last verified SQLite backup and manifest in the private S3 bucket;
2. last healthy ECR application digest;
3. protected data-volume snapshot for full-volume recovery;
4. Terraform remote state for AWS resource reconstruction;
5. source repository and GitHub release history for audit evidence.

Released deliverable file bytes are recovered from their exact S3 object
versions, not from the SQLite backup. The database stores the sealed checksum,
size, object key, ETag, and version ID needed to verify that relationship. The
dedicated KMS key, bucket policy, lifecycle, and CloudTrail object data events
are part of the recovery boundary.

S3 database backups use Object Lock. The runtime role can write new backups
but cannot read or delete them. A human operator with approved temporary AWS
access performs recovery.

## Failure classification

| Failure | First action | Database restore? |
| --- | --- | --- |
| New image fails readiness | Deploy the last healthy image digest | No |
| Migration-compatible application defect | Roll back the image digest | No |
| EC2 process or host failure | Restart or recover the instance, then verify | Usually no |
| Root volume failure | Replace the EC2 host and reattach the protected data volume | Usually no |
| Data volume failure | Create a replacement from the latest snapshot | Maybe |
| Confirmed SQLite corruption or destructive data change | Quarantine current files and restore a verified S3 backup | Yes |
| Terraform resource loss | Rebuild from reviewed state and plan | Only if data resources were lost |
| Secret exposure | Contain, rotate, redeploy, revoke sessions and keys as applicable | No |
| Deliverable current object deleted or overwritten | Stop release operations, preserve CloudTrail, recover the exact recorded version, and verify checksum before access | No database restore |
| Deliverables KMS key unavailable | Stop uploads and downloads, preserve key and CloudTrail evidence, restore approved KMS access without changing sealed metadata | No database restore |

Never restore data to solve an application-image problem.

## Application image rollback

Find the prior digest in GitHub release history, ECR, or
`/opt/nodezuno/releases/current-image`. Invoke the restricted SSM document with
that exact digest. The deploy script creates a backup, pulls the digest, runs
the configuration gate and forward-compatible migrations, and waits for
readiness.

Database migrations must remain backward-compatible with at least one previous
production image. If a migration breaks that rule, it needs its own rehearsed
cutover and recovery plan before approval.

## Restore a verified SQLite backup

Only the incident commander or data steward may approve this procedure.

1. Record incident ID, selected backup key, manifest key, creation time, and
   reason for restore.
2. Download both objects on an approved operator workstation with an IAM
   Identity Center session.
3. Verify S3 Object Lock retention, object sizes, and checksums.
4. Generate 15-minute presigned download URLs for the selected objects.
5. Start an SSM Session Manager shell. Do not use SSH.
6. Download both objects into `/opt/nodezuno/backups` and set mode `0600`.
7. Record whether the email and payment workers are active. Stop both worker
   timers, stop any running one-shot worker units, and then stop
   `nodezuno.service`. Do not restore while any database writer can run.
8. Move the current SQLite database and every `-wal`, `-shm`, or `-journal`
   sidecar into a timestamped quarantine directory. Do not delete them.
9. Run the isolated restore service against the downloaded backup.
10. Start `nodezuno.service` and verify readiness, authentication, record
    counts, recent customer records, and administrative audit history.
11. Keep both background workers stopped. Compare restored stablecoin
    intents, claims, reconciliation cases, immutable confirmations, order
    events, administrator audits, and buyer lifecycle outbox intents. Confirm
    every resolved applied case has exactly one matching confirmation and paid
    order phase. Reconcile notification rows in `pending`, `processing`,
    `accepted`, and `failed` states before email delivery resumes. Do not
    recreate a receipt, edit a sealed notification, or force state by editing
    SQLite.
12. Run payment preflight, start exactly one payment-worker schedule, and
    confirm a fresh two-provider heartbeat before issuing another instruction.
13. Test one authorized existing confirmation download and cross-order denial.
    The JSON must remain private no-store and state that it is not a tax invoice
    or custody receipt.
14. Start exactly one email-worker schedule after notification reconciliation,
    then confirm a bounded aggregate-only worker pass.
15. Create a new verified backup after recovery.
16. Record actual RPO, actual RTO, data lost, and follow-up work.

Representative host commands after the approved artifacts are present:

```bash
sudo systemctl stop nodezuno-email-worker.timer nodezuno-payment-worker.timer
sudo systemctl stop nodezuno-email-worker.service nodezuno-payment-worker.service || true
sudo systemctl stop nodezuno.service
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
sudo install -d -m 0700 "/opt/nodezuno/quarantine/$stamp"
sudo find /opt/nodezuno/data -maxdepth 1 -type f \
  -name 'nodezuno.sqlite*' \
  -exec mv {} "/opt/nodezuno/quarantine/$stamp/" \;
sudo docker compose \
  --project-directory /opt/nodezuno \
  --env-file /opt/nodezuno/runtime.env \
  --file /opt/nodezuno/host-current/compose.yaml \
  run --rm --no-deps restore \
  /var/backups/nodezuno/<verified-backup>.sqlite
sudo systemctl start nodezuno.service
curl --fail https://nodezuno.com/api/v1/ready
```

The restore tool refuses an existing destination, verifies the manifest and
database structure, writes a private file, and does not overwrite live data.

## Rebuild the EC2 host while preserving data

The data volume has Terraform deletion protection. Before replacement:

1. create and verify an off-host backup if the instance still runs;
2. create an on-demand EBS snapshot;
3. record the current ECR digest;
4. disable EC2 termination protection only for the reviewed replacement;
5. preserve the data volume;
6. replace the instance through Terraform;
7. attach and mount the existing volume;
8. re-enable termination protection;
9. invoke the SSM deployment document with the recorded digest;
10. verify DNS, TLS, readiness, authentication, and backup timers.

If the data volume cannot be trusted, create a new volume and use the verified
S3 restore procedure.

## Recover a customer deliverable

Do not change `review_deliverables` metadata to point at a convenient object.
The recorded S3 version and SHA-256 are the identity of the released file.

1. Record the review order, deliverable ID, object key, recorded version ID,
   ETag, SHA-256, size, incident, and approver in the restricted recovery log.
2. Preserve the relevant CloudTrail object data events and S3 version history.
3. Confirm the dedicated KMS key is enabled, scheduled for no deletion, and
   accessible only through approved temporary operator access and the runtime
   role.
4. Read the exact recorded S3 version into an isolated approved workstation or
   recovery container. Never use the current unversioned object implicitly.
5. Verify byte length, SHA-256, content type, object metadata, and KMS identity
   against the sealed database row.
6. If the current version was removed but the recorded noncurrent version still
   exists, restore access to that exact version without modifying the database
   identity. Do not copy another file into the recorded key as a substitute.
7. Test authorization through the review download route and confirm it returns
   a five-minute URL pinned to the recorded version.
8. Confirm CloudTrail records the recovery reads, then document actual impact
   and retention follow-up.

If the exact recorded version or its KMS key is irrecoverable, treat the file as
lost. Recreate and release a new version only through a new reviewed business
and migration procedure that preserves the original audit record. Never hide
the loss by altering the old checksum or storage identity.

## Quarterly drill record

Every drill must record:

- date, operator, reviewer, and isolated target;
- source backup and manifest identifiers;
- time to acquire access;
- time to verify and restore;
- schema migration count;
- expected and actual row-count checks;
- sampled released deliverable version, KMS, checksum, and authorized download
  checks;
- sampled reconciliation-to-confirmation relationship, buyer confirmation
  authorization, and receipt record-hash checks;
- health and authentication results;
- measured RPO and RTO;
- every manual or ambiguous step;
- remediation owner and due date.

A backup system is not considered operational until a restore drill succeeds.
