# Infrastructure

This project uses a hybrid **Terraform + AWS SAM** approach for infrastructure-as-code:

- **Terraform** manages platform resources: ECR, Secrets Manager, Cloudflare R2, DNS, and Pages
- **AWS SAM** manages the Lambda function lifecycle (Docker image build/push, Function URL, IAM)

See [ADR-001](../docs/adr/001-infrastructure-and-deployment.md) for the full decision record.

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/downloads) >= 1.5
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- [AWS CLI](https://aws.amazon.com/cli/) configured with credentials
- Cloudflare API token with R2, DNS, and Pages permissions

## Terraform Setup

```bash
cd infra/terraform

# 1. Copy example vars and fill in real values
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your actual values

# 2. Initialize Terraform
terraform init

# 3. Import existing resources (already created manually)
# ECR repository:
terraform import aws_ecr_repository.api brickwise-api

# Cloudflare R2 bucket:
terraform import cloudflare_r2_bucket.scan_images <account_id>/brickwise-scan-images

# Cloudflare Pages project:
terraform import cloudflare_pages_project.frontend <account_id>/brickwise

# 4. Plan and review changes
terraform plan

# 5. Apply (creates any missing resources, updates existing ones)
terraform apply
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
#   Parameter EcrRepositoryUri: <your-account-id>.dkr.ecr.us-east-1.amazonaws.com/brickwise-api
#   Parameter ImageTag: latest
#   Confirm changes before deploy: Yes
#   Allow SAM CLI IAM role creation: Yes
#   Save arguments to samconfig.toml: Yes

# 3. Subsequent deploys
sam build && sam deploy
```

## Post-Deploy Steps

1. After the first SAM deploy, grab the Lambda Function URL from the stack outputs
2. Update `infra/terraform/cloudflare.tf` - replace the `lego-api` CNAME `content` with the actual Function URL domain
3. Run `terraform apply` to update the DNS record

## Resource Import Commands

These resources were created manually before IaC was set up. Import them into Terraform state:

```bash
# ECR Repository
terraform import aws_ecr_repository.api brickwise-api

# Secrets Manager secrets
terraform import aws_secretsmanager_secret.db_url brickwise/db-url
terraform import aws_secretsmanager_secret.rebrickable_api_key brickwise/rebrickable-api-key
terraform import aws_secretsmanager_secret.r2_credentials brickwise/r2-credentials
terraform import aws_secretsmanager_secret.jwt_secret brickwise/jwt-secret

# Cloudflare R2 bucket
terraform import cloudflare_r2_bucket.scan_images <account_id>/brickwise-scan-images

# Cloudflare Pages project
terraform import cloudflare_pages_project.frontend <account_id>/brickwise
```

Replace `<account_id>` with your Cloudflare account ID.

## State Management

Terraform state is stored **locally** (`terraform.tfstate`). This is appropriate for a single-developer project. The state file is gitignored.

If CI-driven infrastructure changes are needed later, migrate to S3 backend:

```bash
terraform init -migrate-state
```

## Architecture Diagram

```
infra/
├── terraform/
│   ├── main.tf              # Provider config, local backend
│   ├── aws.tf               # ECR, Secrets Manager resources
│   ├── cloudflare.tf        # R2 bucket, DNS records, Pages project
│   ├── variables.tf         # Input variables
│   ├── outputs.tf           # Resource outputs
│   └── terraform.tfvars     # Variable values (gitignored)
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

Only Bedrock usage (AI scanning) incurs variable costs (~$0.50-2/month).
