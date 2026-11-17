resource "aws_ebs_encryption_by_default" "account" {
  count = var.enable_account_ebs_encryption ? 1 : 0

  enabled = true
}

resource "aws_ebs_volume" "data" {
  availability_zone = aws_subnet.public[0].availability_zone
  encrypted         = true
  size              = var.data_volume_gib
  type              = "gp3"

  tags = {
    Name                 = "${local.name_prefix}-data"
    NodezunoSnapshotPlan = "daily"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_volume_attachment" "data" {
  device_name                    = "/dev/sdf"
  instance_id                    = aws_instance.web.id
  stop_instance_before_detaching = true
  volume_id                      = aws_ebs_volume.data.id
}

resource "aws_s3_bucket" "backups" {
  bucket              = "${local.name_prefix}-${data.aws_caller_identity.current.account_id}-${var.aws_region}-backups"
  force_destroy       = false
  object_lock_enabled = true

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "backups" {
  bucket = aws_s3_bucket.backups.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "backups" {
  bucket = aws_s3_bucket.backups.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_object_lock_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  depends_on = [aws_s3_bucket_versioning.backups]

  rule {
    default_retention {
      mode = "GOVERNANCE"
      days = var.backup_retention_days
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  depends_on = [aws_s3_bucket_versioning.backups]

  rule {
    id     = "database-backup-retention"
    status = "Enabled"

    filter {
      prefix = "production/"
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 2
    }

    expiration {
      days = var.backup_retention_days + 5
    }

    noncurrent_version_expiration {
      noncurrent_days = var.backup_retention_days + 5
    }
  }
}

resource "aws_s3_bucket_policy" "backups" {
  bucket = aws_s3_bucket.backups.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.backups.arn,
          "${aws_s3_bucket.backups.arn}/*",
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      },
    ]
  })
}

resource "aws_kms_key" "deliverables" {
  description             = "Nodezuno private customer deliverables"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_kms_alias" "deliverables" {
  name          = "alias/${local.name_prefix}-deliverables"
  target_key_id = aws_kms_key.deliverables.key_id
}

resource "aws_s3_bucket" "deliverables" {
  bucket        = "${local.name_prefix}-${data.aws_caller_identity.current.account_id}-${var.aws_region}-deliverables"
  force_destroy = false

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "deliverables" {
  bucket = aws_s3_bucket.deliverables.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "deliverables" {
  bucket = aws_s3_bucket.deliverables.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "deliverables" {
  bucket = aws_s3_bucket.deliverables.id

  rule {
    bucket_key_enabled = true

    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.deliverables.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_versioning" "deliverables" {
  bucket = aws_s3_bucket.deliverables.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_cors_configuration" "deliverables" {
  bucket = aws_s3_bucket.deliverables.id

  cors_rule {
    allowed_headers = [
      "content-type",
      "x-amz-checksum-sha256",
      "x-amz-server-side-encryption",
      "x-amz-server-side-encryption-aws-kms-key-id",
    ]
    allowed_methods = ["POST"]
    allowed_origins = ["https://${var.domain_name}"]
    expose_headers  = ["ETag", "x-amz-checksum-sha256"]
    max_age_seconds = 600
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "deliverables" {
  bucket = aws_s3_bucket.deliverables.id

  depends_on = [aws_s3_bucket_versioning.deliverables]

  rule {
    id     = "deliverable-version-retention"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }

    noncurrent_version_expiration {
      noncurrent_days = 730
    }
  }

  rule {
    id     = "abandoned-deliverable-upload-retention"
    status = "Enabled"

    filter {
      tag {
        key   = "nodezuno-retention"
        value = "temporary"
      }
    }

    expiration {
      days = 1
    }
  }
}

resource "aws_s3_bucket_policy" "deliverables" {
  bucket = aws_s3_bucket.deliverables.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.deliverables.arn,
          "${aws_s3_bucket.deliverables.arn}/*",
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      },
      {
        Sid       = "DenyUnencryptedObjectUploads"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.deliverables.arn}/*"
        Condition = {
          StringNotEquals = {
            "s3:x-amz-server-side-encryption" = "aws:kms"
          }
        }
      },
      {
        Sid       = "DenyWrongDeliverableKey"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.deliverables.arn}/*"
        Condition = {
          StringNotEquals = {
            "s3:x-amz-server-side-encryption-aws-kms-key-id" = aws_kms_key.deliverables.arn
          }
        }
      },
      {
        Sid       = "DenyMissingTemporaryRetentionTag"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.deliverables.arn}/*"
        Condition = {
          StringNotEquals = {
            "s3:RequestObjectTag/nodezuno-retention" = "temporary"
          }
        }
      },
    ]
  })
}

resource "aws_iam_role" "dlm" {
  name = "${local.name_prefix}-dlm"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "dlm.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "dlm" {
  role       = aws_iam_role.dlm.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AWSDataLifecycleManagerServiceRole"
}

resource "aws_dlm_lifecycle_policy" "data" {
  description        = "Daily snapshots for the Nodezuno data volume"
  execution_role_arn = aws_iam_role.dlm.arn
  state              = "ENABLED"

  policy_details {
    resource_types = ["VOLUME"]
    target_tags = {
      NodezunoSnapshotPlan = "daily"
    }

    schedule {
      name      = "Daily encrypted data snapshot"
      copy_tags = true

      create_rule {
        interval      = 24
        interval_unit = "HOURS"
        times         = ["03:30"]
      }

      retain_rule {
        count = var.snapshot_retention_count
      }

      tags_to_add = {
        SnapshotPlan = "${local.name_prefix}-daily"
      }
    }
  }
}
