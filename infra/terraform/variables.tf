variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token for managing resources"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID"
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for oruganti.in"
  type        = string
}

variable "domain_name" {
  description = "Base domain name"
  type        = string
  default     = "oruganti.in"
}

variable "r2_bucket_name" {
  description = "Cloudflare R2 bucket name for scan image storage"
  type        = string
  default     = "brickwise-scan-images"
}

variable "ecr_repo_name" {
  description = "AWS ECR repository name for backend Docker images"
  type        = string
  default     = "brickwise-api"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "brickwise"
}

# --- Neon (PostgreSQL) ---

variable "neon_api_key" {
  description = "Neon API key for managing database resources"
  type        = string
  sensitive   = true
}

variable "neon_org_id" {
  description = "Neon organization ID"
  type        = string
}

variable "neon_project_id" {
  description = "Existing Neon project ID (for import)"
  type        = string
  default     = ""
}

variable "neon_region" {
  description = "Neon region identifier"
  type        = string
  default     = "aws-us-east-1"
}

variable "lambda_function_url_domain" {
  description = "Lambda Function URL domain (without https:// prefix), e.g. abc123.lambda-url.us-east-1.on.aws"
  type        = string
  default     = "a4dqa34vbkgmzj4vf5gxqux5rm0lqvas.lambda-url.us-east-1.on.aws"
}
