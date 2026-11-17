# Kubernetes portability baseline

This directory proves that the Nodezuno container can run within hardened
Kubernetes primitives. It is not the active AWS deployment and must not be
applied to EKS at the launch stage.

The examples intentionally do not bind an AWS IAM role or another provider
workload identity. The payment CronJob is a portability scaffold only, and no
notification-worker schedule, encrypted StorageClass, off-cluster backup,
alerting, or secret-manager integration is supplied here. Do not expose this
profile to public traffic or enable payments.

The template deliberately uses:

- one application replica;
- one `ReadWriteOnce` persistent volume;
- a `Recreate` strategy;
- an unprivileged UID and GID;
- a read-only root filesystem;
- a runtime-default seccomp profile;
- no service-account token;
- bounded CPU, memory, and temporary storage;
- separate liveness and readiness probes;
- a default-deny NetworkPolicy with explicit ingress and egress.

These settings preserve SQLite's one-writer rule. Increasing `replicas` does
not create availability. It risks database locking and volume-scheduling
failures. Migrate to PostgreSQL and run concurrency tests first.

## Local validation

Use `kind`, `k3d`, or another disposable local cluster when testing the
manifests. Do not use a shared production cluster for template work.

1. Build and scan the root Dockerfile.
2. Load the image into the local cluster and replace both example image values
   with the same immutable digest.
3. Copy `web.config.example.yaml` and replace the public origin.
4. Create the secret through the local cluster secret mechanism. Never commit
   a populated Kubernetes Secret.
5. Apply the ConfigMap, Secret, and workload template.
6. Verify the migration init container completes.
7. Verify `/api/v1/live` and `/api/v1/ready` independently.
8. Test a restart and confirm the persistent database remains intact.
9. Delete the disposable cluster when the test evidence is recorded.

## Production prerequisites

Before adapting this baseline to a managed Kubernetes service:

1. implement a PostgreSQL adapter and migrations;
2. migrate application data to managed PostgreSQL;
3. remove the application data PVC;
4. place mutable artifacts in object storage;
5. make migrations safe when several replicas start;
6. add an ingress controller, certificate management, and provider load
   balancer configuration;
7. use the provider secret manager with workload identity;
8. add pod disruption budgets, autoscaling, topology spread, and multi-zone
   tests;
9. add provider-specific encrypted storage and backup policies;
10. assign a platform owner for upgrades, network policy, admission control,
    observability, and incident response.

The launch AWS profile uses Docker Compose because it provides the same
container and configuration discipline for about one tenth of the practical
EKS cost floor. See [AWS architecture](../../docs/AWS_ARCHITECTURE.md) and
[AWS cost model](../../docs/AWS_COST_MODEL.md).
