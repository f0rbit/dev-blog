# dev-blog

a blog platform for [devpad](https://devpad.tools). write, manage, and publish blog posts with version history, project linking, and scheduled publishing.

## features

- markdown/asciidoc editing
- version history via content-addressable storage
- project linking (connect posts to devpad projects)
- hierarchical categories and tags
- scheduled publishing
- api access with tokens

## tech stack

| layer | technology |
|-------|------------|
| frontend | astro ssr + solidjs islands |
| backend | hono api on cloudflare workers |
| database | cloudflare d1 (sqlite at edge) |
| storage | cloudflare r2 (content versioning via [@f0rbit/corpus](https://github.com/f0rbit/corpus)) |
| auth | oauth via devpad |
| schema | drizzle orm + drizzle-zod |

## project structure

```
apps/
  website/              # astro frontend with solidjs islands
packages/
  schema/               # shared types, drizzle tables, zod schemas
  server/               # hono api server
migrations/             # drizzle d1 migrations
scripts/                # build and dev scripts
```

## getting started

### prerequisites

- [bun](https://bun.sh) >= 1.0
- [wrangler](https://developers.cloudflare.com/workers/wrangler/) (for deployment)

### install

```bash
bun install
```

### database setup

```bash
# create local database and seed with test data
bun run db:setup
```

### development

```bash
# run both api (port 8080) and frontend (port 4321) concurrently
bun run dev
```

the dev server provides:
- automatic dev user authentication (no oauth required)
- mock devpad api for project integration
- file-based corpus storage in `./local/corpus`
- sqlite database in `./local/sqlite.db`

### testing

```bash
bun test
```

## deployment

the project uses a unified cloudflare worker that serves both the api and frontend.

### preview environment

```bash
bun run deploy:preview
```

deploys to `blog-devpad-api-preview` worker with preview d1 and r2 resources.

### production

```bash
bun run deploy
```

deploys to `blog-devpad-api` worker with production resources.

### ci/cd

- **preview**: push to `main` triggers tests and deploys to preview
- **production**: github release triggers production deployment

see `.github/workflows/` for workflow definitions.

## commands

| command | description |
|---------|-------------|
| `bun run dev` | start dev server (api + frontend) |
| `bun run dev:server` | start api server only |
| `bun run dev:client` | start astro frontend only |
| `bun test` | run tests |
| `bun run build` | build unified worker |
| `bun run deploy` | deploy to production |
| `bun run deploy:preview` | deploy to preview |
| `bun run db:generate` | generate drizzle migrations |
| `bun run db:push` | push schema to local d1 |
| `bun run db:studio` | open drizzle studio |
| `bun run db:setup` | create and seed local database |
| `bun run db:reset` | reset local database |
| `bun run lint` | run biome linter |
| `bun run lint:fix` | fix lint issues |
| `bun run typecheck` | run typescript type checking |

## architecture

### unified worker

a single cloudflare worker handles both api and frontend requests:

```
request → unified worker
            ├── /api/*, /health, /auth/* → hono api
            └── everything else → astro ssr
```

the build process (`scripts/build-unified.ts`) bundles:
1. astro ssr output with cloudflare adapter
2. hono api server
3. unified entry point that routes between them

### content-addressable storage

post content is stored using [@f0rbit/corpus](https://github.com/f0rbit/corpus), which provides:
- immutable content snapshots (git-like versioning)
- content hashing for deduplication
- version history traversal
- r2 backend for cloudflare deployment

content is stored at `posts/{user_id}/{post_uuid}` with each version addressable by hash.

### api routes

all blog api routes are under `/api/blog/`:

```
/health                  # health check
/auth/*                  # authentication
/api/blog/posts          # list/create posts
/api/blog/posts/:slug    # get post by slug
/api/blog/posts/:uuid    # update/delete post
/api/blog/categories     # category operations
/api/blog/tags           # tag operations
/api/blog/tokens         # api token management
/api/blog/projects       # devpad project integration
```

### database tables

blog tables are prefixed with `blog_` for future monorepo compatibility:

| table | purpose |
|-------|---------|
| `users` | user accounts (shared) |
| `access_keys` | api tokens (shared) |
| `blog_posts` | post metadata |
| `blog_categories` | hierarchical categories |
| `blog_tags` | post tags |
| `blog_projects_cache` | cached devpad projects |
| `blog_post_projects` | post-project links |

## environment

### local development

local dev uses file-based storage:
- database: `./local/sqlite.db`
- corpus: `./local/corpus/`

### cloudflare

| binding | resource |
|---------|----------|
| `DB` | d1 database |
| `CORPUS_BUCKET` | r2 bucket |

| variable | description |
|----------|-------------|
| `ENVIRONMENT` | `production` or `preview` |
| `DEVPAD_API` | devpad api url for auth |

## license

mit
