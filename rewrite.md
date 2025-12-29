# Migration Plan: dev-blog-go to blog.devpad.tools

## Executive Summary

This plan migrates a Go + React blog application to a Cloudflare-first, TypeScript-based architecture using Hono, Corpus, Drizzle ORM, Astro + SolidJS. The migration prioritizes testability, future monorepo integration with devpad, and leverages Corpus for post versioning.

**Key Clarifications:**
- Corpus stores use path `posts/<user_id>/<post_uuid>` - slugs are mutable metadata
- "Published" = `publish_at` date is in the past (enables scheduled publishing)
- Post UUIDs are immutable identifiers; slugs can be changed

---

## 1. Project Structure

```
blog-devpad/
├── apps/
│   └── website/                    # Astro + SolidJS frontend
│       ├── src/
│       │   ├── components/         # SolidJS components
│       │   │   ├── ui/            # Base UI components
│       │   │   ├── post/          # Post-related components
│       │   │   └── layout/        # Layout components
│       │   ├── pages/             # Astro pages
│       │   │   ├── index.astro
│       │   │   ├── posts/
│       │   │   ├── categories/
│       │   │   ├── settings/
│       │   │   └── api/           # API routes (proxy to worker)
│       │   ├── layouts/
│       │   └── styles/
│       │       └── global.css     # devpad design system
│       ├── public/
│       ├── astro.config.mjs
│       └── package.json
├── packages/
│   ├── server/                     # Hono API server (Cloudflare Worker)
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── posts.ts
│   │   │   │   ├── categories.ts
│   │   │   │   ├── tags.ts
│   │   │   │   ├── tokens.ts
│       │   │   ├── integrations.ts
│   │   │   │   ├── projects.ts
│   │   │   │   └── auth.ts
│   │   │   ├── middleware/
│   │   │   │   └── auth.ts
│   │   │   ├── services/          # Business logic
│   │   │   │   ├── posts.ts
│   │   │   │   ├── categories.ts
│   │   │   │   └── integrations.ts
│   │   │   ├── providers/         # External API clients
│   │   │   │   ├── devto.ts
│   │   │   │   ├── devpad.ts
│   │   │   │   └── github.ts
│   │   │   ├── corpus/            # Corpus integration
│   │   │   │   └── posts.ts
│   │   │   └── index.ts           # Main Hono app
│   │   ├── __tests__/
│   │   │   ├── integration/
│   │   │   └── unit/
│   │   └── package.json
│   ├── schema/                     # Shared types & DB schema
│   │   ├── src/
│   │   │   ├── database.ts        # Drizzle schema
│   │   │   ├── types.ts           # Zod schemas + TS types
│   │   │   ├── corpus.ts          # Corpus post schema
│   │   │   └── index.ts
│   │   └── package.json
│   └── api/                        # TypeScript API client
│       ├── src/
│       │   └── index.ts
│       └── package.json
├── scripts/
│   ├── dev-server.ts              # Local dev orchestration
│   ├── migrate-data.ts            # SQLite -> D1/Corpus migration
│   └── seed.ts                    # Test data seeding
├── migrations/                     # Drizzle migrations
├── local/                         # Local development data
│   ├── corpus/                    # File-based Corpus backend
│   └── sqlite.db                  # Local D1 emulation
├── drizzle.config.ts
├── wrangler.toml
├── package.json                   # Root workspace config
├── tsconfig.json
└── vitest.config.ts
```

### File Naming Conventions
- All filenames: **lowercase with hyphens** (e.g., `post-edit.tsx`, `dev-server.ts`)
- Test files: `{name}.test.ts` in `__tests__/integration/` or `__tests__/unit/`
- Components: PascalCase exports, lowercase filenames

---

## 2. Data Architecture

### 2.1 Corpus Store Design

**Store Path Structure:**
```
posts/<user_id>/<post_uuid>
```

- `user_id`: The owning user's ID (scopes data per user)
- `post_uuid`: Immutable UUID for the post (generated on creation)
- Slug is **mutable metadata** stored in D1, not part of the Corpus path

**Content Schema (stored in Corpus):**
```typescript
// packages/schema/src/corpus.ts
import { z } from 'zod';

export const PostContentSchema = z.object({
  title: z.string(),
  content: z.string(),
  description: z.string().optional(),
  format: z.enum(['md', 'adoc']),
});

export type PostContent = z.infer<typeof PostContentSchema>;
```

**Versioning Flow:**
```
Create Post  -> posts/1/abc-123 v1
Edit Post    -> posts/1/abc-123 v2 (parent: v1)
Edit Again   -> posts/1/abc-123 v3 (parent: v2)
```

Every save creates a new version. Corpus handles:
- Content deduplication via SHA-256
- Parent-child lineage tracking
- Time-sortable version history

### 2.2 Publishing Model

**"Published" Definition:**
- A post is **published** when `publish_at <= NOW()`
- A post is **scheduled** when `publish_at > NOW()`
- A post is **draft** when `publish_at IS NULL`

This enables:
1. Immediate publishing: Set `publish_at = NOW()`
2. Scheduled publishing: Set `publish_at` to future date
3. Draft mode: Leave `publish_at` as NULL

**Query Examples:**
```sql
-- Get all published posts
SELECT * FROM posts WHERE publish_at IS NOT NULL AND publish_at <= datetime('now');

-- Get scheduled posts
SELECT * FROM posts WHERE publish_at IS NOT NULL AND publish_at > datetime('now');

-- Get drafts
SELECT * FROM posts WHERE publish_at IS NULL;

-- Get all non-archived posts (any status)
SELECT * FROM posts WHERE archived = 0;
```

### 2.3 D1 Schema (Metadata)

