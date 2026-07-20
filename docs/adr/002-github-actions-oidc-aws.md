# ADR 002: GitHub Actions OIDC Authentication with AWS

## Status

Accepted

## Context

Our GHA workflows need AWS credentials to run Terraform (managing ECR, Secrets Manager, etc.). The two main options are:

1. **Static IAM user keys** stored as GitHub secrets
2. **OIDC federation** with short-lived credentials

We chose OIDC because it eliminates long-lived secrets and provides tighter scoping.

## How It Works

### Components

**IAM OIDC Identity Provider** (`arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com`)

A trust registration in our AWS account. It tells AWS: "I trust identity tokens issued by GitHub's token service at `token.actions.githubusercontent.com`." Without this, AWS would reject any token from GitHub as unknown/untrusted.

**IAM Role** (`arn:aws:iam::<ACCOUNT_ID>:role/github-actions-brickwise`)

Has permissions (ECR, Secrets Manager) but isn't attached to any user or service account. Instead, it has a trust policy that says: "Anyone who presents a valid JWT from the GitHub OIDC provider, where the `sub` claim matches `repo:saipraveen/brickwise:*`, can assume me."

### Authentication Flow

```
GitHub Actions Runner          GitHub OIDC          AWS STS
        |                          |                    |
        |  1. Request JWT          |                    |
        |------------------------->|                    |
        |                          |                    |
        |  2. Signed JWT returned  |                    |
        |<-------------------------|                    |
        |     (sub: repo:saipraveen/brickwise:ref:...)  |
        |                                               |
        |  3. AssumeRoleWithWebIdentity(JWT, role ARN)  |
        |---------------------------------------------->|
        |                                               |
        |                              4. AWS validates:|
        |                              - Issuer known?  |
        |                              - Signature OK?  |
        |                              - sub matches?   |
        |                              - aud matches?   |
        |                                               |
        |  5. Temporary credentials (1hr TTL)           |
        |<----------------------------------------------|
        |                                               |
        |  6. Terraform uses temp creds for AWS APIs    |
        |---------------------------------------------->|
```

Step by step:

1. The `aws-actions/configure-aws-credentials` action asks GitHub: "Give me a signed JWT token for this workflow run."
2. GitHub mints a short-lived JWT containing claims like `sub: repo:saipraveen/brickwise:ref:refs/heads/main`, `aud: sts.amazonaws.com`.
3. The action calls AWS STS `AssumeRoleWithWebIdentity`, passing the JWT and the role ARN.
4. AWS STS validates:
   - Is the token issuer (`token.actions.githubusercontent.com`) a registered OIDC provider in this account?
   - Is the token signature valid (verified against GitHub's public keys)?
   - Does the token's `sub` claim match the role's trust condition (`repo:saipraveen/brickwise:*`)?
   - Does the token's `aud` claim match (`sts.amazonaws.com`)?
5. If all checks pass, STS returns temporary credentials (access key, secret key, session token) valid for approximately 1 hour.
6. Subsequent steps (Terraform) use those temporary credentials to interact with AWS.

### Trust Policy on the Role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:saipraveen/brickwise:*"
        }
      }
    }
  ]
}
```

The `sub` condition scopes access to our specific repo. A token from any other GitHub repo would be rejected.

## Why OIDC Over Static Keys

| Concern | Static Keys | OIDC |
|---------|-------------|------|
| Secret rotation | Manual, easy to forget | Not needed, credentials are ephemeral |
| Blast radius if leaked | Full access until revoked | Token expires in minutes |
| Scope | Tied to IAM user, broad | Tied to specific repo via `sub` claim |
| Audit trail | IAM user identity | GitHub repo + branch + workflow in CloudTrail |
| Setup complexity | Lower | Slightly higher (one-time) |

## Attached Permissions

The role currently has:
- `AmazonEC2ContainerRegistryFullAccess` - manage ECR repos and images
- `SecretsManagerReadWrite` - manage Secrets Manager secrets

## Bootstrap Note

The OIDC provider and this role are created via AWS CLI (not Terraform). This is intentional - they are the bootstrap resources that enable Terraform to run in the first place. Putting them in Terraform would create a circular dependency.

## Decision

Use GitHub Actions OIDC with `aws-actions/configure-aws-credentials@v4` for all AWS authentication in CI/CD workflows. No static AWS credentials stored in GitHub secrets.
