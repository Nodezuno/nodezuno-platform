resource "aws_cloudwatch_log_group" "application" {
  name              = "/${var.project_name}/${var.environment}/application"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "caddy" {
  name              = "/${var.project_name}/${var.environment}/edge"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_metric_filter" "edge_5xx" {
  name           = "${local.name_prefix}-edge-5xx"
  pattern        = "{ $.status >= 500 }"
  log_group_name = aws_cloudwatch_log_group.caddy.name

  metric_transformation {
    name      = "Edge5xxCount"
    namespace = "Nodezuno/Operations"
    value     = "1"
  }
}

resource "aws_cloudwatch_log_group" "sessions" {
  name              = "/${var.project_name}/${var.environment}/sessions"
  retention_in_days = 30
}

resource "aws_ssm_document" "session_preferences" {
  count = var.configure_session_manager_preferences ? 1 : 0

  name            = "SSM-SessionManagerRunShell"
  document_type   = "Session"
  document_format = "JSON"

  content = jsonencode({
    schemaVersion = "1.0"
    description   = "Nodezuno regional Session Manager preferences"
    sessionType   = "Standard_Stream"
    inputs = {
      cloudWatchEncryptionEnabled = false
      cloudWatchLogGroupName      = aws_cloudwatch_log_group.sessions.name
      cloudWatchStreamingEnabled  = true
      idleSessionTimeout          = "20"
      maxSessionDuration          = "60"
      runAsEnabled                = false
      s3BucketName                = ""
      s3EncryptionEnabled         = false
      s3KeyPrefix                 = ""
      shellProfile = {
        linux   = ""
        windows = ""
      }
    }
  })
}

resource "aws_sns_topic" "operations" {
  name = "${local.name_prefix}-operations"
}

resource "aws_sns_topic_subscription" "operations_email" {
  topic_arn = aws_sns_topic.operations.arn
  protocol  = "email"
  endpoint  = var.operator_email
}

resource "aws_cloudwatch_metric_alarm" "system_status" {
  alarm_name          = "${local.name_prefix}-ec2-system-status"
  alarm_description   = "The EC2 host has failed a system status check."
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_System"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  treat_missing_data  = "missing"
  alarm_actions = [
    aws_sns_topic.operations.arn,
    "arn:${data.aws_partition.current.partition}:automate:${var.aws_region}:ec2:recover",
  ]
  ok_actions = [aws_sns_topic.operations.arn]

  dimensions = {
    InstanceId = aws_instance.web.id
  }
}

resource "aws_cloudwatch_metric_alarm" "instance_status" {
  alarm_name          = "${local.name_prefix}-ec2-instance-status"
  alarm_description   = "The EC2 guest operating system has failed its status check."
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_Instance"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]

  dimensions = {
    InstanceId = aws_instance.web.id
  }
}

resource "aws_cloudwatch_metric_alarm" "cpu" {
  alarm_name          = "${local.name_prefix}-cpu-high"
  alarm_description   = "CPU has remained above 70 percent for 15 minutes."
  namespace           = "AWS/EC2"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  comparison_operator = "GreaterThanThreshold"
  threshold           = 70
  treat_missing_data  = "missing"
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]

  dimensions = {
    InstanceId = aws_instance.web.id
  }
}

resource "aws_cloudwatch_metric_alarm" "cpu_credit" {
  alarm_name          = "${local.name_prefix}-cpu-credit-low"
  alarm_description   = "The burstable instance is approaching CPU credit exhaustion."
  namespace           = "AWS/EC2"
  metric_name         = "CPUCreditBalance"
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  comparison_operator = "LessThanThreshold"
  threshold           = 24
  treat_missing_data  = "missing"
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]

  dimensions = {
    InstanceId = aws_instance.web.id
  }
}

resource "aws_cloudwatch_metric_alarm" "memory" {
  alarm_name          = "${local.name_prefix}-memory-high"
  alarm_description   = "Host memory has remained above 85 percent for 15 minutes."
  namespace           = "Nodezuno/Operations"
  metric_name         = "MemoryUsedPercent"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  comparison_operator = "GreaterThanThreshold"
  threshold           = 85
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]

  dimensions = {
    InstanceId = aws_instance.web.id
  }
}