```typescript
// packages/schema/src/database.ts
import { sqliteTable, text, integer, unique, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  github_id: integer('github_id').notNull().unique(),
  username: text('username').notNull(),
  email: text('email'),
  avatar_url: text('avatar_url'),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updated_at: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  uuid: text('uuid').notNull().unique(),                    // Immutable, used in Corpus path
  author_id: integer('author_id').notNull().references(() => users.id),
  slug: text('slug').notNull(),                             // Mutable, for URLs
  corpus_version: text('corpus_version'),                   // Latest Corpus version hash
  category: text('category').notNull().default('root'),
  archived: integer('archived', { mode: 'boolean' }).default(false),
  publish_at: integer('publish_at', { mode: 'timestamp' }), // NULL = draft, past = published, future = scheduled
  created_at: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updated_at: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  project_id: text('project_id'),                           // DevPad project link
}, (table) => ({
  slugUnique: unique().on(table.author_id, table.slug),     // Slug unique per user
}));

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  owner_id: integer('owner_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  parent: text('parent').default('root'),
}, (table) => ({
  uniqueName: unique().on(table.owner_id, table.name),
}));

export const tags = sqliteTable('tags', {
  post_id: integer('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  tag: text('tag').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.post_id, table.tag] }),
}));

export const accessKeys = sqliteTable('access_keys', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull().references(() => users.id),
  key_hash: text('key_hash').notNull().unique(),            // SHA-256 hash, not plaintext
  name: text('name').notNull(),
  note: text('note'),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const integrations = sqliteTable('integrations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull().references(() => users.id),
  source: text('source').notNull(),                         // 'devto', 'medium', etc.
  location: text('location').notNull(),                     // API URL
  data: text('data', { mode: 'json' }),                     // Source-specific config (e.g., token)
  last_fetch: integer('last_fetch', { mode: 'timestamp' }),
  status: text('status').default('pending'),                // pending, fetched, failed
  created_at: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const fetchLinks = sqliteTable('fetch_links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  post_id: integer('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  integration_id: integer('integration_id').notNull().references(() => integrations.id, { onDelete: 'cascade' }),
  identifier: text('identifier').notNull(),                 // External ID (e.g., dev.to slug)
}, (table) => ({
  uniqueLink: unique().on(table.integration_id, table.identifier),
}));

export const devpadTokens = sqliteTable('devpad_tokens', {
  user_id: integer('user_id').primaryKey().references(() => users.id),
  token_encrypted: text('token_encrypted').notNull(),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const projectsCache = sqliteTable('projects_cache', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull().references(() => users.id),
  status: text('status').notNull().default('pending'),
  data: text('data', { mode: 'json' }),
  fetched_at: integer('fetched_at', { mode: 'timestamp' }),
});
```

### 2.4 Combined Post Type (D1 + Corpus)

```typescript
// packages/schema/src/types.ts
import { z } from 'zod';

// What gets stored in Corpus
export const PostContentSchema = z.object({
  title: z.string(),
  content: z.string(),
  description: z.string().optional(),
  format: z.enum(['md', 'adoc']),
});

// Full post (metadata from D1 + content from Corpus)
export const PostSchema = z.object({
  id: z.number(),
  uuid: z.string().uuid(),
  author_id: z.number(),
  slug: z.string(),
  // Content fields (from Corpus)
  title: z.string(),
  content: z.string(),
  description: z.string().optional(),
  format: z.enum(['md', 'adoc']),
  // Metadata fields (from D1)
  category: z.string(),
  tags: z.array(z.string()),
  archived: z.boolean(),
  publish_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  project_id: z.string().nullable(),
  corpus_version: z.string().nullable(),
});

export type Post = z.infer<typeof PostSchema>;
export type PostContent = z.infer<typeof PostContentSchema>;

// Computed properties
export function isPublished(post: Pick<Post, 'publish_at'>): boolean {
  return post.publish_at !== null && post.publish_at <= new Date();
}

export function isScheduled(post: Pick<Post, 'publish_at'>): boolean {
  return post.publish_at !== null && post.publish_at > new Date();
}

export function isDraft(post: Pick<Post, 'publish_at'>): boolean {
  return post.publish_at === null;
}

// Post creation input
export const PostCreateSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  title: z.string().min(1),
  content: z.string(),
  description: z.string().optional(),
  format: z.enum(['md', 'adoc']).default('md'),
  category: z.string().default('root'),
  tags: z.array(z.string()).default([]),
  publish_at: z.coerce.date().nullable().optional(),
  project_id: z.string().nullable().optional(),
});

// Post update input (all fields optional except identification)
export const PostUpdateSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  description: z.string().optional(),
  format: z.enum(['md', 'adoc']).optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  archived: z.boolean().optional(),
  publish_at: z.coerce.date().nullable().optional(),
  project_id: z.string().nullable().optional(),
});

export type PostCreate = z.infer<typeof PostCreateSchema>;
export type PostUpdate = z.infer<typeof PostUpdateSchema>;
```

### 2.5 Migration Strategy

```typescript
// scripts/migrate-data.ts

/**
 * Migration from SQLite to D1 + Corpus
 * 
 * 1. Migrate users (no changes)
 * 2. Migrate categories (no changes)
 * 3. For each post:
 *    a. Generate UUID
 *    b. Extract content fields -> create Corpus entry at posts/<user_id>/<uuid>
 *    c. Create D1 row with uuid, corpus_version reference, and metadata
 * 4. Migrate tags (update post_id references)
 * 5. Migrate access_keys (hash existing plaintext tokens)
 * 6. Migrate integrations + fetch_links
 * 7. Migrate devpad_tokens + projects_cache
 */

interface OldPost {
  id: number;
  author_id: number;
  slug: string;
  title: string;
  description: string;
  content: string;
  format: string;
  category: string;
  archived: boolean;
  publish_at: string;
  created_at: string;
  updated_at: string;
}

async function migratePost(oldPost: OldPost, corpus: CorpusBackend, db: DrizzleDB) {
  // Generate immutable UUID
  const uuid = crypto.randomUUID();
  
  // Store content in Corpus
  const content: PostContent = {
    title: oldPost.title,
    content: oldPost.content,
    description: oldPost.description,
    format: oldPost.format as 'md' | 'adoc',
  };
  
  const corpusPath = `posts/${oldPost.author_id}/${uuid}`;
  const version = await corpus.put(corpusPath, content);
  
  // Create D1 metadata row
  await db.insert(posts).values({
    uuid,
    author_id: oldPost.author_id,
    slug: oldPost.slug,
    corpus_version: version.hash,
    category: oldPost.category,
    archived: oldPost.archived,
    publish_at: oldPost.publish_at ? new Date(oldPost.publish_at) : null,
    created_at: new Date(oldPost.created_at),
    updated_at: new Date(oldPost.updated_at),
  });
  
  return { oldId: oldPost.id, newUuid: uuid };
}
```

**Migration Order:**
1. Users (no dependencies)
2. Categories (depends: users)
3. Posts -> D1 metadata + Corpus content (depends: users) - **returns ID mapping**
4. Tags (depends: posts, uses ID mapping)
5. Access keys (depends: users, hashes tokens)
6. Integrations + fetch_links (depends: users, posts)
7. DevPad tokens + cache (depends: users)

---

## 3. API Design

### 3.1 Hono Route Structure

```typescript
// packages/server/src/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authMiddleware } from './middleware/auth';
import { postsRouter } from './routes/posts';
import { categoriesRouter } from './routes/categories';
import { tagsRouter } from './routes/tags';
import { tokensRouter } from './routes/tokens';
import { integrationsRouter } from './routes/integrations';
import { projectsRouter } from './routes/projects';
import { authRouter } from './routes/auth';

type Env = {
  DB: D1Database;
  CORPUS_BUCKET: R2Bucket;
  DEVPAD_API: string;
};

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors({
  origin: ['https://blog.devpad.tools', 'http://localhost:4321'],
  credentials: true,
}));

// Auth routes (some exempt from middleware)
app.route('/auth', authRouter);

// Protected routes
app.use('*', authMiddleware);
app.route('/posts', postsRouter);
app.route('/post', postsRouter);
app.route('/categories', categoriesRouter);
app.route('/category', categoriesRouter);
app.route('/tags', tagsRouter);
app.route('/tokens', tokensRouter);
app.route('/token', tokensRouter);
app.route('/integrations', integrationsRouter);
app.route('/integration', integrationsRouter);
app.route('/projects', projectsRouter);
app.route('/project', projectsRouter);

export default app;
```

