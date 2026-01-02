# Deployment Plan: blog.devpad.tools

## Overview

This document covers the deployment strategy for the dev-blog application in two phases:
1. **Phase 1**: Standalone deployment to Cloudflare (current goal)
2. **Phase 2**: Future migration into the devpad monorepo

---

## Current Architecture

```
dev-blog/
├── apps/website/              # Astro + SolidJS frontend (Cloudflare Pages)
│   └── src/lib/api.ts         # Centralized API URL configuration
├── packages/
│   ├── schema/                # Drizzle schema + Zod types + Corpus re-exports
│   └── server/                # Hono API (Cloudflare Workers)
│       └── src/index.ts       # Unified blogRouter mounted at /api/blog
├── migrations/                # Drizzle D1 migrations
└── wrangler.toml             # Cloudflare configuration
```

### Key Components
- **Frontend**: Astro SSR with SolidJS components
- **Backend**: Hono API running on Cloudflare Workers
- **Database**: D1 (SQLite at edge) for metadata
- **File Storage**: R2 bucket for Corpus content versioning (via @f0rbit/corpus)
- **Auth**: Delegates to devpad.tools for GitHub OAuth, also supports API tokens
- **DevPad Integration**: Preview deployments use JWT tokens (not API keys) for DevPad API authentication

### Database Tables (Already Namespaced)

Blog-specific tables are prefixed with `blog_` for future monorepo compatibility:

| Table | Purpose |
|-------|---------|
| `users` | Shared user accounts (no prefix) |
| `access_keys` | Shared API tokens (no prefix) |
| `blog_posts` | Blog posts metadata |
| `blog_categories` | Post categories (hierarchical) |
| `blog_tags` | Post tags |
| `blog_integrations` | External service integrations |
| `blog_fetch_links` | Links between posts and integrations |
| `blog_projects_cache` | Cached DevPad projects |
| `blog_post_projects` | Many-to-many post-project links |

### API Routes (Already Namespaced)

All blog API routes are under `/api/blog/`:

```
/health                    # Health check (shared)
/auth/*                    # Authentication (shared)
/api/blog/posts            # List/create posts
/api/blog/posts/:slug      # Get post by slug
/api/blog/posts/:uuid      # Update/delete post by UUID
/api/blog/categories       # List/create categories
/api/blog/tags             # Tag operations
/api/blog/tokens           # API token management
/api/blog/projects         # DevPad project integration
/api/blog/assets           # Asset management
```

### Frontend API Configuration

All API URLs are configured in `apps/website/src/lib/api.ts`:

```typescript
export const api = {
  blog: (path: string) => `/api/blog${path.startsWith("/") ? path : `/${path}`}`,
  auth: (path: string) => `/auth${path.startsWith("/") ? path : `/${path}`}`,
  
  // Standard fetch with credentials
  async fetch(path: string, options?: RequestInit): Promise<Response>,
  
  // Throwing methods (for try/catch patterns)
  async json<T>(path: string, options?: RequestInit): Promise<T>,
  async post<T>(path: string, body: unknown): Promise<T>,
  async put<T>(path: string, body: unknown): Promise<T>,
  async delete(path: string): Promise<void>,
  
  // Result-based methods (for explicit error handling)
  async fetchResult<T>(path: string, options?: RequestInit): Promise<Result<T, ApiError>>,
  async postResult<T>(path: string, body: unknown): Promise<Result<T, ApiError>>,
  async putResult<T>(path: string, body: unknown): Promise<Result<T, ApiError>>,
  async deleteResult(path: string): Promise<Result<void, ApiError>>,
};
```

For SSR requests, use `api.ssr(locals)` which handles internal routing in the unified worker.

---

## Phase 1: Standalone Deployment

### 1.1 Prerequisites

Before deploying, ensure you have:
- [ ] Cloudflare account with Workers, Pages, D1, and R2 access
- [ ] `wrangler` CLI installed and authenticated (`bunx wrangler login`)
- [ ] Access to Cloudflare DNS for `devpad.tools` domain
- [ ] devpad.tools API available at `https://devpad.io/api` (or staging URL)

### 1.2 Create Cloudflare Resources

#### 1.2.1 Create D1 Database

