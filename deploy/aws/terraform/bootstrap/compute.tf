resource "aws_instance" "web" {
  ami                         = data.aws_ssm_parameter.amazon_linux_arm64.value
  instance_type               = var.instance_type
  availability_zone           = aws_subnet.public[0].availability_zone
  subnet_id                   = aws_subnet.public[0].id
  vpc_security_group_ids      = [aws_security_group.web.id]
  associate_public_ip_address = true
  iam_instance_profile        = aws_iam_instance_profile.instance.name

  disable_api_stop        = false
  disable_api_termination = true
  ebs_optimized           = true
  monitoring              = false

  credit_specification {
    cpu_credits = "standard"
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_protocol_ipv6          = "disabled"
    http_put_response_hop_limit = 2
    http_tokens                 = "required"
    instance_metadata_tags      = "disabled"
  }

  root_block_device {
    delete_on_termination = true
    encrypted             = true
    volume_size           = var.root_volume_gib
    volume_type           = "gp3"
  }

  user_data_base64 = base64gzip(templatefile("${path.module}/templates/user-data.sh.tftpl", {
    app_log_group          = aws_cloudwatch_log_group.application.name
    aws_region             = var.aws_region
    backup_bucket          = aws_s3_bucket.backups.id
    backup_script_base64   = base64encode(file("${path.module}/../../scripts/nodezuno-backup.sh"))
    caddy_config_base64    = base64encode(file("${path.module}/../../Caddy.ec2.conf"))
    caddy_log_group        = aws_cloudwatch_log_group.caddy.name
    common_script_base64   = base64encode(file("${path.module}/../../scripts/nodezuno-aws-common.sh"))
    compose_base64         = base64encode(file("${path.module}/../../compose.ec2.yaml"))
    compose_sha256_arm64   = "54488fffb60782f3c8787a48b95ed15f49f5a3a85f4105304bd46db5edd9db61"
    data_volume_id         = aws_ebs_volume.data.id
    deliverable_bucket     = aws_s3_bucket.deliverables.id
    deliverable_kms_arn    = aws_kms_key.deliverables.arn
    deploy_script_base64   = base64encode(file("${path.module}/../../scripts/nodezuno-deploy.sh"))
    firewall_script_base64 = base64encode(file("${path.module}/../../scripts/nodezuno-container-firewall.sh"))
    domain_name            = var.domain_name
    ecr_repository_uri     = aws_ecr_repository.web.repository_url
    host_bundle_id         = local.host_bundle_id
    host_metrics_base64    = base64encode(file("${path.module}/../../scripts/nodezuno-host-metrics.sh"))
    operator_email         = var.operator_email
    parameter_name         = local.parameter_name
  }))

  user_data_replace_on_change = false

  tags = {
    Name = "${local.name_prefix}-web"
    Role = "web"
  }

  lifecycle {
    ignore_changes = [ami]
  }
}

resource "aws_ssm_document" "deploy" {
  name            = "${local.name_prefix}-deploy"
  document_type   = "Command"
  document_format = "JSON"

  content = jsonencode({
    schemaVersion = "2.2"
    description   = "Deploy one immutable Nodezuno ECR image digest"
    parameters = {
      Image = {
        type           = "String"
        description    = "Immutable image URI"
        allowedPattern = "^${replace(aws_ecr_repository.web.repository_url, ".", "\\.")}@sha256:[a-f0-9]{64}$"
      }
    }
    mainSteps = [
      {
        action = "aws:runShellScript"
        name   = "deploy"
        inputs = {
          timeoutSeconds = "1200"
          runCommand = [
            "set -eu; set -o pipefail; printf '%s' '${base64encode(templatefile("${path.module}/templates/stage-host-bundle.sh.tftpl", {
              activator_script_base64 = base64encode(file("${path.module}/../../scripts/nodezuno-activate-release.sh"))
              backup_script_base64    = base64encode(file("${path.module}/../../scripts/nodezuno-backup.sh"))
              caddy_config_base64     = base64encode(file("${path.module}/../../Caddy.ec2.conf"))
              common_script_base64    = base64encode(file("${path.module}/../../scripts/nodezuno-aws-common.sh"))
              compose_base64          = base64encode(file("${path.module}/../../compose.ec2.yaml"))
              deliverable_bucket      = aws_s3_bucket.deliverables.id
              deliverable_kms_arn     = aws_kms_key.deliverables.arn
              deploy_script_base64    = base64encode(file("${path.module}/../../scripts/nodezuno-deploy.sh"))
              firewall_script_base64  = base64encode(file("${path.module}/../../scripts/nodezuno-container-firewall.sh"))
              host_bundle_id          = local.host_bundle_id
              host_metrics_base64     = base64encode(file("${path.module}/../../scripts/nodezuno-host-metrics.sh"))
            }))}' | base64 --decode | bash -s -- '{{ Image }}'",
          ]
        }
      },
    ]
  })
}

resource "aws_ssm_association" "weekly_security_patches" {
  name                = "AWS-RunPatchBaseline"
  association_name    = "${local.name_prefix}-weekly-security-patches"
  schedule_expression = "rate(7 days)"

  parameters = {
    Operation    = "Install"
    RebootOption = "NoReboot"
  }

  targets {
    key    = "InstanceIds"
    values = [aws_instance.web.id]
  }
}
