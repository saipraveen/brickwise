# R2 Bucket for scan image storage and recognition result caching
# Note: This bucket already exists and needs to be imported into state.
import {
  to = cloudflare_r2_bucket.scan_images
  id = "724e354954a85b8c21a5353ebaa868e8/brickwise-scan-images"
}

resource "cloudflare_r2_bucket" "scan_images" {
  account_id = var.cloudflare_account_id
  name       = var.r2_bucket_name
}

# DNS CNAME record for frontend (Cloudflare Pages)
resource "cloudflare_record" "frontend" {
  zone_id = var.cloudflare_zone_id
  name    = "lego"
  content = "${var.project_name}.pages.dev"
  type    = "CNAME"
  proxied = true
  ttl     = 1 # Auto when proxied
}

# DNS CNAME record for backend API (Lambda Function URL)
# Note: Update the content value after first SAM deploy with the actual Function URL domain
resource "cloudflare_record" "backend" {
  zone_id = var.cloudflare_zone_id
  name    = "lego-api"
  content = "placeholder.lambda-url.us-east-1.on.aws"
  type    = "CNAME"
  proxied = true
  ttl     = 1 # Auto when proxied
}

# Cloudflare Pages project for frontend hosting
resource "cloudflare_pages_project" "frontend" {
  account_id        = var.cloudflare_account_id
  name              = var.project_name
  production_branch = "main"

  build_config {
    build_command   = "cd client && pnpm run build"
    destination_dir = "client/dist"
  }

  deployment_configs {
    production {
      environment_variables = {
        NODE_VERSION = "24"
      }
    }
    preview {
      environment_variables = {
        NODE_VERSION = "24"
      }
    }
  }
}

# Custom domain for the Pages project
resource "cloudflare_pages_domain" "frontend" {
  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.frontend.name
  domain       = "lego.${var.domain_name}"
}
