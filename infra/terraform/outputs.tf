output "ecr_repository_url" {
  description = "ECR repository URL for Docker image pushes"
  value       = aws_ecr_repository.api.repository_url
}

output "ecr_repository_arn" {
  description = "ECR repository ARN"
  value       = aws_ecr_repository.api.arn
}

output "lambda_function_url" {
  description = "Lambda Function URL (available after SAM deploy)"
  value       = "Run 'sam deploy' first, then retrieve from SAM outputs"
}

output "secrets_arns" {
  description = "ARNs of all Secrets Manager secrets"
  value = {
    db_url             = aws_secretsmanager_secret.db_url.arn
    rebrickable_api_key = aws_secretsmanager_secret.rebrickable_api_key.arn
    r2_credentials     = aws_secretsmanager_secret.r2_credentials.arn
    jwt_secret         = aws_secretsmanager_secret.jwt_secret.arn
  }
}

output "r2_bucket_name" {
  description = "Cloudflare R2 bucket name"
  value       = cloudflare_r2_bucket.scan_images.name
}

output "pages_project_name" {
  description = "Cloudflare Pages project name"
  value       = cloudflare_pages_project.frontend.name
}

output "frontend_url" {
  description = "Frontend URL"
  value       = "https://lego.${var.domain_name}"
}

output "backend_url" {
  description = "Backend API URL"
  value       = "https://lego-api.${var.domain_name}"
}

# --- Neon Outputs ---

output "neon_project_id" {
  description = "Neon project ID"
  value       = neon_project.main.id
}

output "neon_connection_uri" {
  description = "Neon PostgreSQL connection URI (sensitive)"
  value       = neon_project.main.connection_uri
  sensitive   = true
}

output "neon_branch_id" {
  description = "Neon main branch ID"
  value       = neon_branch.main.id
}