resource "aws_cloudwatch_metric_alarm" "disk" {
  alarm_name          = "${local.name_prefix}-disk-high"
  alarm_description   = "The Nodezuno data volume is above 80 percent utilization."
  namespace           = "Nodezuno/Operations"
  metric_name         = "DiskUsedPercent"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  comparison_operator = "GreaterThanThreshold"
  threshold           = 80
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]

  dimensions = {
    InstanceId = aws_instance.web.id
  }
}

resource "aws_cloudwatch_metric_alarm" "root_disk" {
  alarm_name          = "${local.name_prefix}-root-disk-high"
  alarm_description   = "The EC2 root filesystem is above 80 percent utilization."
  namespace           = "Nodezuno/Operations"
  metric_name         = "RootDiskUsedPercent"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  comparison_operator = "GreaterThanThreshold"
  threshold           = 80
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]

  dimensions = {
    InstanceId = aws_instance.web.id
  }
}

resource "aws_cloudwatch_metric_alarm" "swap" {
  alarm_name          = "${local.name_prefix}-swap-use"
  alarm_description   = "The host is using more than 10 percent of its emergency swap."
  namespace           = "Nodezuno/Operations"
  metric_name         = "SwapUsedPercent"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  comparison_operator = "GreaterThanThreshold"
  threshold           = 10
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]

  dimensions = {
    InstanceId = aws_instance.web.id
  }
}

resource "aws_cloudwatch_metric_alarm" "readiness" {
  alarm_name          = "${local.name_prefix}-readiness"
  alarm_description   = "The application has failed two consecutive local readiness checks."
  namespace           = "Nodezuno/Operations"
  metric_name         = "Readiness"
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]

  dimensions = {
    InstanceId = aws_instance.web.id
  }
}

resource "aws_cloudwatch_metric_alarm" "backup_age" {
  alarm_name          = "${local.name_prefix}-backup-age"
  alarm_description   = "No verified off-host backup has completed within eight hours."
  namespace           = "Nodezuno/Operations"
  metric_name         = "BackupAgeHours"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  comparison_operator = "GreaterThanThreshold"
  threshold           = 8
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]

  dimensions = {
    InstanceId = aws_instance.web.id
  }
}

resource "aws_cloudwatch_metric_alarm" "deployment_failure" {
  alarm_name          = "${local.name_prefix}-deployment-failure"
  alarm_description   = "The most recent Nodezuno release attempt reported failure."
  namespace           = "Nodezuno/Operations"
  metric_name         = "DeploymentSuccess"
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]

  dimensions = {
    InstanceId = aws_instance.web.id
  }
}

resource "aws_cloudwatch_metric_alarm" "payment_verifier_health" {
  alarm_name          = "${local.name_prefix}-payment-verifier-health"
  alarm_description   = "The Ethereum payment verifier has missed two healthy heartbeats."
  namespace           = "Nodezuno/Operations"
  metric_name         = "PaymentVerifierHealthy"
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]

  dimensions = {
    InstanceId = aws_instance.web.id
  }
}

resource "aws_cloudwatch_metric_alarm" "background_workers_health" {
  alarm_name          = "${local.name_prefix}-background-workers-health"
  alarm_description   = "An owned background timer is inactive or a worker has not completed successfully within five minutes."
  namespace           = "Nodezuno/Operations"
  metric_name         = "BackgroundWorkersHealthy"
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]

  dimensions = {
    InstanceId = aws_instance.web.id
  }
}

resource "aws_cloudwatch_metric_alarm" "payment_claim_age" {
  alarm_name          = "${local.name_prefix}-payment-claim-age"
  alarm_description   = "A submitted Ethereum payment claim has remained unresolved for more than 15 minutes."
  namespace           = "Nodezuno/Operations"
  metric_name         = "PaymentOldestClaimAgeSeconds"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  comparison_operator = "GreaterThanThreshold"
  threshold           = 900
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]

  dimensions = {
    InstanceId = aws_instance.web.id
  }
}

