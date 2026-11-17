data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_ssm_parameter" "amazon_linux_arm64" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  host_payload_files = [
    "${path.module}/../../compose.ec2.yaml",
    "${path.module}/../../Caddy.ec2.conf",
    "${path.module}/../../scripts/nodezuno-aws-common.sh",
    "${path.module}/../../scripts/nodezuno-backup.sh",
    "${path.module}/../../scripts/nodezuno-container-firewall.sh",
    "${path.module}/../../scripts/nodezuno-deploy.sh",
    "${path.module}/../../scripts/nodezuno-host-metrics.sh",
  ]
  host_bundle_id = substr(sha256(join(":", concat(
    [for payload_file in local.host_payload_files : filesha256(payload_file)],
    [aws_s3_bucket.deliverables.id, aws_kms_key.deliverables.arn],
  ))), 0, 20)
  common_tags = merge(
    {
      Application = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
      Owner       = var.owner
    },
    var.common_tags,
  )
  parameter_name = "/${var.project_name}/${var.environment}/environment"
  parameter_arn  = "arn:${data.aws_partition.current.partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.parameter_name}"
  trail_name     = "${local.name_prefix}-management"
  trail_arn      = "arn:${data.aws_partition.current.partition}:cloudtrail:${var.aws_region}:${data.aws_caller_identity.current.account_id}:trail/${local.trail_name}"
  github_enabled = var.github_repository != ""
  github_provider_arn = var.create_github_oidc_provider ? (
    local.github_enabled ? aws_iam_openid_connect_provider.github[0].arn : ""
  ) : var.github_oidc_provider_arn
}
