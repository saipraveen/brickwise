# ADR-001: Infrastructure and Deployment Architecture

## Status

Accepted

## Date

2026-07-17

## Context

The LEGO MOC Builder is a personal-use Progressive Web App for managing brick collections, AI-powered scanning, and MOC discovery. The team (single developer) needs an infrastructure solution that:

1. Minimizes ongoing costs (target: under $5/month total)
2. Maintains code portability (no vendor lock-in for backend logic)
3. Supports camera-based AI recognition via AWS Bedrock
4. Works with Cloudflare DNS (existing domain: oruganti.in)
5. Provides CI/CD via GitHub Actions (existing workflow familiarity)
6. Uses LTS versions of all runtime dependencies

## Decision

We adopt a **hybrid AWS Lambda + Cloudflare architecture** using the AWS Lambda Web Adapter for backend portability.

### Architecture Overview

```
Internet
   |
   ├── lego.oruganti.in ──────────► Cloudflare Pages (React PWA)
   |
   ├── lego-api.oruganti.in ──────► AWS Lambda Function URL
   |                                    │
   |                                    ├── Express.js (Docker container)
   |                                    ├── Lambda Web Adapter (extension)
   |                                    └── Connects to:
   |                                         ├── Neon (PostgreSQL)
   |                                         ├── Cloudflare R2 (image cache)
   |                                         └── AWS Bedrock (AI recognition)
   |
   └── DNS managed by Cloudflare
```

### Technology Choices

| Component | Choice | Version/Tier |
|-----------|--------|-------------|
| Runtime | Node.js | 24 LTS (Active) |
| Package Manager | pnpm | 9.x (latest stable) |
| Frontend Framework | React | 19.x LTS |
| Build Tool | Vite | 6.x |
| Backend Framework | Express.js | 5.x |
| TypeScript | TypeScript | 5.x |
| ORM | Drizzle ORM | Latest stable |
| Testing | Vitest + fast-check | Latest stable |
| Infrastructure-as-Code | AWS SAM | Latest |
| Container Base | node:24-slim | Official LTS |
| Lambda Adapter | aws-lambda-web-adapter | 0.8.x |

### Hosting Services

| Layer | Service | Cost | Always Free? |
|-------|---------|------|--------------|
| Frontend (PWA) | Cloudflare Pages | $0/month | Yes (unlimited bandwidth) |
| Backend API | AWS Lambda (Docker container + Function URL) | $0/month | Yes (1M requests/month always free) |
| Database | Neon (Serverless PostgreSQL) | $0/month | Yes (0.5 GB, 100 compute-hours/month) |
| Image Storage | Cloudflare R2 | $0/month | Yes (10 GB, 1M writes, 10M reads/month) |
| AI Recognition | AWS Bedrock (Claude Haiku) | ~$0.50-2/month | No (pay per token) |
| DNS/CDN | Cloudflare (existing) | $0/month | Yes |
| Domain | lego.oruganti.in (subdomain) | $0 | Already owned |
| CI/CD | GitHub Actions | $0/month | Yes (unlimited for public repos) |
| Container Registry | AWS ECR | $0/month | Yes (500 MB storage always free) |

**Estimated total monthly cost: $0.50-2.00 (AI usage only)**

### Backend Portability via Lambda Web Adapter

The backend is a standard Express.js application packaged in a Docker container. The only Lambda-specific element is a single `COPY` instruction in the Dockerfile:

```dockerfile
FROM node:24-slim
COPY --from=public.ecr.aws/awsguru/aws-lambda-web-adapter:0.8.4 /lambda-web-adapter /opt/extensions/lambda-web-adapter
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 8080
CMD ["node", "dist/server.js"]
```

The same Docker image runs identically on:
- AWS Lambda (adapter activates automatically)
- Local development (`docker run -p 8080:8080`)
- Railway, Render, ECS, Fargate, EC2 (adapter stays dormant)
- Cloudflare Containers

No Lambda handler code is written. The application code is 100% standard Express.js.

### CI/CD Pipeline

```
Push to main
    ├── Client changes (/client/**)
    │       └── GitHub Actions → Build React → Direct Upload to Cloudflare Pages (cloudflare/pages-action@v1)
    │
    └── Server changes (/server/**)
            └── GitHub Actions → Build Docker → Push to ECR → Update Lambda function
```

Cloudflare Pages is configured as a **Direct Upload** project (not Git-connected). GitHub Actions owns the build process and pushes the built assets using the `cloudflare/pages-action@v1` action. This keeps all CI/CD logic in GitHub Actions rather than splitting between GitHub and Cloudflare's build system.

### Cold Start Mitigation

Lambda containers experience 3-5 second cold starts after idle periods. For a personal-use app this is acceptable. If needed later, a CloudWatch EventBridge rule can ping the function every 5 minutes to keep it warm (at negligible cost).

## Alternatives Considered

| Alternative | Reason Rejected |
|-------------|-----------------|
| Railway ($5/month) | Ongoing cost for a low-traffic personal app |
| Render (free) | 60-second cold starts after 15 minutes idle |
| Cloudflare Workers (free) | Requires code changes (V8 isolate, no native Node.js modules) |
| Cloudflare Containers | Not on free tier; ~$5-10/month |
| AWS ECS Fargate | No free tier; ~$30/month minimum |
| AWS RDS PostgreSQL | Free tier expires after 12 months; ~$15/month after |
| Supabase (free) | Auto-pauses after 1 week inactivity; 30+ second wake-up |
| All-Cloudflare (Workers + D1) | Requires framework rewrite; D1 is SQLite not Postgres |

## Consequences

### Positive

- Monthly cost is effectively $0 for infrastructure, only paying for AI usage
- Backend code is fully portable (standard Express.js in Docker)
- Leverages existing Cloudflare DNS and GitHub Actions experience
- All services have always-free tiers (no 12-month expirations)
- Infrastructure-as-Code via SAM template for reproducibility

### Negative

- Cold starts on Lambda (3-5 seconds) for first request after idle
- Slightly more CI/CD complexity than a simple push-to-deploy platform
- Neon has 0.5 GB storage limit (sufficient for LEGO catalog + personal inventory, but may need upgrade if collection grows very large)
- Split infrastructure across two vendors (AWS + Cloudflare) adds operational surface

### Risks

- Neon free tier could change terms (mitigation: data is standard Postgres, easily migrated)
- Lambda Web Adapter is an AWS open-source project (not a managed service) - could become unmaintained (mitigation: adapter is simple, could be forked or replaced)
- Cloudflare R2 free tier limits could change (mitigation: S3 is a fallback at ~$0.17/month for 7.5 GB)