resource "aws_cloudwatch_metric_alarm" "payment_manual_review" {
  alarm_name          = "${local.name_prefix}-payment-manual-review"
  alarm_description   = "At least one Ethereum payment needs manual reconciliation."
  namespace           = "Nodezuno/Operations"
  metric_name         = "PaymentManualReviewCount"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]

  dimensions = {
    InstanceId = aws_instance.web.id
  }
}

resource "aws_cloudwatch_metric_alarm" "notification_terminal_failures" {
  alarm_name          = "${local.name_prefix}-notification-terminal-failures"
  alarm_description   = "At least one notification has reached terminal failure."
  namespace           = "Nodezuno/Operations"
  metric_name         = "NotificationFailedCount"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]

  dimensions = {
    InstanceId = aws_instance.web.id
  }
}

resource "aws_cloudwatch_metric_alarm" "notification_unresolved_age" {
  alarm_name          = "${local.name_prefix}-notification-unresolved-age"
  alarm_description   = "A pending, processing, or provider-accepted notification has remained unresolved for more than 15 minutes."
  namespace           = "Nodezuno/Operations"
  metric_name         = "NotificationOldestUnresolvedAgeSeconds"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  comparison_operator = "GreaterThanThreshold"
  threshold           = 900
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]

  dimensions = {
    InstanceId = aws_instance.web.id
  }
}

resource "aws_cloudwatch_metric_alarm" "edge_5xx" {
  alarm_name          = "${local.name_prefix}-edge-5xx"
  alarm_description   = "The public edge returned one or more 5xx responses within five minutes."
  namespace           = "Nodezuno/Operations"
  metric_name         = "Edge5xxCount"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]
}

resource "aws_cloudwatch_dashboard" "operations" {
  dashboard_name = "${local.name_prefix}-operations"
  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Host capacity"
          region = var.aws_region
          view   = "timeSeries"
          metrics = [
            ["AWS/EC2", "CPUUtilization", "InstanceId", aws_instance.web.id],
            ["Nodezuno/Operations", "MemoryUsedPercent", "InstanceId", aws_instance.web.id],
            ["Nodezuno/Operations", "DiskUsedPercent", "InstanceId", aws_instance.web.id],
            ["Nodezuno/Operations", "RootDiskUsedPercent", "InstanceId", aws_instance.web.id],
            ["Nodezuno/Operations", "SwapUsedPercent", "InstanceId", aws_instance.web.id],
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Service safety"
          region = var.aws_region
          view   = "timeSeries"
          metrics = [
            ["Nodezuno/Operations", "Readiness", "InstanceId", aws_instance.web.id],
            ["Nodezuno/Operations", "BackupAgeHours", "InstanceId", aws_instance.web.id],
            ["Nodezuno/Operations", "DeploymentSuccess", "InstanceId", aws_instance.web.id],
            ["Nodezuno/Operations", "BackgroundWorkersHealthy", "InstanceId", aws_instance.web.id],
            ["Nodezuno/Operations", "PaymentVerifierHealthy", "InstanceId", aws_instance.web.id],
            ["Nodezuno/Operations", "PaymentVerifierAgeSeconds", "InstanceId", aws_instance.web.id],
            ["Nodezuno/Operations", "PaymentPendingClaims", "InstanceId", aws_instance.web.id],
            ["Nodezuno/Operations", "PaymentOldestClaimAgeSeconds", "InstanceId", aws_instance.web.id],
            ["Nodezuno/Operations", "PaymentManualReviewCount", "InstanceId", aws_instance.web.id],
            ["Nodezuno/Operations", "NotificationFailedCount", "InstanceId", aws_instance.web.id],
            ["Nodezuno/Operations", "NotificationOldestUnresolvedAgeSeconds", "InstanceId", aws_instance.web.id],
            ["Nodezuno/Operations", "Edge5xxCount"],
          ]
        }
      },
    ]
  })
}

resource "aws_budgets_budget" "monthly" {
  name         = "${local.name_prefix}-monthly-cost"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 50
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.operator_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.operator_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.operator_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.operator_email]
  }
}
