# Infrastructure

This project uses a hybrid **Terraform + AWS SAM** approach for infrastructure-as-code:

- **Terraform** manages platform resources: ECR, Secrets Manager, Cloudflare R2, DNS, Pages, and Neon PostgreSQL
- **AWS SAM** manages the Lambda function lifecycle (Docker image build/push, Function URL, IAM)
- **Terraform Cloud** stores state remotely (free tier)
- **GitHub Actions** runs `terraform plan` on PRs and `terraform apply` on merge to main

See [ADR-001](../docs/adr/001-infrastructure-and-deployment.md) for the full decision record.

## Prerequisites

- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) (for Lambda deploys)
- [AWS CLI](https://aws.amazon.com/cli/) configured with credentials (for SAM)
- A [Terraform Cloud](https://app.terraform.io) account (free tier)

Terraform itself is NOT required locally - all plans and applies run via GitHub Actions against Terraform Cloud.

## Terraform Cloud Setup (One-Time)

1. Sign up at [app.terraform.io](https://app.terraform.io)
2. Create organization: `oruganti`
3. Create workspace: `brickwise` (Execution Mode: API-driven)
4. Add workspace variables (all marked "Sensitive"):
   - `AWS_ACCESS_KEY_ID` (env var)
   - `AWS_SECRET_ACCESS_KEY` (env var)
   - `cloudflare_api_token` (Terraform var)
   - `cloudflare_account_id` (Terraform var)
   - `cloudflare_zone_id` (Terraform var)
   - `neon_api_key` (Terraform var)
5. Generate a Team or User API token
6. Add `TF_API_TOKEN` as a GitHub Actions secret in the repo

## How It Works

```
Push to main (infra/terraform/**)
    └── GitHub Actions (deploy-infra.yml)
        ├── terraform init (connects to Terraform Cloud)
        ├── terraform plan (shows changes)
        └── terraform apply (applies to real infrastructure)

Pull Request (infra/terraform/**)
    └── GitHub Actions (deploy-infra.yml)
        ├── terraform plan (shows what would change)
        └── Comments plan output on the PR for review
```

## Importing Existing Resources

Resources created manually before IaC was set up need to be imported into Terraform Cloud state. Run these locally (one-time) with Terraform CLI, or via the TF Cloud Run page:

```bash
# Install Terraform locally just for import (or use TF Cloud CLI)
cd infra/terraform
terraform init

# ECR Repository
terraform import aws_ecr_repository.api brickwise-api

# Neon project
terraform import neon_project.main <neon-project-id>

# Cloudflare R2 bucket
terraform import cloudflare_r2_bucket.scan_images <account_id>/brickwise-scan-images

# Cloudflare Pages project
terraform import cloudflare_pages_project.frontend <account_id>/brickwise
```

## SAM Setup

```bash
cd infra/sam

# 1. Build the Docker image (uses server/Dockerfile)
sam build

# 2. Deploy (first time - guided mode)
sam deploy --guided
# Follow prompts:
#   Stack name: brickwise-api
#   Region: us-east-1
#   Confirm changes before deploy: Yes
#   Allow SAM CLI IAM role creation: Yes
#   Save arguments to samconfig.toml: Yes

# 3. Subsequent deploys (via CI/CD or manually)
sam build && sam deploy
```

## Post-Deploy Steps

1. After the first SAM deploy, grab the Lambda Function URL from the stack outputs
2. Update the `lego-api` CNAME in `infra/terraform/cloudflare.tf` with the Function URL domain
3. Push the change - GitHub Actions will apply via Terraform Cloud

## Architecture Diagram

```
infra/
├── terraform/
│   ├── main.tf              # Provider config, Terraform Cloud backend
│   ├── aws.tf               # ECR, Secrets Manager resources
│   ├── cloudflare.tf        # R2 bucket, DNS records, Pages project
│   ├── neon.tf              # Neon PostgreSQL project, branch, role, database
│   ├── variables.tf         # Input variables
│   ├── outputs.tf           # Resource outputs
│   └── terraform.tfvars.example  # Variable template (actual values in TF Cloud)
└── sam/
    └── template.yaml        # Lambda function, Function URL, IAM role
```

## Cost

All infrastructure resources are within always-free tiers:
- ECR: 500 MB storage free
- Lambda: 1M requests/month free
- Secrets Manager: ~$1.60/month for 4 secrets
- Cloudflare R2: 10 GB free
- Cloudflare Pages: Unlimited, free
- Cloudflare DNS: Free
- Neon PostgreSQL: 0.5 GB, 100 compute-hours/month free
- Terraform Cloud: Free (500 managed resources)

Only Bedrock usage (AI scanning) incurs variable costs (~$0.50-2/month).
