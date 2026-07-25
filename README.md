# Brickwise

A smart brick collection manager and MOC (My Own Creation) discovery tool for building block enthusiasts. Scan bricks with AI-powered recognition, organize your inventory with numbered storage bags, discover alternative builds for your sets, and share your collection with family and friends.

## Project Goals

1. **Build a useful app** — Manage brick collections, discover MOCs, find alternative rebuilds, get display inspiration
2. **Learn AI-augmented development** — Practice spec-driven development, harness engineering, loop engineering, and other modern AI-DLC concepts

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite 6, PWA |
| Backend | Express 5, TypeScript, Node.js 24 LTS |
| Database | PostgreSQL (Neon) |
| AI Recognition | AWS Bedrock (Claude Vision) |
| Image Storage | Cloudflare R2 |
| Hosting | Cloudflare Pages (frontend), AWS Lambda (backend) |
| Data Source | Rebrickable API |

## Architecture

The app uses a **hybrid AWS Lambda + Cloudflare** architecture:
- Frontend PWA hosted on Cloudflare Pages
- Backend runs as a standard Docker container on AWS Lambda via [Lambda Web Adapter](https://github.com/aws/aws-lambda-web-adapter) (zero Lambda-specific code)
- A Cloudflare Worker proxies API requests, rewriting the Host header so Lambda Function URLs accept them (keeps DDoS protection active)
- Same Docker image runs locally, on Lambda, or any container platform

See [ADR-001](docs/adr/001-infrastructure-and-deployment.md) for the full infrastructure decision.

## Project Structure

```
client/     # React PWA (Cloudflare Pages)
server/     # Express API (Lambda Docker container)
shared/     # Shared TypeScript types
docs/adr/   # Architecture Decision Records
.kiro/      # Spec documents (requirements, design, tasks)
```

## Status

Currently in **active development**. All spec tasks are implemented. The app is deployed and live at https://lego.oruganti.in.

## Development

### Prerequisites

- Node.js 24 LTS
- pnpm 9.x
- Docker (for local server testing)

### Local Development

```bash
# Install dependencies
pnpm install

# Build shared types
pnpm --filter shared build

# Run client dev server
pnpm --filter client dev

# Run server (requires DATABASE_URL in .env)
pnpm --filter server dev
```

### Database Migrations

Database migrations are **fully automated via CI**. When you change `server/src/db/schema.ts` and push:

1. The Deploy Server workflow generates new migration files
2. It creates a PR with the migration files
3. You merge the PR
4. The next Deploy Server run applies the migrations to the live database

No local migration commands needed.

## Disclaimer

This project is not affiliated with, endorsed by, or sponsored by the LEGO Group. LEGO is a trademark of the LEGO Group. Data sourced from [Rebrickable](https://rebrickable.com) — attribution and thanks to the Rebrickable community.
