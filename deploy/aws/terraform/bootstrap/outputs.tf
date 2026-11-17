output "account_id" {
  value       = data.aws_caller_identity.current.account_id
  description = "AWS account that owns the production stack."
}

output "aws_region" {
  value       = var.aws_region
  description = "Production AWS region."
}

output "elastic_ip" {
  value       = aws_eip.web.public_ip
  description = "Public address to configure at an external DNS provider."
}

output "site_url" {
  value       = "https://${var.domain_name}"
  description = "Canonical production URL."
}

output "instance_id" {
  value       = aws_instance.web.id
  description = "Production EC2 instance ID."
}

output "ssm_start_session_command" {
  value       = "aws ssm start-session --target ${aws_instance.web.id} --region ${var.aws_region}"
  description = "No-SSH operator access command."
}

output "ecr_repository_url" {
  value       = aws_ecr_repository.web.repository_url
  description = "Private image repository."
}

output "backup_bucket_name" {
  value       = aws_s3_bucket.backups.id
  description = "Private Object Lock backup bucket."
}

output "deliverable_bucket_name" {
  value       = aws_s3_bucket.deliverables.id
  description = "Private KMS-encrypted customer deliverables bucket."
}

output "deliverable_kms_key_arn" {
  value       = aws_kms_key.deliverables.arn
  description = "KMS key ARN required by the production application environment."
}

output "data_volume_id" {
  value       = aws_ebs_volume.data.id
  description = "Protected application data volume."
}

output "production_environment_parameter" {
  value       = local.parameter_name
  description = "SecureString parameter name to create outside Terraform."
}

output "alarm_topic_arn" {
  value       = aws_sns_topic.operations.arn
  description = "Confirm the subscription email sent for this topic."
}

output "github_build_role_arn" {
  value       = local.github_enabled ? aws_iam_role.github_build[0].arn : null
  description = "Set as the AWS_BUILD_ROLE_ARN GitHub Actions variable."
}

output "github_deploy_role_arn" {
  value       = local.github_enabled ? aws_iam_role.github_deploy[0].arn : null
  description = "Set as the AWS_DEPLOY_ROLE_ARN GitHub Actions variable."
}

output "deployment_document_name" {
  value       = aws_ssm_document.deploy.name
  description = "Restricted SSM document used for deployments."
}
