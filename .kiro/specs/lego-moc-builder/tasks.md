# Implementation Plan: LEGO MOC Builder

## Overview

Incremental implementation of the LEGO MOC Builder PWA following a monorepo structure with React 19 client, Express 5 server, and shared TypeScript types. Infrastructure setup (monorepo, DB schema, SAM template, CI/CD) comes first, followed by core domain logic, AI integration, and feature layers. All code is TypeScript running on Node.js 24 LTS.

## Tasks

- [x] 1. Set up external service accounts and credentials
  - [x] 1.1 Sign up for Neon and create PostgreSQL database
    - **Manual step**: Go to neon.tech, sign up with email, create project "brickwise", choose region closest to Lambda (us-east-1)
    - Note the connection string (postgresql://user:pass@ep-xyz.us-east-2.aws.neon.tech/neondb)
    - _Requirements: 9.1, 9.2_

  - [x] 1.2 Sign up for Rebrickable and generate API key
    - **Manual step**: Go to rebrickable.com, create account, navigate to profile settings, generate API key
    - _Requirements: 9.6_

  - [x] 1.3 Create Cloudflare R2 bucket for image storage
    - **Manual step**: In Cloudflare dashboard, enable R2, create bucket "brickwise-scan-images", set lifecycle rule (auto-delete after 30 days)
    - Generate R2 API token (S3-compatible access key + secret)
    - _Requirements: Design (Image Storage)_

  - [x] 1.4 Create Cloudflare Pages project
    - **Manual step**: In Cloudflare dashboard, go to Pages, create project connected to saipraveen/brickwise GitHub repo
    - Set build command: `cd client && pnpm run build`, output directory: `client/dist`
    - Configure custom domain: lego.oruganti.in (CNAME record)
    - _Requirements: ADR-001 (Frontend Hosting)_

  - [x] 1.5 Create AWS ECR repository for backend Docker images
    - Run `aws ecr create-repository --repository-name brickwise-api`
    - Note the repository URI for CI/CD pipeline
    - _Requirements: ADR-001 (Container Registry)_

  - [x] 1.6 Store secrets in AWS Secrets Manager
    - Create secret `brickwise/db-url` with Neon connection string
    - Create secret `brickwise/rebrickable-api-key` with Rebrickable key
    - Create secret `brickwise/r2-credentials` with R2 access key and secret
    - Create secret `brickwise/jwt-secret` with a randomly generated 256-bit key
    - _Requirements: ADR-001 (Environment Configuration)_

  - [x] 1.7 Configure GitHub Actions secrets for CI/CD
    - **Manual step**: In GitHub repo settings (saipraveen/brickwise), go to Settings > Secrets > Actions
    - Add `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (IAM deploy user credentials)
    - Add `CLOUDFLARE_API_TOKEN` (Cloudflare Pages deploy token)
    - Add `CLOUDFLARE_ACCOUNT_ID`
    - _Requirements: ADR-001 (CI/CD Pipeline)_

  - [x] 1.8 Configure DNS subdomains in Cloudflare
    - **Manual step**: In Cloudflare DNS for oruganti.in, add CNAME record: `lego` pointing to Pages deployment URL
    - Add CNAME record: `lego-api` pointing to Lambda Function URL (created after first SAM deploy)
    - _Requirements: ADR-001 (DNS Configuration)_

- [x] 2. Initialize monorepo and project infrastructure
  - [x] 2.1 Scaffold pnpm monorepo with client, server, and shared workspaces
    - Create root `pnpm-workspace.yaml`, root `package.json`, and `tsconfig.base.json`
    - Create `client/package.json` with React 19, Vite 6, TypeScript 5
    - Create `server/package.json` with Express 5, Drizzle ORM, TypeScript 5
    - Create `shared/package.json` for shared types
    - Create workspace-level tsconfig files extending the base
    - _Requirements: ADR-001 (Monorepo Structure)_

  - [x] 2.2 Configure Vite and React client scaffold
    - Set up `vite.config.ts` with React plugin and PWA plugin
    - Create `client/src/main.tsx` entry point and `App.tsx` shell
    - Add PWA manifest (`manifest.json`) with app metadata
    - Add placeholder Service Worker registration
    - _Requirements: ADR-001 (Frontend Hosting)_

  - [x] 2.3 Configure Express server scaffold with Lambda Web Adapter Dockerfile
    - Create `server/src/server.ts` with Express 5 app listening on port 8080
    - Create `server/Dockerfile` with Lambda Web Adapter COPY instruction
    - Create `server/src/routes/health.ts` with a health check endpoint
    - _Requirements: ADR-001 (Backend Portability)_

  - [x] 2.4 Create shared types package with core domain interfaces
    - Define `BrickEntry`, `CatalogPart`, `CatalogSet`, `CatalogColor` types
    - Define `ScanResult`, `IdentifiedBrick`, `RecognitionResult` types
    - Define `CoverageResult`, `MissingPart`, `RequiredPart` types
    - Define API request/response DTOs
    - _Requirements: 1.4, 2.1, 5.4, 9.1_

  - [x] 2.5 Set up Drizzle ORM with Neon PostgreSQL schema
    - Create `server/drizzle.config.ts` pointing to Neon connection
    - Define all tables from the ER diagram: users, set_collection, brick_inventory, storage_bag, share, share_invite, moc_wishlist, display_favorite, catalog_part, catalog_color, catalog_set, catalog_set_part
    - Create initial migration
    - _Requirements: 9.1, 9.2_

  - [x] 2.6 Create Terraform + SAM infrastructure-as-code
    - Create `infra/terraform/main.tf` with AWS and Cloudflare providers, local backend
    - Create `infra/terraform/aws.tf` with ECR repository, Secrets Manager secret resources
    - Create `infra/terraform/cloudflare.tf` with R2 bucket lifecycle rule, DNS records, Pages project
    - Create `infra/terraform/variables.tf` and `infra/terraform/outputs.tf`
    - Import existing ECR repository into state (`terraform import`)
    - Create `infra/sam/template.yaml` with Lambda function (Docker, arm64, 512MB, 30s timeout)
    - Add FunctionUrlConfig with AuthType NONE
    - Add environment variables (PORT, NODE_ENV)
    - Add IAM policy for Bedrock InvokeModel access and Secrets Manager read
    - _Requirements: ADR-001 (Infrastructure-as-Code)_

  - [x] 2.7 Set up GitHub Actions CI/CD pipelines
    - Create `.github/workflows/deploy-client.yml` for client changes
    - Create `.github/workflows/deploy-server.yml` for server changes
    - Client pipeline: lint, type-check, test, build, deploy to Cloudflare Pages
    - Server pipeline: lint, type-check, test, build Docker, push ECR, update Lambda
    - _Requirements: ADR-001 (CI/CD Pipeline)_

  - [x] 2.8 Set up Vitest and fast-check testing infrastructure
    - Add Vitest config for both client and server workspaces
    - Add fast-check as dev dependency in server and shared
    - Create test helper utilities and test fixtures directory
    - _Requirements: ADR-001 (Testing)_

- [x] 3. Implement authentication and user management
  - [x] 3.1 Implement user registration and login endpoints
    - Create `server/src/routes/auth.ts` with POST /api/auth/register and POST /api/auth/login
    - Implement username validation (3-30 chars, alphanumeric + underscores)
    - Implement password validation (8+ chars, uppercase, lowercase, digit)
    - Hash passwords with bcrypt, store user in DB
    - _Requirements: 8.1_

  - [x] 3.2 Implement JWT authentication middleware with refresh tokens
    - Create `server/src/middleware/auth.ts` JWT verification middleware
    - Implement POST /api/auth/refresh for token rotation
    - Add token expiry (access: 15min, refresh: 7 days)
    - _Requirements: 8.1, 8.2_

  - [x]* 3.3 Write property test for username and password validation
    - **Property 11: Username and Password Validation**
    - **Validates: Requirements 8.1**

- [x] 4. Checkpoint - Ensure infrastructure and auth tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement inventory management core
  - [x] 5.1 Implement inventory CRUD endpoints
    - Create `server/src/routes/inventory.ts` with GET, POST /bulk-add, PATCH, DELETE
    - Implement add bricks (increment quantity or create entry)
    - Implement remove bricks (decrement, reject if exceeds available)
    - Implement grouping by category, color, or part number
    - _Requirements: 2.1, 2.2, 2.5, 2.6, 1.6, 1.12_

  - [x]* 5.2 Write property test for inventory quantity arithmetic
    - **Property 2: Inventory Quantity Arithmetic**
    - **Validates: Requirements 1.6, 1.11, 1.12, 2.2, 2.6**

  - [x]* 5.3 Write property test for inventory status count invariant
    - **Property 4: Inventory Status Count Invariant**
    - **Validates: Requirements 2.5**

  - [x] 5.4 Implement set collection endpoints with status management
    - Create `server/src/routes/sets.ts` with GET, POST, PATCH status, DELETE
    - Implement set import from catalog (add set bricks to inventory)
    - Implement mark as built (bricks to in-use), disassembled (bricks to available)
    - Implement duplicate detection and warning
    - Implement removal with built/partial warning
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 4.6, 2.3, 2.4, 2.7, 1.11_

  - [x]* 5.5 Write property test for set status and brick availability round-trip
    - **Property 3: Set Status and Brick Availability Round-Trip**
    - **Validates: Requirements 2.3, 2.4**

  - [x]* 5.6 Write property test for set build conflict detection
    - **Property 5: Set Build Conflict Detection**
    - **Validates: Requirements 2.7**

- [x] 6. Implement storage bag system
  - [x] 6.1 Implement storage bag CRUD and brick assignment endpoints
    - Create `server/src/routes/bags.ts` with GET, POST, POST bricks, DELETE bricks
    - Implement sequential bag number assignment starting from 1
    - Implement brick-to-bag association with quantity tracking
    - Implement bag overview (distinct types, total count)
    - Implement removal logic (decrement, remove association at zero)
    - Implement validation (reject storing bricks not in available inventory)
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.6, 3.7, 3.9_

  - [x] 6.2 Implement brick location lookup across bags
    - Add query for all bags containing a given brick (by part number and/or color)
    - Return bag numbers with quantity per bag
    - _Requirements: 3.3, 3.8_

  - [x]* 6.3 Write property test for bag sequential numbering
    - **Property 6: Storage Bag Sequential Numbering**
    - **Validates: Requirements 3.1**

  - [x]* 6.4 Write property test for brick-to-bag association and lookup
    - **Property 7: Brick-to-Bag Association and Lookup**
    - **Validates: Requirements 3.2, 3.3, 3.8**

  - [x]* 6.5 Write property test for bag removal correctness
    - **Property 8: Bag Removal Correctness**
    - **Validates: Requirements 3.4, 3.5**

  - [x]* 6.6 Write property test for bag overview statistics
    - **Property 9: Bag Overview Statistics**
    - **Validates: Requirements 3.7**

- [x] 7. Checkpoint - Ensure inventory and storage tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement AI-powered brick recognition
  - [x] 8.1 Implement recognition service with AWS Bedrock integration
    - Create `server/src/services/recognition.ts` with `RecognitionBackend` interface
    - Implement `BedrockClaudeBackend` using AWS SDK InvokeModel for Claude Haiku
    - Add tiered model strategy (Haiku default, Sonnet fallback for low confidence)
    - Implement image preprocessing (resize to max 1024px)
    - Implement structured prompt for brick identification
    - _Requirements: 1.3, 1.10_

  - [x] 8.2 Implement scan session endpoint with caching
    - Create `server/src/routes/scan.ts` with POST /api/scan/identify
    - Implement image hash (SHA-256) for cache lookup
    - Integrate with Cloudflare R2 for image storage and result caching (30-day TTL)
    - Validate identified part numbers against local catalog
    - Implement 10-second timeout with error handling
    - _Requirements: 1.3, 1.8, 1.9_

  - [x] 8.3 Implement confidence threshold flagging and review result processing
    - Create `server/src/services/recognitionResultProcessor.ts`
    - Flag bricks with confidence < 0.70 as `needsReview: true`
    - Return structured results with confidence levels as percentages
    - _Requirements: 1.4, 1.7_

  - [x]* 8.4 Write property test for confidence threshold flagging
    - **Property 10: Confidence Threshold Flagging**
    - **Validates: Requirements 1.7**

  - [x] 8.5 Implement usage quota and cost tracking
    - Create `server/src/services/costMonitor.ts`
    - Track scans per day/month per user (50/day, 500/month limits)
    - Implement daily spend cap ($2) - disable scanning when exceeded
    - Store usage stats in PostgreSQL
    - _Requirements: Design (Cost Management)_

- [x] 9. Implement catalog synchronization
  - [x] 9.1 Implement Rebrickable API client with rate limiting
    - Create `server/src/services/rebrickableClient.ts`
    - Implement parts, sets, colors, and set-parts sync endpoints
    - Add request queue to stay within 100 req/min limit
    - Handle pagination for large result sets
    - **Manual step**: Sign up for Rebrickable API key
    - _Requirements: 9.1, 9.2, 9.6_

  - [x] 9.2 Implement catalog sync scheduler with retry logic
    - Create `server/src/services/catalogSync.ts`
    - Schedule sync every 12 hours
    - Implement retry (1 hour apart, max 3 retries)
    - Store last sync timestamp, expose in settings
    - _Requirements: 9.3, 9.4, 9.5, 9.9_

  - [x] 9.3 Implement set search endpoint against catalog
    - Add GET /api/sets/search returning up to 50 matching sets
    - Search by set number, name, or theme
    - _Requirements: 4.3_

- [x] 10. Implement part coverage and MOC discovery
  - [x] 10.1 Implement part coverage calculator service
    - Create `server/src/services/partCoverage.ts`
    - Calculate coverage as matched part-color pairs / total required pairs * 100 (rounded)
    - Return missing parts list with quantity needed vs owned
    - _Requirements: 5.4, 5.5, 6.4_

  - [x]* 10.2 Write property test for part coverage calculation correctness
    - **Property 1: Part Coverage Calculation Correctness**
    - **Validates: Requirements 5.4, 5.5, 6.4**

  - [x] 10.3 Implement MOC discovery endpoints
    - Create `server/src/routes/mocs.ts` with GET /api/mocs, GET /api/mocs/:id, GET /api/mocs/:id/buildability
    - Implement paginated browsing (max 50 per page)
    - Implement theme/category filtering
    - Sort by Part_Coverage descending when user has inventory
    - _Requirements: 5.1, 5.2, 5.3, 5.6_

  - [x]* 10.4 Write property test for buildability sort order
    - **Property 15: Buildability Sort Order**
    - **Validates: Requirements 5.6, 6.1**

  - [x] 10.5 Implement MOC wishlist endpoints
    - Add POST /api/mocs/wishlist, GET /api/mocs/wishlist
    - Limit to 200 saved MOCs per user
    - _Requirements: 5.7_

  - [x] 10.6 Implement alternative rebuild ideas endpoints
    - Create `server/src/routes/rebuilds.ts` with GET /api/rebuilds
    - Accept up to 10 selected sets, query Rebrickable alternates API
    - Filter to Part_Coverage >= 50%, sort descending
    - Support filters: theme, difficulty, min coverage (50-100%)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 10.7 Implement "no results" messaging for MOCs and rebuilds
    - Return appropriate messages when data source is unavailable
    - Return suggestions when no rebuild ideas meet threshold
    - _Requirements: 5.8, 6.6_

- [x] 11. Checkpoint - Ensure coverage, MOC, and rebuild tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Implement sharing and access control
  - [x] 12.1 Implement sharing service and invite endpoints
    - Create `server/src/routes/sharing.ts` with POST /api/sharing/invite, DELETE /api/sharing/revoke, GET /api/shared/:userId
    - Implement invite-only access (max 20 per share)
    - Implement share link generation accessible only to invited users
    - Allow choosing collection, inventory, or both
    - _Requirements: 8.2, 8.3, 8.7_

  - [x] 12.2 Implement shared content view and access enforcement
    - Add middleware to verify invited user access on shared endpoints
    - Display shared sets (name, theme, status) and inventory counts by category
    - Deny access and return error for uninvited users
    - Implement revocation (immediate access denial)
    - _Requirements: 8.4, 8.5, 8.6_

  - [x]* 12.3 Write property test for access control membership
    - **Property 12: Access Control Membership**
    - **Validates: Requirements 8.3, 8.5, 8.6**

- [x] 13. Implement search and filtering
  - [x] 13.1 Implement cross-domain search endpoint
    - Create `server/src/routes/search.ts` with GET /api/search
    - Search across inventory, collection, MOCs, and rebuild ideas
    - Match by name, part number, set number, theme, or designer
    - Require minimum 2-character query
    - _Requirements: 10.1, 10.2_

  - [x] 13.2 Implement multi-filter AND logic and pagination
    - Combine multiple filters with AND logic
    - Cap results at 50 per domain with pagination
    - Serve cached data with warning when remote sources unavailable
    - _Requirements: 10.3, 10.4, 10.5, 10.6, 10.7_

  - [x]* 13.3 Write property test for cross-domain search with AND-logic filters
    - **Property 13: Cross-Domain Search with AND-Logic Filters**
    - **Validates: Requirements 10.1, 10.3**

  - [x]* 13.4 Write property test for result set pagination cap
    - **Property 14: Result Set Pagination Cap**
    - **Validates: Requirements 10.7, 4.3, 5.1**

- [x] 14. Implement display inspiration
  - [x] 14.1 Implement display ideas endpoints
    - Create `server/src/routes/displayIdeas.ts` with GET /api/display-ideas, POST /api/display-ideas/favorites
    - Return at least 3 ideas matching build theme and scale
    - Support category filter (shelf, wall-mount, diorama, lighting, stand)
    - Limit favorites to 100 per user
    - Each idea includes reference image, description (20-300 chars), category, materials list
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 15. Implement buy missing parts integration
  - [x] 15.1 Implement BrickLink and BrickOwl pricing clients
    - Create `server/src/services/marketplaceClient.ts`
    - Query BrickLink API for part pricing and availability
    - Query BrickOwl API for supplementary pricing
    - Generate BrickLink Wanted List XML export
    - _Requirements: 9.7, Design (Buy Missing Parts)_

  - [x] 15.2 Implement missing parts purchase endpoint
    - Add pricing lookup to missing parts response
    - Generate direct marketplace URLs
    - Generate Wobrick bulk order URL
    - _Requirements: Design (Buy Missing Parts)_

- [x] 16. Implement admin dashboard
  - [x] 16.1 Implement admin endpoints and role enforcement
    - Create `server/src/routes/admin.ts` with stats, costs, sync-status, users, quotas, budget-threshold
    - Add admin role check middleware (first registered user is admin)
    - Return usage stats, cost breakdown, sync health, user activity
    - _Requirements: Design (Admin Dashboard)_

- [x] 17. Checkpoint - Ensure all server-side tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 18. Implement React client - core shell and offline support
  - [x] 18.1 Implement PWA shell with routing and navigation
    - Set up React Router with routes for all major views
    - Create layout with persistent navigation and legal disclaimer link
    - Implement responsive mobile-first design
    - _Requirements: 11.1_

  - [x] 18.2 Implement Service Worker with offline caching strategy
    - Register Service Worker for asset caching
    - Implement cache-first strategy for catalog data
    - Implement network-first strategy for API calls with offline fallback
    - _Requirements: Design (Offline Strategy)_

  - [x] 18.3 Implement IndexedDB store with sync queue
    - Create IndexedDB schema (inventory, sets, catalogParts, catalogSets, syncQueue, mocWishlist, displayFavorites)
    - Implement CRUD operations for each object store
    - Implement sync queue for offline writes (queue operations, replay on reconnect)
    - _Requirements: 9.8, Design (IndexedDB Schema)_

- [x] 19. Implement React client - camera and scanning UI
  - [x] 19.1 Implement camera module with MediaDevices API
    - Create camera component with permission request flow
    - Handle permission denied state with settings navigation prompt
    - Implement image capture and base64 encoding
    - _Requirements: 1.1, 1.2_

  - [x] 19.2 Implement scan session UI with review step
    - Create scan session view: capture, loading, results
    - Display identified bricks with confidence percentages
    - Flag low-confidence bricks (< 70%) with visual indicator
    - Allow add/remove/modify bricks before confirmation
    - Show error states (service unavailable, no bricks detected, timeout)
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

- [x] 20. Implement React client - inventory and collection views
  - [x] 20.1 Implement inventory view with grouping and status breakdown
    - Display bricks grouped by category/color/part number (user toggle)
    - Show total count and availability breakdown (available, in-use, in-storage)
    - Implement inline quantity edit and remove actions
    - _Requirements: 2.1, 2.2, 2.5, 2.6_

  - [x] 20.2 Implement set collection view with status management
    - Display sets with images, names, themes, build status
    - Implement mark as built/disassembled with conflict notification UI
    - Implement set search (up to 50 results), add, duplicate warning, remove with confirmation
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 2.3, 2.4, 2.7_

  - [x] 20.3 Implement storage bag management view
    - Display bag overview (bag number, distinct types, total count)
    - Implement create bag, assign bricks to bag, remove from bag
    - Show brick location lookup (which bags contain a given brick)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

- [x] 21. Implement React client - discovery and sharing views
  - [x] 21.1 Implement MOC discovery and wishlist UI
    - Display paginated MOC list with thumbnails, titles, designers, piece counts
    - Implement buildability check with coverage percentage and missing parts
    - Implement wishlist save (max 200)
    - Sort by coverage when inventory loaded
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [x] 21.2 Implement rebuild ideas and display inspiration UI
    - Show rebuild ideas for selected sets with coverage, difficulty
    - Implement filters (theme, difficulty, min coverage)
    - Show display ideas by category with images and descriptions
    - Implement display favorites (max 100)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 21.3 Implement sharing and invite management UI
    - Create share settings view with invite by username
    - Show current invitees with revoke option
    - Implement shared content viewer for invited users
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [x] 21.4 Implement search and filter UI
    - Create global search bar (min 2 chars) with cross-domain results
    - Display results grouped by domain (Inventory, Collection, MOCs, Rebuilds)
    - Implement multi-filter controls with AND logic
    - Implement pagination/load-more (max 50 per domain)
    - Show cached-data warning when remote unavailable
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

- [x] 22. Implement legal compliance and attribution
  - [x] 22.1 Add legal disclaimer and attribution components
    - Create persistent "About"/"Legal" link visible from every screen
    - Display full disclaimer (not affiliated with LEGO Group) on About screen
    - Display Data_Provider attribution (name + link) on relevant screens and About page
    - Use "LEGO" in uppercase only, with trademark acknowledgment per screen
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [x] 23. Implement client authentication flow
  - [x] 23.1 Implement login, registration, and token management in client
    - Create registration form with validation feedback
    - Create login form with error handling
    - Store JWT in memory, refresh token in httpOnly cookie or secure storage
    - Auto-refresh on 401 responses
    - _Requirements: 8.1_

- [x] 24. Final checkpoint - End-to-end integration verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- **Manual steps** (Neon signup, Rebrickable API key) are noted inline but cannot be automated
- Infrastructure tasks (1.x and 2.x) should be completed first as all other tasks depend on them
- Server-side tasks (3-17) can be developed independently of client tasks (18-23)
- The shared types package (2.4) ensures type safety across client and server
- **IaC approach**: SAM manages Lambda lifecycle; Terraform manages platform resources (ECR, Secrets Manager, Cloudflare). Terraform state is local.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5"] },
    { "id": 1, "tasks": ["1.6", "1.7", "1.8", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.8"] },
    { "id": 3, "tasks": ["2.5", "2.6", "2.7"] },
    { "id": 4, "tasks": ["3.1", "3.2"] },
    { "id": 5, "tasks": ["3.3", "5.1"] },
    { "id": 6, "tasks": ["5.2", "5.3", "5.4"] },
    { "id": 7, "tasks": ["5.5", "5.6", "6.1"] },
    { "id": 8, "tasks": ["6.2", "6.3", "6.4", "6.5", "6.6"] },
    { "id": 9, "tasks": ["8.1", "9.1"] },
    { "id": 10, "tasks": ["8.2", "8.3", "9.2", "9.3"] },
    { "id": 11, "tasks": ["8.4", "8.5", "10.1"] },
    { "id": 12, "tasks": ["10.2", "10.3", "10.5", "10.6"] },
    { "id": 13, "tasks": ["10.4", "10.7", "12.1"] },
    { "id": 14, "tasks": ["12.2", "12.3", "13.1"] },
    { "id": 15, "tasks": ["13.2", "13.3", "13.4", "14.1"] },
    { "id": 16, "tasks": ["15.1", "15.2", "16.1"] },
    { "id": 17, "tasks": ["18.1", "18.2"] },
    { "id": 18, "tasks": ["18.3", "19.1"] },
    { "id": 19, "tasks": ["19.2", "20.1", "20.2"] },
    { "id": 20, "tasks": ["20.3", "21.1", "21.2"] },
    { "id": 21, "tasks": ["21.3", "21.4", "22.1", "23.1"] }
  ]
}
```