```bash
# Production database
bunx wrangler d1 create blog-devpad-db

# Staging database (optional)
bunx wrangler d1 create blog-devpad-db-staging
```

**Save the database IDs** from the output. You'll need to update `wrangler.toml`.

#### 1.2.2 Create R2 Bucket

```bash
# Production bucket for Corpus file storage
bunx wrangler r2 bucket create blog-devpad-corpus

# Staging bucket (optional)
bunx wrangler r2 bucket create blog-devpad-corpus-staging
```

#### 1.2.3 Update wrangler.toml

Update the placeholder database IDs with the actual values:

```toml
name = "blog-devpad-api"
main = "dist/_worker.js"
compatibility_date = "2024-12-01"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = "dist"

# Production environment (default)
[vars]
ENVIRONMENT = "production"
DEVPAD_API = "https://devpad.tools"

[[d1_databases]]
binding = "DB"
database_name = "blog-devpad-db"
database_id = "<YOUR_PRODUCTION_D1_ID>"  # Replace with actual ID

[[r2_buckets]]
binding = "CORPUS_BUCKET"
bucket_name = "blog-devpad-corpus"

# Preview environment
[env.preview]
name = "blog-devpad-api-preview"

[env.preview.assets]
directory = "dist"

[env.preview.vars]
ENVIRONMENT = "preview"
DEVPAD_API = "https://devpad.tools"

[[env.preview.d1_databases]]
binding = "DB"
database_name = "blog-devpad-db-preview"
database_id = "<YOUR_PREVIEW_D1_ID>"  # Replace with actual ID

[[env.preview.r2_buckets]]
binding = "CORPUS_BUCKET"
bucket_name = "blog-devpad-corpus-preview"

[dev]
port = 8787
local_protocol = "http"
```

> **Note**: The project uses a unified build (`bun run build`) that bundles the Astro frontend and Hono API into a single Cloudflare Worker. The `[assets]` section serves static files from the `dist` directory.

### 1.3 Database Migrations

#### 1.3.1 Generate Migrations (if schema changed)

```bash
bun run db:generate
```

#### 1.3.2 Apply Migrations to D1

```bash
# Apply to production
bunx wrangler d1 migrations apply blog-devpad-db --remote

# Apply Corpus internal tables (required for @f0rbit/corpus)
bunx wrangler d1 execute blog-devpad-db --remote --file=./node_modules/@f0rbit/corpus/dist/migrations/001_corpus_tables.sql
```

> **Note**: The `@f0rbit/corpus` library requires its own tables in D1 for version metadata. Check the corpus package for the exact migration file path.

#### 1.3.3 Verify Database Setup

```bash
bunx wrangler d1 execute blog-devpad-db --remote --command="SELECT name FROM sqlite_master WHERE type='table';"
```

Expected tables:
- `users`, `access_keys` (shared, no prefix)
- `blog_posts`, `blog_categories`, `blog_tags`, `blog_integrations`
- `blog_fetch_links`, `blog_projects_cache`, `blog_post_projects`
- Corpus internal tables (e.g., `corpus_snapshots`, `corpus_metadata`)

### 1.4 Deploy the API (Cloudflare Workers)

```bash
# Deploy to production
bunx wrangler deploy

# Deploy to staging
bunx wrangler deploy --env staging
```

The API will be available at:
- Production: `https://blog-devpad.<your-subdomain>.workers.dev`
- Staging: `https://blog-devpad-staging.<your-subdomain>.workers.dev`

### 1.5 Deploy the Frontend (Cloudflare Pages)

#### 1.5.1 Option A: Direct Deployment via Wrangler

```bash
cd apps/website
bun run build
bunx wrangler pages deploy ./dist --project-name=blog-devpad-web
```

#### 1.5.2 Option B: Git-Connected Deployment (Recommended)

1. Go to Cloudflare Dashboard > Pages > Create a project
2. Connect your GitHub repository
3. Configure build settings:
   - **Build command**: `cd apps/website && bun install && bun run build`
   - **Build output directory**: `apps/website/dist`
   - **Root directory**: `/` (or leave blank)
4. Set environment variables (see section 1.6)

#### 1.5.3 Configure Pages to Proxy API Calls

