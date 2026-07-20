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

# Secrets Manager - Database URL
resource "aws_secretsmanager_secret" "db_url" {
  name        = "${var.project_name}/db-url"
  description = "Neon PostgreSQL connection string"

  tags = {
    Project = var.project_name
  }
}

# Secrets Manager - Rebrickable API Key
resource "aws_secretsmanager_secret" "rebrickable_api_key" {
  name        = "${var.project_name}/rebrickable-api-key"
  description = "Rebrickable API v3 key"

  tags = {
    Project = var.project_name
  }
}

# Secrets Manager - R2 Credentials
resource "aws_secretsmanager_secret" "r2_credentials" {
  name        = "${var.project_name}/r2-credentials"
  description = "Cloudflare R2 S3-compatible access credentials"

  tags = {
    Project = var.project_name
  }
}

# Secrets Manager - JWT Secret
resource "aws_secretsmanager_secret" "jwt_secret" {
  name        = "${var.project_name}/jwt-secret"
  description = "JWT signing secret for authentication"

  tags = {
    Project = var.project_name
  }
}
