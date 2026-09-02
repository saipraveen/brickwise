# ADR-003: SOPS + age for Secrets Management (replacing AWS Secrets Manager)

## Status

Accepted

## Date

2026-09-02

## Context

AWS Secrets Manager stored 4 secrets (`db-url`, `jwt-secret`, `rebrickable-api-key`,
`r2-credentials`) resolved into the Lambda function's environment at deploy time via
CloudFormation `{{resolve:secretsmanager:...}}` dynamic references (see
`infra/sam/template.yaml`).

Secrets Manager has no free tier: it billed a flat **$0.40/secret/month**, ~$1.60/month
total. Every other resource in this project (ECR, Lambda, Cloudflare R2/Pages/DNS, Neon,
Terraform Cloud - see ADR-001's cost table) sits inside an always-free tier, so Secrets
Manager was the only recurring line item on the bill, out of proportion to a
single-developer personal project.

## Decision

Replace AWS Secrets Manager with secrets encrypted at rest in the repo using
[SOPS](https://github.com/getsops/sops) and an [age](https://github.com/FiloSottile/age)
keypair, decrypted directly into env vars/CloudFormation parameters at deploy time.

### How it works

- `infra/secrets/production.enc.yaml` holds the secrets (`DATABASE_URL`, `JWT_SECRET`,
  `REBRICKABLE_API_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`),
  encrypted per-value with SOPS. The ciphertext is safe to commit; `.sops.yaml` at the repo
  root pins the age recipient (public key) allowed to encrypt for that path.
- The corresponding age **private** key is stored only as the `SOPS_AGE_KEY` GitHub Actions
  secret (never in the repo).
- `deploy-infra.yml` decrypts the file with `sops -d --output-type dotenv` and passes the
  values to `sam deploy --parameter-overrides` as `NoEcho` CloudFormation parameters, which
  become the Lambda's env vars - the same place they landed before.
- `deploy-server.yml` decrypts just `DATABASE_URL` (via `sops -d --extract`) to run Drizzle
  migrations from CI.
- Decrypted values are masked in Actions logs with `::add-mask::` before use.
- To rotate or edit a secret locally: `sops infra/secrets/production.enc.yaml` (opens the
  decrypted content in `$EDITOR`, re-encrypts on save). Requires the age private key
  available locally via `SOPS_AGE_KEY` or `SOPS_AGE_KEY_FILE`.

### Rejected: secrets in plaintext in code

Committing real secrets in plaintext (even in a "private" repo) was considered and
rejected - GitHub history is effectively permanent, plaintext diffs get pulled into local
clones and CI logs, and a leaked JWT signing secret or DB password is a real compromise.
SOPS gets the "no separate paid service" goal without that risk: the file is useless
without the age private key, which never touches the repo.

## Consequences

- Secrets Manager's ~$1.60/month is eliminated. SOPS and age are free, open-source CLIs;
  GitHub Actions secrets storage is free.
- One new secret to manage: `SOPS_AGE_KEY` (the age private key) as a GitHub Actions
  secret. Losing it means re-generating a keypair and re-encrypting
  `infra/secrets/production.enc.yaml` with the real values again.
- The 4 `aws_secretsmanager_secret` resources and the Lambda's `SecretsManagerRead` IAM
  policy statement are removed from `infra/terraform/aws.tf` and
  `infra/sam/template.yaml`. The actual AWS Secrets Manager secrets and the
  `SecretsManagerReadWrite` permission on the `github-actions-brickwise` OIDC role (see
  ADR-002) should be deleted/tightened manually in AWS once this change is confirmed
  working, to stop the charge and narrow the role's blast radius.
- Anyone who needs to read/edit production secrets locally needs the age private key
  out-of-band (not in git) plus the `sops` and `age` CLIs.
