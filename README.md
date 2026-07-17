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

Currently in the **specification phase**. Requirements and technical design are complete. Implementation tasks are being generated.

## Disclaimer

This project is not affiliated with, endorsed by, or sponsored by the LEGO Group. LEGO is a trademark of the LEGO Group. Data sourced from [Rebrickable](https://rebrickable.com) — attribution and thanks to the Rebrickable community.
