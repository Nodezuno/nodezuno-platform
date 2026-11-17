# Nodezuno AWS cost model

## Current launch estimate

This estimate was checked for `ap-south-1` on 10 August 2026. It assumes 730
hours, little traffic, ARM Linux On-Demand compute, and no promotional credits.
AWS prices vary by region and can change. Taxes, domain registration, support,
Zoho Mail, and external monitoring are excluded.

| Item | Approximate monthly cost |
| --- | ---: |
| EC2 `t4g.micro` | $4.09 |
| 22 GiB total gp3 storage | $2.01 |
| One public IPv4 address | $3.65 |
| Route 53 hosted zone, when used | $0.50 |
| Dedicated customer deliverables KMS key | About $1.00 plus request usage |
| Small ECR, S3 backup and deliverable storage, CloudTrail data events, snapshots, DNS, and logs | Variable, usually low at launch |
| Core predictable floor | About $11.25 |
| Realistic launch range | About $12 to $17 plus tax and traffic |

The same stack on `t4g.small` adds about $4.09 per month. A realistic small
range is roughly $16 to $21. Use small when memory telemetry makes it the
lowest safe size.

Primary AWS price sources:

- [EC2 Mumbai offer file](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/ap-south-1/index.json)
- [S3 Mumbai offer file](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/ap-south-1/index.json)
- [AWS KMS pricing](https://aws.amazon.com/kms/pricing/)
- [CloudTrail pricing](https://aws.amazon.com/cloudtrail/pricing/)
- [ECR Mumbai offer file](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonECR/current/ap-south-1/index.json)
- [CloudWatch Mumbai offer file](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudWatch/current/ap-south-1/index.json)
- [Public IPv4 pricing](https://aws.amazon.com/vpc/pricing/)
- [Route 53 pricing](https://aws.amazon.com/route53/pricing/)

The first 100 GB per month of AWS regional internet egress is currently free
across eligible services and regions. Do not treat a free tier or temporary
credit as part of long-term unit economics.

## Budget policy

Terraform creates a $30 account-level monthly budget by default with:

- 50 percent actual alert;
- 80 percent actual alert;
- 100 percent actual alert;
- 100 percent forecast alert.

AWS Budget data is delayed and is not a hard spending limit. Review the Cost
Explorer service breakdown weekly during the first month and after every
infrastructure change.

## Expensive resources intentionally absent

| Resource | Approximate idle or minimum effect | Why it is absent |
| --- | ---: | --- |
| NAT Gateway in Mumbai | About $44.53 per month before data | Larger than the whole launch stack |
| Internet-facing ALB in Mumbai | About $24.75 per month before LCUs | One target remains one point of failure |
| EKS control plane | About $73 per month | No platform workload justifies it |
| Single-AZ small RDS PostgreSQL | About $18 per month | Application has no PostgreSQL adapter yet |
| Multi-AZ small RDS PostgreSQL | About $36 per month | No current availability contract requires it |

Current official references:

- [NAT Gateway and public IPv4 pricing](https://aws.amazon.com/vpc/pricing/)
- [Elastic Load Balancing pricing](https://aws.amazon.com/elasticloadbalancing/pricing/)
- [EKS pricing](https://aws.amazon.com/eks/pricing/)
- [RDS for PostgreSQL pricing](https://aws.amazon.com/rds/postgresql/pricing/)

## Upgrade gates

### Resize the EC2 host

Move from micro to small, or small to medium, when any condition is true:

- a single OOM termination occurs;
- ordinary operation uses swap;
- memory is above 75 percent for seven days;
- CPU is above 60 percent for sustained normal traffic;
- CPU credit balance regularly falls below 24;
- deployments fail from resource pressure.

Resizing is the cheapest first response. It does not require a database or
orchestration migration.

### Move to PostgreSQL and ECS

Approve the larger stack only when PostgreSQL prerequisites pass and one of
these business conditions exists:

- a signed customer needs 99.9 percent availability;
- zero-downtime deployments have commercial value;
- required recovery time is below 30 minutes;
- required recovery point is below six hours;
- measured SQLite lock contention affects customers;
- more than one application writer is needed;
- two single-host incidents occur within 90 days;
- revenue covers at least six months of the larger stack.

Expected ECS, ALB, and RDS cost starts around $80 to $110 per month depending
on task size, database mode, public egress design, logs, and WAF choices.

### Consider EKS

EKS is an organizational decision. Consider it only with roughly eight or more
independently deployed services, multiple engineering teams, Kubernetes-native
requirements, and a platform engineer who owns upgrades and incidents. High
traffic by itself does not require Kubernetes.

## Cost review checklist

Before every `terraform apply`:

1. inspect the complete plan;
2. check for NAT gateways, load balancers, databases, clusters, paid security
   services, and public IP addresses;
3. verify log retention, S3 lifecycle rules, deliverable storage growth, KMS
   requests, and CloudTrail object data-event volume;
4. update the AWS Pricing Calculator for the selected region;
5. obtain founder approval for any monthly increase over $10;
6. record the reason and the rollback path.

Do not buy a Savings Plan until two or three months of stable measured usage.