### 3.2 Endpoint Mapping (Old -> New)

| Old Endpoint | New Endpoint | Method | Notes |
|--------------|--------------|--------|-------|
| `/auth/user` | `/auth/user` | GET | Via devpad.tools verify |
| `/auth/github/login` | `/auth/login` | GET | Redirect to devpad.tools |
| `/auth/github/callback` | N/A | - | Handled by devpad.tools |
| `/auth/logout` | `/auth/logout` | GET | |
| `/posts` | `/posts` | GET | Query params for filtering |
| `/posts/{category}` | `/posts?category={cat}` | GET | Query param instead of path |
| `/post/{slug}` | `/post/{slug}` | GET | By slug (user-scoped) |
| `/post/new` | `/post` | POST | Returns full post with UUID |
| `/post/edit` | `/post/{uuid}` | PUT | By UUID (immutable ID) |
| `/post/delete/{id}` | `/post/{uuid}` | DELETE | By UUID |
| `/categories` | `/categories` | GET | |
| `/category/new` | `/category` | POST | |
| `/category/delete/{name}` | `/category/{name}` | DELETE | |
| `/post/tag` | `/post/{uuid}/tags` | PUT | |
| `/post/tag` | `/post/{uuid}/tags` | DELETE | |
| `/tags` | `/tags` | GET | |
| `/tokens` | `/tokens` | GET | |
| `/token/new` | `/token` | POST | |
| `/token/edit` | `/token/{id}` | PUT | |
| `/token/delete/{id}` | `/token/{id}` | DELETE | |
| `/links` | `/integrations` | GET | Renamed for clarity |
| `/links/upsert` | `/integration` | PUT | |
| `/links/fetch/{source}` | `/integration/{source}/sync` | POST | |
| `/links/delete/{id}` | `/integration/{id}` | DELETE | |
| `/projects` | `/projects` | GET | |
| `/project/key` | `/project/key` | PUT | |
| `/project/posts/{id}` | `/posts?project={id}` | GET | Query param |

**New Endpoints (versioning):**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/post/{uuid}/versions` | GET | List all versions of a post |
| `/post/{uuid}/version/{hash}` | GET | Get specific version content |
| `/post/{uuid}/restore/{hash}` | POST | Restore post to specific version |

**Posts Query Parameters:**
```
GET /posts
  ?category=coding      # Filter by category (includes children)
  ?tag=typescript       # Filter by tag
  ?project=abc-123      # Filter by project ID
  ?status=published     # published | scheduled | draft | all (default: all)
  ?archived=false       # Include archived posts (default: false)
  ?limit=10             # Pagination limit
  ?offset=0             # Pagination offset
  ?sort=updated         # created | updated | published (default: updated)
```

### 3.3 Auth Middleware

```typescript
// packages/server/src/middleware/auth.ts
import { Context, Next } from 'hono';
import { createHash } from 'crypto';

interface User {
  id: number;
  github_id: number;
  username: string;
  email: string;
  avatar_url: string;
}

interface DevpadAuthResponse {
  user: User;
}

const EXEMPT_PATHS = ['/auth/user', '/auth/login', '/auth/logout'];

export async function authMiddleware(c: Context, next: Next) {
  // Check if path is exempt
  if (EXEMPT_PATHS.includes(c.req.path)) {
    return next();
  }

  // Check API token header first
  const apiToken = c.req.header('Auth-Token');
  if (apiToken) {
    const user = await validateApiToken(c, apiToken);
    if (user) {
      c.set('user', user);
      return next();
    }
    return c.json({ error: 'Invalid token' }, 401);
  }

  // Check session cookie via devpad.tools
  const cookie = c.req.header('Cookie');
  if (cookie) {
    const user = await verifyWithDevpad(c.env.DEVPAD_API, cookie);
    if (user) {
      // Ensure user exists in local DB (upsert)
      const localUser = await ensureUser(c, user);
      c.set('user', localUser);
      return next();
    }
  }

  return c.json({ error: 'Unauthorized' }, 401);
}

async function validateApiToken(c: Context, token: string): Promise<User | null> {
  const hash = createHash('sha256').update(token).digest('hex');
  
  const result = await c.env.DB.prepare(`
    SELECT u.* FROM users u
    JOIN access_keys ak ON ak.user_id = u.id
    WHERE ak.key_hash = ? AND ak.enabled = 1
  `).bind(hash).first();
  
  return result as User | null;
}

async function verifyWithDevpad(devpadApi: string, cookie: string): Promise<User | null> {
  try {
    const response = await fetch(`${devpadApi}/api/auth/verify`, {
      headers: { Cookie: cookie },
    });
    if (!response.ok) return null;
    const data: DevpadAuthResponse = await response.json();
    return data.user;
  } catch {
    return null;
  }
}

async function ensureUser(c: Context, user: User): Promise<User> {
  // Upsert user from devpad
  await c.env.DB.prepare(`
    INSERT INTO users (github_id, username, email, avatar_url)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (github_id) DO UPDATE SET
      username = excluded.username,
      email = excluded.email,
      avatar_url = excluded.avatar_url,
      updated_at = unixepoch()
  `).bind(user.github_id, user.username, user.email, user.avatar_url).run();
  
  const localUser = await c.env.DB.prepare(
    'SELECT * FROM users WHERE github_id = ?'
  ).bind(user.github_id).first();
  
  return localUser as User;
}
```

### 3.4 Posts Service Example

```typescript
// packages/server/src/services/posts.ts
import { and, eq, lte, isNull, inArray, desc, sql } from 'drizzle-orm';
import { posts, tags, categories } from '@blog/schema';
import { PostContent, PostCreate, PostUpdate, Post } from '@blog/schema/types';

interface PostServiceDeps {
  db: DrizzleDB;
  corpus: CorpusBackend;
}

export class PostService {
  constructor(private deps: PostServiceDeps) {}

  async create(userId: number, input: PostCreate): Promise<Post> {
    const { db, corpus } = this.deps;
    const uuid = crypto.randomUUID();
    
    // Store content in Corpus
    const content: PostContent = {
      title: input.title,
      content: input.content,
      description: input.description,
      format: input.format,
    };
    
    const corpusPath = `posts/${userId}/${uuid}`;
    const version = await corpus.put(corpusPath, JSON.stringify(content));
    
    // Create metadata in D1
    const [postRow] = await db.insert(posts).values({
      uuid,
      author_id: userId,
      slug: input.slug,
      corpus_version: version.hash,
      category: input.category,
      publish_at: input.publish_at,
      project_id: input.project_id,
    }).returning();
    
    // Insert tags
    if (input.tags.length > 0) {
      await db.insert(tags).values(
        input.tags.map(tag => ({ post_id: postRow.id, tag }))
      );
    }
    
    return this.assemblePost(postRow, content, input.tags);
  }

