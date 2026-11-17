variable "aws_region" {
  description = "AWS region for the production stack."
  type        = string
  default     = "ap-south-1"

  validation {
    condition     = can(regex("^[a-z]{2}(?:-gov)?-[a-z]+-[0-9]$", var.aws_region))
    error_message = "aws_region must be a canonical AWS region name."
  }
}

variable "project_name" {
  description = "Lowercase name used for AWS resources."
  type        = string
  default     = "nodezuno"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,30}$", var.project_name))
    error_message = "project_name must use 3 to 31 lowercase letters, numbers, or hyphens."
  }
}

variable "environment" {
  description = "Short environment name used in resource names and tags."
  type        = string
  default     = "prod"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,11}$", var.environment))
    error_message = "environment must use 2 to 12 lowercase letters, numbers, or hyphens."
  }
}

variable "owner" {
  description = "Operational owner tag."
  type        = string
  default     = "nodezuno"
}

variable "domain_name" {
  description = "Public apex domain served by Caddy."
  type        = string

  validation {
    condition = can(regex(
      "^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$",
      var.domain_name,
    ))
    error_message = "domain_name must be a lowercase DNS name such as nodezuno.com."
  }
}

variable "operator_email" {
  description = "Email that receives infrastructure alarms and budget notices."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,63}$", var.operator_email))
    error_message = "operator_email must be a valid email address."
  }
}

variable "instance_type" {
  description = "ARM burstable instance. Start with micro and resize only from metrics."
  type        = string
  default     = "t4g.micro"

  validation {
    condition     = contains(["t4g.micro", "t4g.small", "t4g.medium"], var.instance_type)
    error_message = "instance_type must be t4g.micro, t4g.small, or t4g.medium."
  }
}

variable "root_volume_gib" {
  description = "Encrypted gp3 root volume size."
  type        = number
  default     = 12

  validation {
    condition     = var.root_volume_gib >= 10 && var.root_volume_gib <= 100
    error_message = "root_volume_gib must be between 10 and 100."
  }
}

variable "data_volume_gib" {
  description = "Encrypted gp3 application data volume size."
  type        = number
  default     = 10

  validation {
    condition     = var.data_volume_gib >= 4 && var.data_volume_gib <= 500
    error_message = "data_volume_gib must be between 4 and 500."
  }
}

variable "backup_retention_days" {
  description = "Minimum S3 Object Lock retention for database backups."
  type        = number
  default     = 35

  validation {
    condition     = var.backup_retention_days >= 7 && var.backup_retention_days <= 365
    error_message = "backup_retention_days must be between 7 and 365."
  }
}

variable "snapshot_retention_count" {
  description = "Daily data-volume snapshots retained by DLM."
  type        = number
  default     = 7

  validation {
    condition     = var.snapshot_retention_count >= 2 && var.snapshot_retention_count <= 30
    error_message = "snapshot_retention_count must be between 2 and 30."
  }
}

variable "log_retention_days" {
  description = "CloudWatch application and edge log retention."
  type        = number
  default     = 7

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90], var.log_retention_days)
    error_message = "log_retention_days must be a CloudWatch-supported short retention value."
  }
}

variable "monthly_budget_usd" {
  description = "Account-level monthly AWS budget in US dollars."
  type        = number
  default     = 30

  validation {
    condition     = var.monthly_budget_usd >= 5
    error_message = "monthly_budget_usd must be at least 5."
  }
}

variable "route53_zone_id" {
  description = "Existing public Route 53 hosted-zone ID. Leave empty when DNS is external."
  type        = string
  default     = ""
}

variable "github_repository" {
  description = "GitHub owner/repository allowed to publish and deploy. Leave empty until the repository exists."
  type        = string
  default     = ""

  validation {
    condition = (
      var.github_repository == "" ||
      can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    )
    error_message = "github_repository must use owner/repository format or be empty."
  }
}

variable "github_environment" {
  description = "GitHub environment required for production deployment."
  type        = string
  default     = "production"

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+$", var.github_environment))
    error_message = "github_environment must use letters, numbers, dots, underscores, or hyphens."
  }
}

variable "create_github_oidc_provider" {
  description = "Create the account-wide GitHub Actions OIDC provider. Disable if one already exists."
  type        = bool
  default     = true
}

variable "github_oidc_provider_arn" {
  description = "Existing GitHub Actions OIDC provider ARN when creation is disabled."
  type        = string
  default     = ""
}

variable "enable_account_ebs_encryption" {
  description = "Enable EBS encryption by default in this region. Recommended in a dedicated account."
  type        = bool
  default     = true
}

variable "configure_session_manager_preferences" {
  description = "Manage regional Session Manager preferences and stream shell sessions to CloudWatch. Disable when the account already manages this document."
  type        = bool
  default     = true
}

variable "common_tags" {
  description = "Additional tags applied to every supported AWS resource."
  type        = map(string)
  default     = {}
}