The Astro app uses `@astrojs/cloudflare` adapter. API calls from the frontend should be proxied through the same domain or use the Worker URL directly.

**Option 1: Route API to Worker via `_routes.json`**

Create `apps/website/public/_routes.json`:
```json
{
  "version": 1,
  "include": ["/*"],
  "exclude": ["/api/*"]
}
```

Then set up a Worker route in the Cloudflare dashboard to handle `/api/*` requests.

**Option 2: Use Worker URL directly in frontend**

Set the `PUBLIC_API_URL` environment variable to point to the Worker:
```
PUBLIC_API_URL=https://blog-devpad.<subdomain>.workers.dev
```

### 1.6 Environment Variables & Secrets

#### For Workers (API)

Set via `wrangler.toml` [vars] section or as secrets:

| Variable | Type | Description |
|----------|------|-------------|
| `ENVIRONMENT` | var | `production` or `staging` |
| `DEVPAD_API` | var | devpad.tools API URL for auth verification |

```bash
# No secrets currently required for API
# (Auth tokens are validated via devpad API, not local secrets)
```

#### For Pages (Frontend)

Set in Cloudflare Pages dashboard or `.env` file:

| Variable | Description |
|----------|-------------|
| `PUBLIC_API_URL` | Full URL to the API Worker (if not using route-based proxy) |

### 1.7 DNS Configuration

#### 1.7.1 Set Up Custom Domain

In Cloudflare Dashboard:

1. **For Pages (frontend)**:
   - Go to Pages project > Custom domains
   - Add `blog.devpad.tools`
   - Cloudflare will auto-configure DNS if you're using Cloudflare DNS

2. **For Workers (API)** - if using a separate API subdomain:
   - Go to Workers & Pages > your worker > Triggers > Custom Domains
   - Add `api.blog.devpad.tools` (optional)
   
   OR use Routes:
   - Add route `blog.devpad.tools/api/*` -> `blog-devpad` worker

#### 1.7.2 Recommended DNS Setup

| Type | Name | Content | Proxied |
|------|------|---------|---------|
| CNAME | blog | `<pages-project>.pages.dev` | Yes |

If using a separate API subdomain:
| Type | Name | Content | Proxied |
|------|------|---------|---------|
| CNAME | api.blog | `blog-devpad.<subdomain>.workers.dev` | Yes |

### 1.8 CI/CD with GitHub Actions

The project uses two workflow files:

#### Preview Workflow (`.github/workflows/preview.yml`)

Triggers on push to `main` and pull requests. Runs tests/linting and deploys to preview environment on push to main.

```yaml
name: Preview

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run lint
      - run: bun test

  deploy:
    needs: test
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run deploy:preview
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

#### Production Workflow (`.github/workflows/production.yml`)

Triggers on GitHub release publication. Runs tests and deploys to production.

```yaml
name: Production Deployment

on:
  release:
    types: [published]

jobs:
  deploy-production:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun test
      - run: bun run deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

#### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | API token with Workers/D1/R2 permissions |

### 1.9 Post-Deployment Verification

After deployment, verify:

```bash
# 1. Health check
curl https://blog.devpad.tools/health

# 2. Check CORS headers (note: /api/blog/ path)
curl -I -X OPTIONS https://blog.devpad.tools/api/blog/posts \
  -H "Origin: https://blog.devpad.tools"

# 3. Verify auth flow works
# Visit https://blog.devpad.tools and attempt to log in via devpad.tools
```

### 1.10 Rollback Procedure

If something goes wrong:

```bash
# Rollback Worker to previous version
bunx wrangler rollback

# Rollback Pages deployment
# Go to Cloudflare Dashboard > Pages > Deployments > Select previous deployment > "Rollback to this deployment"

# Rollback D1 (if migration caused issues)
# D1 doesn't have built-in rollback, so you'd need to:
# 1. Write a reverse migration
# 2. Restore from a backup (if you made one)
```

**Recommendation**: Before any schema migration, backup your D1:
```bash
bunx wrangler d1 export blog-devpad-db --remote --output=backup-$(date +%Y%m%d).sql
```

---

## Phase 2: Monorepo Migration

### 2.1 Overview