  async update(userId: number, uuid: string, input: PostUpdate): Promise<Post> {
    const { db, corpus } = this.deps;
    
    // Get existing post
    const existing = await db.select().from(posts)
      .where(and(eq(posts.uuid, uuid), eq(posts.author_id, userId)))
      .limit(1);
    
    if (!existing.length) {
      throw new Error('Post not found');
    }
    
    const postRow = existing[0];
    
    // Get current content from Corpus
    const corpusPath = `posts/${userId}/${uuid}`;
    const currentContent = await corpus.get(corpusPath, postRow.corpus_version);
    const currentParsed: PostContent = JSON.parse(currentContent);
    
    // Merge content updates
    const hasContentChanges = input.title || input.content || input.description || input.format;
    let newVersion = postRow.corpus_version;
    
    if (hasContentChanges) {
      const newContent: PostContent = {
        title: input.title ?? currentParsed.title,
        content: input.content ?? currentParsed.content,
        description: input.description ?? currentParsed.description,
        format: input.format ?? currentParsed.format,
      };
      
      // Create new version in Corpus (with parent reference)
      const version = await corpus.put(corpusPath, JSON.stringify(newContent), {
        parent: postRow.corpus_version,
      });
      newVersion = version.hash;
    }
    
    // Update metadata in D1
    await db.update(posts)
      .set({
        slug: input.slug ?? postRow.slug,
        corpus_version: newVersion,
        category: input.category ?? postRow.category,
        archived: input.archived ?? postRow.archived,
        publish_at: input.publish_at !== undefined ? input.publish_at : postRow.publish_at,
        project_id: input.project_id !== undefined ? input.project_id : postRow.project_id,
        updated_at: new Date(),
      })
      .where(eq(posts.uuid, uuid));
    
    // Update tags if provided
    if (input.tags !== undefined) {
      await db.delete(tags).where(eq(tags.post_id, postRow.id));
      if (input.tags.length > 0) {
        await db.insert(tags).values(
          input.tags.map(tag => ({ post_id: postRow.id, tag }))
        );
      }
    }
    
    return this.getByUuid(userId, uuid);
  }

  async list(userId: number, options: ListOptions = {}): Promise<PostsResponse> {
    const { db, corpus } = this.deps;
    const {
      category,
      tag,
      project,
      status = 'all',
      archived = false,
      limit = 10,
      offset = 0,
      sort = 'updated',
    } = options;
    
    // Build where conditions
    const conditions = [eq(posts.author_id, userId)];
    
    if (!archived) {
      conditions.push(eq(posts.archived, false));
    }
    
    // Status filtering
    const now = new Date();
    if (status === 'published') {
      conditions.push(lte(posts.publish_at, now));
    } else if (status === 'scheduled') {
      conditions.push(sql`${posts.publish_at} > ${now}`);
    } else if (status === 'draft') {
      conditions.push(isNull(posts.publish_at));
    }
    
    // Category filtering (includes children)
    if (category) {
      const categoryNames = await this.getCategoryWithChildren(userId, category);
      conditions.push(inArray(posts.category, categoryNames));
    }
    
    if (project) {
      conditions.push(eq(posts.project_id, project));
    }
    
    // Base query
    let query = db.select().from(posts).where(and(...conditions));
    
    // Tag filtering requires join
    if (tag) {
      query = query.innerJoin(tags, and(
        eq(tags.post_id, posts.id),
        eq(tags.tag, tag)
      ));
    }
    
    // Sorting
    const orderBy = sort === 'created' ? desc(posts.created_at)
      : sort === 'published' ? desc(posts.publish_at)
      : desc(posts.updated_at);
    
    // Execute with pagination
    const [postRows, countResult] = await Promise.all([
      query.orderBy(orderBy).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(posts).where(and(...conditions)),
    ]);
    
    // Fetch content from Corpus for each post
    const postsWithContent = await Promise.all(
      postRows.map(async (row) => {
        const corpusPath = `posts/${userId}/${row.uuid}`;
        const content = await corpus.get(corpusPath, row.corpus_version);
        const postTags = await db.select().from(tags).where(eq(tags.post_id, row.id));
        return this.assemblePost(row, JSON.parse(content), postTags.map(t => t.tag));
      })
    );
    
    const total = countResult[0]?.count ?? 0;
    
    return {
      posts: postsWithContent,
      total_posts: total,
      total_pages: Math.ceil(total / limit),
      per_page: limit,
      current_page: Math.floor(offset / limit) + 1,
    };
  }

  async listVersions(userId: number, uuid: string): Promise<VersionInfo[]> {
    const { corpus } = this.deps;
    const corpusPath = `posts/${userId}/${uuid}`;
    return corpus.listVersions(corpusPath);
  }

  async getVersion(userId: number, uuid: string, versionHash: string): Promise<PostContent> {
    const { corpus } = this.deps;
    const corpusPath = `posts/${userId}/${uuid}`;
    const content = await corpus.get(corpusPath, versionHash);
    return JSON.parse(content);
  }

  async restoreVersion(userId: number, uuid: string, versionHash: string): Promise<Post> {
    const { db, corpus } = this.deps;
    const corpusPath = `posts/${userId}/${uuid}`;
    
    // Get content from old version
    const oldContent = await corpus.get(corpusPath, versionHash);
    
    // Create new version with old content (parent is current version)
    const existing = await db.select().from(posts)
      .where(and(eq(posts.uuid, uuid), eq(posts.author_id, userId)))
      .limit(1);
    
    if (!existing.length) throw new Error('Post not found');
    
    const newVersion = await corpus.put(corpusPath, oldContent, {
      parent: existing[0].corpus_version,
    });
    
    // Update D1 to point to new version
    await db.update(posts)
      .set({ corpus_version: newVersion.hash, updated_at: new Date() })
      .where(eq(posts.uuid, uuid));
    
    return this.getByUuid(userId, uuid);
  }

  private assemblePost(row: PostRow, content: PostContent, tagList: string[]): Post {
    return {
      id: row.id,
      uuid: row.uuid,
      author_id: row.author_id,
      slug: row.slug,
      title: content.title,
      content: content.content,
      description: content.description,
      format: content.format,
      category: row.category,
      tags: tagList,
      archived: row.archived,
      publish_at: row.publish_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      project_id: row.project_id,
      corpus_version: row.corpus_version,
    };
  }

