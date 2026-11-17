variable "aws_region" {
  description = "AWS region that stores the Terraform state bucket."
  type        = string
  default     = "ap-south-1"
}

variable "owner" {
  description = "Operational owner tag applied to the state resources."
  type        = string
  default     = "nodezuno"
}

variable "project_name" {
  description = "Lowercase project name used in resource names."
  type        = string
  default     = "nodezuno"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,30}$", var.project_name))
    error_message = "project_name must be 3 to 31 lowercase letters, numbers, or hyphens."
  }
}
