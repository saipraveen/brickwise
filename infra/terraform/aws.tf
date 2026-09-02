# ECR Repository for backend Docker images
# Note: This repository already exists and needs to be imported into state.
import {
  to = aws_ecr_repository.api
  id = "brickwise-api"
}

resource "aws_ecr_repository" "api" {
  name                 = var.ecr_repo_name
  image_tag_mutability = "MUTABLE"
  force_delete         = false

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Project = var.project_name
  }
}

# ECR Lifecycle Policy - keep only 5 most recent images to stay within free tier (500 MB)
resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep only 5 most recent images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 5
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# Secrets (DB URL, JWT secret, Rebrickable key, R2 credentials) are no longer
# managed here - AWS Secrets Manager cost ~$1.60/month for 4 secrets with no
# free tier. They now live SOPS-encrypted at infra/secrets/production.enc.yaml
# and are decrypted straight into Lambda env vars at deploy time.
# See docs/adr/003-sops-secrets-management.md.