  private async getCategoryWithChildren(userId: number, category: string): Promise<string[]> {
    const { db } = this.deps;
    const allCategories = await db.select().from(categories)
      .where(eq(categories.owner_id, userId));
    
    const result = [category];
    const findChildren = (parent: string) => {
      for (const cat of allCategories) {
        if (cat.parent === parent) {
          result.push(cat.name);
          findChildren(cat.name);
        }
      }
    };
    findChildren(category);
    
    return result;
  }
}
```

---

## 4. Frontend Architecture

### 4.1 Astro Page Structure

```
apps/website/src/pages/
├── index.astro                 # Home/dashboard
├── posts/
│   ├── index.astro            # Posts list with filters
│   ├── [slug].astro           # View/edit single post
│   ├── new.astro              # Create new post
│   └── [uuid]/
│       └── versions.astro     # Version history
├── categories/
│   └── index.astro            # Category management
├── tags/
│   └── index.astro            # Tag overview
├── settings/
│   ├── index.astro            # Settings layout redirect
│   ├── profile.astro
│   ├── tokens.astro
│   └── integrations.astro
└── login.astro                 # Login redirect to devpad
```

### 4.2 SolidJS Component Breakdown

```
apps/website/src/components/
├── ui/
│   ├── button.tsx
│   ├── input.tsx
│   ├── select.tsx
│   ├── modal.tsx
│   ├── loader.tsx
│   └── status-badge.tsx        # published/scheduled/draft badge
├── post/
│   ├── post-card.tsx          # Post grid item
│   ├── post-editor.tsx        # Content editor (textarea)
│   ├── post-metadata.tsx      # Metadata form (slug, category, etc.)
│   ├── post-preview.tsx       # Rendered markdown/asciidoc
│   ├── post-filters.tsx       # Search/sort/filter controls
│   ├── post-status.tsx        # Publish status selector
│   ├── version-list.tsx       # Version history list
│   ├── version-diff.tsx       # Compare versions (future)
│   └── tag-editor.tsx         # Tag input/management
├── category/
│   ├── category-tree.tsx      # Hierarchical tree view
│   ├── category-input.tsx     # Category dropdown selector
│   └── category-form.tsx      # Create/edit category
├── settings/
│   ├── token-row.tsx          # Single token row
│   ├── token-form.tsx         # Create/edit token
│   ├── integration-card.tsx   # Integration status card
│   └── devpad-linker.tsx      # DevPad API key input
└── layout/
    ├── sidebar.tsx            # Navigation sidebar
    ├── header.tsx             # Page header
    └── page-title.tsx         # Title + description
```

### 4.3 Post Status Component

```tsx
// apps/website/src/components/post/post-status.tsx
import { Component, createSignal } from 'solid-js';

interface PostStatusProps {
  publishAt: Date | null;
  onUpdate: (publishAt: Date | null) => void;
}

export const PostStatus: Component<PostStatusProps> = (props) => {
  const [mode, setMode] = createSignal<'draft' | 'now' | 'scheduled'>(
    props.publishAt === null ? 'draft'
    : props.publishAt <= new Date() ? 'now'
    : 'scheduled'
  );
  
  const [scheduledDate, setScheduledDate] = createSignal(
    props.publishAt?.toISOString().slice(0, 16) ?? ''
  );

  const handleModeChange = (newMode: 'draft' | 'now' | 'scheduled') => {
    setMode(newMode);
    if (newMode === 'draft') {
      props.onUpdate(null);
    } else if (newMode === 'now') {
      props.onUpdate(new Date());
    }
    // 'scheduled' waits for date input
  };

  const handleDateChange = (dateStr: string) => {
    setScheduledDate(dateStr);
    if (dateStr) {
      props.onUpdate(new Date(dateStr));
    }
  };

  return (
    <div class="post-status">
      <label>Status</label>
      <div class="status-options">
        <button
          class={mode() === 'draft' ? 'selected' : ''}
          onClick={() => handleModeChange('draft')}
        >
          Draft
        </button>
        <button
          class={mode() === 'now' ? 'selected' : ''}
          onClick={() => handleModeChange('now')}
        >
          Publish Now
        </button>
        <button
          class={mode() === 'scheduled' ? 'selected' : ''}
          onClick={() => handleModeChange('scheduled')}
        >
          Schedule
        </button>
      </div>
      
      {mode() === 'scheduled' && (
        <input
          type="datetime-local"
          value={scheduledDate()}
          onInput={(e) => handleDateChange(e.currentTarget.value)}
          min={new Date().toISOString().slice(0, 16)}
        />
      )}
      
      <StatusBadge publishAt={props.publishAt} />
    </div>
  );
};

const StatusBadge: Component<{ publishAt: Date | null }> = (props) => {
  const status = () => {
    if (props.publishAt === null) return 'draft';
    if (props.publishAt <= new Date()) return 'published';
    return 'scheduled';
  };
  
  const label = () => {
    if (status() === 'draft') return 'Draft';
    if (status() === 'published') return 'Published';
    return `Scheduled: ${props.publishAt?.toLocaleDateString()}`;
  };
  
  return (
    <span class={`status-badge status-${status()}`}>
      {label()}
    </span>
  );
};
```

### 4.4 CSS Design System

```css
/* apps/website/src/styles/global.css */