When migrating into the devpad monorepo, the goals are:
1. Share a single D1 database across dev-blog, devpad, and media-timeline
2. Share authentication (GitHub OAuth via devpad)
3. Consolidate infrastructure and reduce operational overhead

### 2.2 Directory Structure After Migration

```
devpad/
├── apps/
│   ├── web/                    # Main devpad app
│   ├── blog/                   # Moved from dev-blog/apps/website
│   └── media-timeline/         # Another app sharing resources
├── packages/
│   ├── server/                 # Unified Hono API server
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── auth/       # Shared auth routes
│   │   │   │   ├── blog/       # Blog-specific routes (moved)
│   │   │   │   ├── projects/   # devpad project routes
│   │   │   │   └── media/      # media-timeline routes
│   │   │   └── index.ts
│   ├── schema/                 # Merged schema package
│   │   ├── src/
│   │   │   ├── blog/          # Blog-specific tables
│   │   │   ├── projects/      # devpad project tables
│   │   │   ├── media/         # media-timeline tables
│   │   │   ├── shared/        # users, auth, etc.
│   │   │   └── index.ts
│   ├── api/                    # Shared API client
│   └── corpus/                 # Corpus integration (shared)
├── migrations/                 # Unified D1 migrations
└── wrangler.toml              # Single Worker config
```

### 2.3 Schema Merging Considerations

#### 2.3.1 Shared Tables

These tables will be shared across all apps:

| Table | Notes |
|-------|-------|
| `users` | Already uses `github_id` as unique identifier |
| `access_keys` | API tokens work across all apps |

#### 2.3.2 Blog-Specific Tables (Already Namespaced)

Blog tables are **already prefixed** with `blog_` - no migration needed:

| Table | Status |
|-------|--------|
| `blog_posts` | ✅ Already prefixed |
| `blog_categories` | ✅ Already prefixed |
| `blog_tags` | ✅ Already prefixed |
| `blog_integrations` | ✅ Already prefixed |
| `blog_fetch_links` | ✅ Already prefixed |
| `blog_projects_cache` | ✅ Already prefixed |
| `blog_post_projects` | ✅ Already prefixed |

#### 2.3.3 No Schema Migration Required

Since tables are already prefixed, no SQL migration is needed when moving to the monorepo. Simply copy the schema files and update import paths.

### 2.4 Authentication Changes

#### Current Flow (Standalone)

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  blog.devpad.   │────▶│  devpad.io/api/  │────▶│  GitHub OAuth   │
│  tools          │     │  auth/verify     │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                        │
        │   Cookie passthrough   │
        ▼                        ▼
   User authenticated      Session validated
```

#### Future Flow (Monorepo)

```
┌─────────────────┐     ┌──────────────────┐
│  blog.devpad.   │────▶│  devpad.io/api/  │  (Same Worker)
│  tools          │     │  (unified)       │
└─────────────────┘     └──────────────────┘
        │                        │
        │   Shared session       │
        ▼                        ▼
   User authenticated      No external call needed
```

**Changes Required**:
1. Remove `verifyWithDevpad()` call in auth middleware
2. Use shared session validation from the unified server
3. Keep API token validation (it already works locally)

### 2.5 Corpus R2 Bucket Sharing

The R2 bucket can be shared across apps using path prefixes:

| App | Corpus Path Prefix |
|-----|-------------------|
| Blog | `blog/posts/<user_id>/<post_uuid>` |
| Media Timeline | `media/<user_id>/<item_uuid>` |
| devpad | `projects/<user_id>/<project_id>` |

**No changes needed** to existing Corpus paths if blog already uses `posts/` prefix.

### 2.6 Code Migration Checklist

#### 2.6.1 Move Files

```bash
# From dev-blog repo to devpad repo

