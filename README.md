# dev-blog (archived)

> **This project has been migrated and is no longer maintained.**
>
> The blog now lives inside the [`devpad`](https://github.com/f0rbit/devpad) monorepo at [`apps/blog`](https://github.com/f0rbit/devpad/tree/main/apps/blog).

## Migration history

This repo was the **second stop** in a two-step migration:

1. [`dev-blog-go`](https://github.com/f0rbit/dev-blog-go) — original Go server + React SPA (also archived)
2. **`dev-blog`** (this repo) — first TypeScript rewrite as a standalone monorepo (`blog-devpad`): Astro + SolidJS frontend, Hono API on Cloudflare Workers, D1 + Corpus for storage
3. [`devpad/apps/blog`](https://github.com/f0rbit/devpad/tree/main/apps/blog) — folded into the `devpad` monorepo via PR [#79](https://github.com/f0rbit/devpad/pull/79) ("combine media + blog applications into core")

The architecture, schema, and most of the code in `devpad/apps/blog` is derived from this repo. The standalone auth layer was dropped in favour of devpad's shared auth.

## Where to find things now

- **Blog app**: [`devpad/apps/blog`](https://github.com/f0rbit/devpad/tree/main/apps/blog)
- **Schema**: [`@devpad/schema`](https://github.com/f0rbit/devpad/tree/main/packages/schema)
- **API client**: [`@devpad/api`](https://github.com/f0rbit/devpad/tree/main/packages/api)
- **Live site**: blog.devpad.tools

## Tech stack (for historical reference)

| layer | technology |
|-------|------------|
| frontend | astro ssr + solidjs islands |
| backend | hono api on cloudflare workers |
| database | cloudflare d1 (sqlite at edge) |
| storage | cloudflare r2 (content versioning via [@f0rbit/corpus](https://github.com/f0rbit/corpus)) |
| auth | oauth via devpad |
| schema | drizzle orm + drizzle-zod |

## Repository status

This repo is kept for git history. No further development happens here.