:root {
  /* devpad design tokens */
  --bg-primary: oklch(99% 0.02 290);
  --bg-secondary: oklch(97% 0.02 290);
  --bg-tertiary: oklch(95% 0.02 290);
  --text-primary: oklch(1% 0.02 290);
  --text-secondary: oklch(25% 0.02 290);
  --text-tertiary: oklch(35% 0.02 290);
  --text-muted: oklch(50% 0.03 290);
  --text-link: oklch(45.92% 0.0149 300.97);
  --input-background: oklch(96% 0.01 290);
  --input-border: oklch(91% 0.01 290);
  --input-focus: oklch(50% 0.15 290);
  
  /* Status colors */
  --status-draft: oklch(70% 0.1 60);
  --status-scheduled: oklch(70% 0.15 250);
  --status-published: oklch(70% 0.15 150);
  
  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  
  /* Border radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg-primary: oklch(10% 0.02 290);
    --bg-secondary: oklch(15% 0.02 290);
    --bg-tertiary: oklch(20% 0.02 290);
    --text-primary: oklch(95% 0.02 290);
    --text-secondary: oklch(75% 0.02 290);
    --text-tertiary: oklch(65% 0.02 290);
    --text-muted: oklch(50% 0.03 290);
    --input-background: oklch(15% 0.01 290);
    --input-border: oklch(25% 0.01 290);
  }
}

/* Typography - neue-haas-grotesk-text via Adobe Typekit */
@import url("https://use.typekit.net/XXXXXXX.css");

body {
  font-family: 'neue-haas-grotesk-text', system-ui, -apple-system, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.5;
}

/* Status badges */
.status-badge {
  display: inline-flex;
  align-items: center;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: 500;
}

.status-draft {
  background: color-mix(in oklch, var(--status-draft) 20%, transparent);
  color: var(--status-draft);
}

.status-scheduled {
  background: color-mix(in oklch, var(--status-scheduled) 20%, transparent);
  color: var(--status-scheduled);
}

.status-published {
  background: color-mix(in oklch, var(--status-published) 20%, transparent);
  color: var(--status-published);
}
```

---

## 5. Local Development Setup

### 5.1 Dev Server Configuration

```typescript
// scripts/dev-server.ts
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import * as schema from '../packages/schema/src/database';

// File-based Corpus backend for local dev
class FileCorpusBackend {
  constructor(private basePath: string) {}
  
  async put(path: string, content: string, options?: { parent?: string }) {
    const hash = Bun.hash(content).toString(16);
    const dir = `${this.basePath}/${path}`;
    await Bun.write(`${dir}/${hash}.json`, JSON.stringify({
      content,
      parent: options?.parent ?? null,
      created_at: new Date().toISOString(),
    }));
    return { hash };
  }
  
  async get(path: string, hash: string) {
    const file = Bun.file(`${this.basePath}/${path}/${hash}.json`);
    const data = await file.json();
    return data.content;
  }
  
  async listVersions(path: string) {
    const glob = new Bun.Glob('*.json');
    const versions = [];
    for await (const file of glob.scan(`${this.basePath}/${path}`)) {
      const hash = file.replace('.json', '');
      const data = await Bun.file(`${this.basePath}/${path}/${file}`).json();
      versions.push({
        hash,
        parent: data.parent,
        created_at: data.created_at,
      });
    }
    return versions.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }
}

// Initialize
const db = new Database('./local/sqlite.db');
const drizzleDb = drizzle(db, { schema });
const corpus = new FileCorpusBackend('./local/corpus');

// Mock user for local development
const DEV_USER = {
  id: 1,
  github_id: 12345,
  username: 'dev-user',
  email: 'dev@local.test',
  avatar_url: 'https://github.com/ghost.png',
};

// Create dev app with injected dependencies
const app = new Hono();

app.use('*', cors({
  origin: 'http://localhost:4321',
  credentials: true,
}));

// Inject dependencies and mock auth
app.use('*', async (c, next) => {
  c.set('db', drizzleDb);
  c.set('corpus', corpus);
  c.set('user', DEV_USER);
  return next();
});

// Import and mount routes
import mainApp from '../packages/server/src';
app.route('/', mainApp);

console.log('Dev server running on http://localhost:8080');

export default {
  port: 8080,
  fetch: app.fetch,
};
```

### 5.2 Database Setup & Seeding

```typescript
// scripts/seed.ts
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as schema from '../packages/schema/src/database';

const db = new Database('./local/sqlite.db');
const drizzleDb = drizzle(db, { schema });

// Run migrations
await migrate(drizzleDb, { migrationsFolder: './migrations' });

// Seed test user
await drizzleDb.insert(schema.users).values({
  github_id: 12345,
  username: 'dev-user',
  email: 'dev@local.test',
  avatar_url: 'https://github.com/ghost.png',
}).onConflictDoNothing();

// Seed default categories
const categoryData = [
  { name: 'root', parent: null },
  { name: 'coding', parent: 'root' },
  { name: 'devlog', parent: 'coding' },
  { name: 'gamedev', parent: 'coding' },
  { name: 'learning', parent: 'root' },
  { name: 'hobbies', parent: 'root' },
  { name: 'story', parent: 'root' },
];

for (const cat of categoryData) {
  await drizzleDb.insert(schema.categories).values({
    owner_id: 1,
    name: cat.name,
    parent: cat.parent,
  }).onConflictDoNothing();
}

console.log('Database seeded successfully');
```

### 5.3 Package.json Scripts

```json
{
  "scripts": {
    "dev": "concurrently \"bun run dev:server\" \"bun run dev:client\"",
    "dev:server": "bun --watch scripts/dev-server.ts",
    "dev:client": "cd apps/website && bun run dev",
    "db:setup": "bun scripts/seed.ts",
    "db:reset": "rm -rf local/sqlite.db local/corpus && bun scripts/seed.ts",
    "db:migrate": "drizzle-kit generate:sqlite && drizzle-kit push:sqlite",
    "test": "vitest",
    "test:coverage": "vitest --coverage",
    "build": "bun run build:server && bun run build:client",
    "build:server": "cd packages/server && bun run build",
    "build:client": "cd apps/website && bun run build",
    "deploy": "wrangler deploy"
  }
}
```

---

## 6. Testing Strategy

### 6.1 Test Infrastructure

```typescript
// packages/server/__tests__/setup.ts
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from '@blog/schema/database';

// In-memory Corpus for tests
class MemoryCorpusBackend {
  private store = new Map<string, Map<string, { content: string; parent: string | null; created_at: string }>>();
  
  async put(path: string, content: string, options?: { parent?: string }) {
    const hash = Bun.hash(content).toString(16);
    if (!this.store.has(path)) {
      this.store.set(path, new Map());
    }
    this.store.get(path)!.set(hash, {
      content,
      parent: options?.parent ?? null,
      created_at: new Date().toISOString(),
    });
    return { hash };
  }
  
  async get(path: string, hash: string) {
    return this.store.get(path)?.get(hash)?.content ?? null;
  }
  
  async listVersions(path: string) {
    const versions = this.store.get(path);
    if (!versions) return [];
    return Array.from(versions.entries())
      .map(([hash, data]) => ({ hash, ...data }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
  
  clear() {
    this.store.clear();
  }
}

export function createTestContext() {
  // In-memory SQLite
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });
  
  // Run schema creation
  sqlite.run(/* schema SQL from migrations */);
  
  // In-memory Corpus
  const corpus = new MemoryCorpusBackend();
  
  // Test user
  const user = {
    id: 1,
    github_id: 99999,
    username: 'test-user',
    email: 'test@test.local',
    avatar_url: '',
  };
  
  // Insert test user
  db.insert(schema.users).values(user).run();
  
  return { db, corpus, user };
}

// Mock providers
export class MockDevToProvider {
  private articles: any[] = [];
  
  setArticles(articles: any[]) {
    this.articles = articles;
  }
  
  async fetchArticles(token: string) {
    if (token === 'invalid') throw new Error('Invalid token');
    return this.articles;
  }
}

export class MockDevpadProvider {
  private projects: any[] = [];
  
  setProjects(projects: any[]) {
    this.projects = projects;
  }
  
  async fetchProjects(token: string) {
    if (token === 'invalid') throw new Error('Invalid token');
    return this.projects;
  }
}
```

### 6.2 Integration Tests

```typescript
// packages/server/__tests__/integration/posts.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestContext } from '../setup';
import { PostService } from '../../src/services/posts';

describe('PostService', () => {
  let ctx: ReturnType<typeof createTestContext>;
  let service: PostService;

  beforeEach(() => {
    ctx = createTestContext();
    service = new PostService({ db: ctx.db, corpus: ctx.corpus });
  });

  describe('create', () => {
    it('creates post with content in Corpus', async () => {
      const post = await service.create(ctx.user.id, {
        slug: 'test-post',
        title: 'Test Post',
        content: '# Hello World',
        format: 'md',
        category: 'root',
        tags: ['test'],
      });

      expect(post.uuid).toBeDefined();
      expect(post.slug).toBe('test-post');
      expect(post.title).toBe('Test Post');
      expect(post.corpus_version).toBeDefined();
      
      // Verify Corpus storage path
      const versions = await ctx.corpus.listVersions(`posts/${ctx.user.id}/${post.uuid}`);
      expect(versions).toHaveLength(1);
    });

    it('generates UUID that remains stable on slug change', async () => {
      const post = await service.create(ctx.user.id, {
        slug: 'original-slug',
        title: 'Test',
        content: 'Content',
        format: 'md',
        category: 'root',
      });

      const originalUuid = post.uuid;

      const updated = await service.update(ctx.user.id, post.uuid, {
        slug: 'new-slug',
      });

      expect(updated.uuid).toBe(originalUuid);
      expect(updated.slug).toBe('new-slug');
    });
  });

  describe('versioning', () => {
    it('creates new version on content edit', async () => {
      const post = await service.create(ctx.user.id, {
        slug: 'versioned',
        title: 'V1',
        content: 'Original',
        format: 'md',
        category: 'root',
      });
      const v1Hash = post.corpus_version;

      const updated = await service.update(ctx.user.id, post.uuid, {
        title: 'V2',
        content: 'Updated',
      });
      const v2Hash = updated.corpus_version;

      expect(v2Hash).not.toBe(v1Hash);

      const versions = await service.listVersions(ctx.user.id, post.uuid);
      expect(versions).toHaveLength(2);
      expect(versions[0].hash).toBe(v2Hash);
      expect(versions[0].parent).toBe(v1Hash);
    });

    it('restores to previous version', async () => {
      const post = await service.create(ctx.user.id, {
        slug: 'restore-test',
        title: 'Original Title',
        content: 'Original Content',
        format: 'md',
        category: 'root',
      });
      const v1Hash = post.corpus_version;

      await service.update(ctx.user.id, post.uuid, {
        title: 'Changed Title',
        content: 'Changed Content',
      });

      const restored = await service.restoreVersion(ctx.user.id, post.uuid, v1Hash);

      expect(restored.title).toBe('Original Title');
      expect(restored.content).toBe('Original Content');
      // Should be v3, not v1 (new version with old content)
      expect(restored.corpus_version).not.toBe(v1Hash);
    });
  });

  describe('publishing', () => {
    it('creates draft when publish_at is null', async () => {
      const post = await service.create(ctx.user.id, {
        slug: 'draft-post',
        title: 'Draft',
        content: 'Content',
        format: 'md',
        category: 'root',
        publish_at: null,
      });

      expect(post.publish_at).toBeNull();
      
      const drafts = await service.list(ctx.user.id, { status: 'draft' });
      expect(drafts.posts).toHaveLength(1);
    });

    it('creates published post when publish_at is past', async () => {
      const pastDate = new Date(Date.now() - 86400000); // Yesterday
      
      const post = await service.create(ctx.user.id, {
        slug: 'published-post',
        title: 'Published',
        content: 'Content',
        format: 'md',
        category: 'root',
        publish_at: pastDate,
      });

      const published = await service.list(ctx.user.id, { status: 'published' });
      expect(published.posts).toHaveLength(1);
    });

    it('creates scheduled post when publish_at is future', async () => {
      const futureDate = new Date(Date.now() + 86400000); // Tomorrow
      
      const post = await service.create(ctx.user.id, {
        slug: 'scheduled-post',
        title: 'Scheduled',
        content: 'Content',
        format: 'md',
        category: 'root',
        publish_at: futureDate,
      });

      const scheduled = await service.list(ctx.user.id, { status: 'scheduled' });
      expect(scheduled.posts).toHaveLength(1);
      
      const published = await service.list(ctx.user.id, { status: 'published' });
      expect(published.posts).toHaveLength(0);
    });
  });

  describe('filtering', () => {
    beforeEach(async () => {
      // Seed categories
      await ctx.db.insert(schema.categories).values([
        { owner_id: ctx.user.id, name: 'coding', parent: 'root' },
        { owner_id: ctx.user.id, name: 'devlog', parent: 'coding' },
      ]);

      // Seed posts
      await service.create(ctx.user.id, { slug: 'coding-post', category: 'coding', title: 'A', content: 'A', format: 'md' });
      await service.create(ctx.user.id, { slug: 'devlog-post', category: 'devlog', title: 'B', content: 'B', format: 'md' });
      await service.create(ctx.user.id, { slug: 'root-post', category: 'root', title: 'C', content: 'C', format: 'md' });
    });

    it('filters by category including children', async () => {
      const result = await service.list(ctx.user.id, { category: 'coding' });
      
      expect(result.posts).toHaveLength(2);
      expect(result.posts.map(p => p.slug)).toContain('coding-post');
      expect(result.posts.map(p => p.slug)).toContain('devlog-post');
    });

    it('filters by exact category when no children', async () => {
      const result = await service.list(ctx.user.id, { category: 'devlog' });
      
      expect(result.posts).toHaveLength(1);
      expect(result.posts[0].slug).toBe('devlog-post');
    });
  });
});
```

### 6.3 Unit Tests

```typescript
// packages/server/__tests__/unit/publishing.test.ts
import { describe, it, expect } from 'vitest';
import { isPublished, isScheduled, isDraft } from '@blog/schema/types';

describe('publishing helpers', () => {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000);
  const tomorrow = new Date(now.getTime() + 86400000);

  describe('isPublished', () => {
    it('returns true when publish_at is in the past', () => {
      expect(isPublished({ publish_at: yesterday })).toBe(true);
    });

    it('returns true when publish_at equals now', () => {
      expect(isPublished({ publish_at: now })).toBe(true);
    });

    it('returns false when publish_at is in the future', () => {
      expect(isPublished({ publish_at: tomorrow })).toBe(false);
    });

    it('returns false when publish_at is null', () => {
      expect(isPublished({ publish_at: null })).toBe(false);
    });
  });

  describe('isScheduled', () => {
    it('returns true when publish_at is in the future', () => {
      expect(isScheduled({ publish_at: tomorrow })).toBe(true);
    });

    it('returns false when publish_at is in the past', () => {
      expect(isScheduled({ publish_at: yesterday })).toBe(false);
    });

    it('returns false when publish_at is null', () => {
      expect(isScheduled({ publish_at: null })).toBe(false);
    });
  });

  describe('isDraft', () => {
    it('returns true when publish_at is null', () => {
      expect(isDraft({ publish_at: null })).toBe(true);
    });

    it('returns false when publish_at is set', () => {
      expect(isDraft({ publish_at: yesterday })).toBe(false);
      expect(isDraft({ publish_at: tomorrow })).toBe(false);
    });
  });
});
```

---

## 7. Implementation Tasks

### Task Breakdown

```
TOTAL ESTIMATED: ~3,400 LOC

PHASE 0: Foundation
├── T0.1: Project scaffolding & monorepo setup (~150 LOC)
│   ├── package.json files, tsconfig, workspace config
│   └── Directory structure
│
├── T0.2: Schema package - Drizzle + Zod types (~450 LOC)
│   ├── database.ts - D1 schema with UUID field
│   ├── types.ts - Zod schemas with publishing helpers
│   ├── corpus.ts - Corpus content schema
│   └── Depends: T0.1
│
└── T0.3: Test infrastructure setup (~250 LOC)
    ├── vitest.config.ts
    ├── In-memory Corpus backend
    ├── Test context factory
    └── Depends: T0.2

APPROVAL CHECKPOINT: Confirm schema design + Corpus path structure

PHASE 1: Core API
├── T1.1: Auth middleware + devpad verification (~200 LOC)
│   ├── middleware/auth.ts
│   ├── API token validation with hashing
│   └── Depends: T0.2
│
├── T1.2: Posts service + Corpus integration (~500 LOC)
│   ├── services/posts.ts - CRUD + versioning + publishing
│   ├── corpus/posts.ts - Corpus operations
│   ├── routes/posts.ts - Hono routes
│   └── Depends: T1.1
│
├── T1.3: Categories service (~200 LOC)
│   ├── services/categories.ts
│   ├── routes/categories.ts
│   └── Depends: T1.1 (parallel with T1.2)
│
├── T1.4: Tags + Tokens routes (~150 LOC)
│   ├── routes/tags.ts
│   ├── routes/tokens.ts (with hash storage)
│   └── Depends: T1.1 (parallel with T1.2, T1.3)
│
└── T1.5: Core integration tests (~350 LOC)
    ├── posts.test.ts (versioning, publishing, filtering)
    ├── categories.test.ts
    └── Depends: T1.2, T1.3

PHASE 2: Integrations & External Providers
├── T2.1: Provider interfaces + mocks (~200 LOC)
│   ├── providers/devto.ts
│   ├── providers/devpad.ts
│   └── Independent
│
├── T2.2: Integration service (~250 LOC)
│   ├── services/integrations.ts
│   ├── routes/integrations.ts
│   └── Depends: T2.1
│
├── T2.3: Projects service (~150 LOC)
│   ├── services/projects.ts
│   ├── routes/projects.ts
│   └── Depends: T2.1
│
└── T2.4: Integration tests for providers (~200 LOC)
    └── Depends: T2.2, T2.3

PHASE 3: Frontend
├── T3.1: Astro project setup + layouts (~150 LOC)
│   ├── astro.config.mjs
│   ├── layouts/
│   ├── styles/global.css (devpad design system)
│   └── Independent (can start early)
│
├── T3.2: UI component library (~300 LOC)
│   ├── components/ui/*
│   └── Depends: T3.1
│
├── T3.3: Posts pages + components (~450 LOC)
│   ├── pages/posts/*
│   ├── components/post/* (including version-list, post-status)
│   └── Depends: T3.2
│
├── T3.4: Settings pages + components (~250 LOC)
│   ├── pages/settings/*
│   ├── components/settings/*
│   └── Depends: T3.2 (parallel with T3.3)
│
└── T3.5: Categories + Tags pages (~150 LOC)
    └── Depends: T3.2 (parallel with T3.3, T3.4)

PHASE 4: Migration & Deployment
├── T4.1: Data migration script (~250 LOC)
│   ├── scripts/migrate-data.ts
│   ├── UUID generation for existing posts
│   ├── Content extraction to Corpus
│   └── Depends: Phase 1
│
├── T4.2: Wrangler + deployment config (~100 LOC)
│   ├── wrangler.toml
│   └── Depends: Phase 1
│
├── T4.3: CI/CD pipeline (~100 LOC)
│   ├── .github/workflows/test.yml
│   ├── .github/workflows/deploy.yml
│   └── Depends: T4.2
│
└── T4.4: Final integration testing (~150 LOC)
    └── Depends: All above
```

### Parallelization Map

```
Week 1:
  [T0.1] --> [T0.2] --> [T0.3]
                    └──> APPROVAL CHECKPOINT

Week 2 (after approval):
  [T1.1] ──┬──> [T1.2] ──┐
           ├──> [T1.3] ──┼──> [T1.5]
           └──> [T1.4] ──┘
  
  [T3.1] (parallel - can start early)

Week 3:
  [T2.1] ──┬──> [T2.2] ──> [T2.4]
           └──> [T2.3] ──┘
  
  [T3.2] ──┬──> [T3.3]
           ├──> [T3.4]
           └──> [T3.5]

Week 4:
  [T4.1] (depends on Phase 1)
  [T4.2] --> [T4.3]
  [T4.4] (final)
```

---

## 8. Monorepo Integration Plan

### 8.1 Package Naming (Future Merge)

**Current (standalone):**
- `@blog/schema`
- `@blog/server`
- `@blog/api`

**After merge into devpad:**
- `@devpad/blog-schema` (or merged into `@devpad/schema`)
- `@devpad/blog-server` (or route handlers merged into `@devpad/server`)
- App moves to `apps/blog`

### 8.2 Shared Packages to Reuse from devpad

- `@devpad/core/result` - Result<T, E> pattern
- Design system CSS tokens
- Auth utilities (if sharing session verification)

### 8.3 Breaking Changes to Handle

1. **User ID format**: If devpad uses UUID strings vs integers
   - Solution: Migration step to map IDs

2. **API namespace**: Blog endpoints may conflict
   - Solution: Mount under `/blog/` prefix in monorepo

3. **Corpus backend**: May need to share R2 bucket
   - Solution: Use path prefixes (`blog/posts/...` vs other data)

---

## 9. Key Design Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Corpus path** | `posts/<user>/<uuid>` | UUID is immutable; slug is mutable metadata |
| **Publishing** | `publish_at` date comparison | Simple, enables drafts + scheduling + immediate |
| **Slug storage** | D1 only, unique per user | Mutable, for SEO-friendly URLs |
| **Version storage** | Corpus with parent refs | Content-addressed, automatic history |
| **API tokens** | SHA-256 hashed | Security best practice |
| **Auth** | Delegate to devpad.tools | Single sign-on, no duplicate OAuth |

---

## 10. Open Questions for Review

1. **Corpus library integration**: Is there an existing Corpus TypeScript client, or do we implement the backend interface?

2. **Token encryption**: Should devpad_tokens use encryption (requires key management) or is hash sufficient since tokens are user-provided?

3. **Media uploads**: Defer to v2, or include basic image upload in v1?

4. **Public post viewing**: Should there be unauthenticated read access to published posts (for blog frontend)?