# Frontend
mv dev-blog/apps/website/* devpad/apps/blog/

# Server routes
mv dev-blog/packages/server/src/routes/* devpad/packages/server/src/routes/blog/

# Schema (merge)
mv dev-blog/packages/schema/src/database.ts devpad/packages/schema/src/blog/database.ts
mv dev-blog/packages/schema/src/corpus.ts devpad/packages/schema/src/blog/corpus.ts

# Update imports everywhere
```

#### 2.6.2 Update Package References

In `devpad/apps/blog/package.json`:
```json
{
  "dependencies": {
    "@devpad/schema": "workspace:*",
    "@devpad/api": "workspace:*"
  }
}
```

#### 2.6.3 Update Import Paths

```typescript
// Before
import { posts, users } from "@blog/schema";

// After
import { posts, users } from "@devpad/schema";
// or
import { posts } from "@devpad/schema/blog";
```

#### 2.6.4 Mount Blog Router in Unified Server

The blog server already exports a unified `blogRouter`. In the monorepo, mount it alongside other routers:

```typescript
// devpad/packages/server/src/index.ts
import { blogRouter } from "./routes/blog";
import { projectsRouter } from "./routes/projects";
import { mediaRouter } from "./routes/media";

app.route("/api/blog", blogRouter);      // From dev-blog
app.route("/api/projects", projectsRouter);
app.route("/api/media", mediaRouter);
```

### 2.7 Breaking Changes to Handle

| Change | Impact | Solution |
|--------|--------|----------|
| ~~Table renames~~ | ~~API responses unchanged~~ | ✅ Already done - tables prefixed |
| Import paths | All files need updates | Search/replace `@blog/` → `@devpad/` |
| ~~API routes~~ | ~~Clients need update~~ | ✅ Already done - routes under `/api/blog/` |
| D1 binding name | May differ in monorepo | Use environment abstraction |

### 2.8 Migration Steps (Recommended Order)

1. **Freeze dev-blog development** - no new features during migration
2. **Create `apps/blog` in devpad** - empty placeholder
3. **Copy schema files** - no table renaming needed (already prefixed)
4. ~~Write migration SQL~~ - ✅ Not needed
5. ~~Run migration on production D1~~ - ✅ Not needed
6. **Move server routes** - copy blogRouter, update to use shared auth
7. **Move frontend** - update `api.ts` to point to unified API
8. **Test everything** - local first, then staging
9. **Deploy** - unified Worker + separate Pages deployments
10. **Deprecate dev-blog repo** - archive or redirect

### 2.9 Rollback Plan

If migration fails:
1. Keep dev-blog repo deployable for 30 days post-migration
2. Maintain database backward compatibility (don't drop old tables immediately)
3. DNS can be reverted to point at old Worker/Pages in minutes

---

## Appendix A: Environment Reference

### Development
```bash
# Local development (uses SQLite + file-based Corpus)
bun run dev
```

### Staging
```bash
bunx wrangler deploy --env staging
```

### Production
```bash
bunx wrangler deploy
```

---

## Appendix B: Useful Commands

```bash
# View Worker logs
bunx wrangler tail

# View Worker logs (staging)
bunx wrangler tail --env staging

# D1 shell access
bunx wrangler d1 execute blog-devpad-db --remote --command="<SQL>"

# R2 bucket contents
bunx wrangler r2 object list blog-devpad-corpus

# Check deployment status
bunx wrangler deployments list
```

---

## Appendix C: Troubleshooting

### CORS Issues

If frontend can't reach API:
1. Check `wrangler.toml` for correct origin in CORS config
2. Verify Worker is deployed and accessible
3. Check browser console for specific CORS error

### Auth Not Working

1. Verify `DEVPAD_API` environment variable is set correctly
2. Check that devpad.tools `/api/auth/verify` endpoint is accessible
3. Ensure cookies are being forwarded (check `credentials: 'include'` in fetch)

### D1 Connection Issues

1. Verify database ID in `wrangler.toml` matches actual D1 database
2. Check if migrations have been applied
3. Verify Worker has D1 binding configured

### Corpus/R2 Issues

1. Verify R2 bucket exists and is bound in `wrangler.toml`
2. Check Corpus internal tables exist in D1
3. Verify path format matches expected `posts/<user_id>/<post_uuid>`

---

## Appendix D: Cost Estimates

Cloudflare pricing (as of Dec 2024):

| Service | Free Tier | Paid |
|---------|-----------|------|
| Workers | 100k req/day | $5/month + $0.50/million req |
| Pages | Unlimited static | Unlimited |
| D1 | 5M rows read, 100k writes/day | $0.75/million reads |
| R2 | 10GB storage, 10M reads | $0.015/GB + $0.36/million reads |

For a personal blog, the free tier should be sufficient for quite a while.
