# Authentication & Authorization System

This document covers the authentication and authorization system used in the dev-blog project. The system integrates with **Devpad** as the external identity provider and supports multiple authentication methods for different use cases.

## Table of Contents

1. [Overview](#overview)
2. [Authentication Flow with Devpad](#authentication-flow-with-devpad)
3. [Authentication Methods](#authentication-methods)
4. [Authorization in the API Layer](#authorization-in-the-api-layer)
5. [User Management](#user-management)
6. [Example Usages](#example-usages)
7. [Testing Authentication](#testing-authentication)

---

## Overview

The authentication system is built around these key concepts:

- **External Identity Provider**: Devpad handles user authentication (OAuth via GitHub)
- **Session Management**: JWT tokens stored in cookies for browser sessions
- **API Tokens**: Long-lived tokens for programmatic access
- **Multi-tenant**: Users are isolated; each user can only access their own data

### Architecture Diagram

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Browser   │───▶│   Astro     │───▶│   Hono API  │
│             │    │  Frontend   │    │   Server    │
└─────────────┘    └─────────────┘    └─────────────┘
       │                  │                  │
       │                  │                  ▼
       │                  │           ┌─────────────┐
       └──────────────────┴──────────▶│   Devpad    │
                                      │  (OAuth)    │
                                      └─────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `packages/server/src/middleware/auth.ts` | Main auth middleware |
| `packages/server/src/middleware/require-auth.ts` | `withAuth` helper for protected routes |
| `packages/server/src/routes/auth.ts` | Auth endpoints (login, logout, callback, status) |
| `packages/server/src/providers/devpad.ts` | Devpad API client for project fetching |
| `apps/website/src/pages/auth/*.astro` | Frontend auth pages |

---

## Authentication Flow with Devpad

### Complete Login Flow

```
1. User clicks "Login" → /auth/login
2. Redirects to Devpad OAuth → devpad.tools/api/auth/login
3. User authenticates with GitHub on Devpad
4. Devpad redirects back → /auth/callback?token=<jwt>
5. JWT stored in httpOnly cookie
6. User redirected to /posts (authenticated)
```

### Step 1: Login Initiation

When a user clicks login, they're redirected to Devpad's OAuth endpoint:

**Frontend (`apps/website/src/pages/auth/login.astro`):**

```typescript
---
const DEVPAD_API = import.meta.env.PUBLIC_DEVPAD_API ?? "https://devpad.tools";
const origin = Astro.url.origin;
const isPreview = !origin.includes("devpad.tools");

const params = new URLSearchParams({
  return_to: `${origin}/auth/callback`,
  ...(isPreview && { mode: "jwt" }),
});

return Astro.redirect(`${DEVPAD_API}/api/auth/login?${params}`);
---
```

**API Route (`packages/server/src/routes/auth.ts`):**

```typescript
authRouter.get("/login", c => {
  const ctx = c.get("appContext");
  const origin = new URL(c.req.url).origin;
  const isPreview = !origin.includes("devpad.tools");

  const params = new URLSearchParams({
    return_to: `${origin}/auth/callback`,
    ...(isPreview && { mode: "jwt" }),
  });

  return c.redirect(`${ctx.devpadApi}/api/auth/login?${params}`);
});
```

The `mode: "jwt"` parameter is used for preview/development environments where cookie-based auth doesn't work across domains.

### Step 2: OAuth Callback

After successful authentication, Devpad redirects back with a JWT token:

**Frontend Callback (`apps/website/src/pages/auth/callback.astro`):**

```typescript
---
const token = Astro.url.searchParams.get("token");

if (token) {
  // Set httpOnly cookie on the frontend domain for SSR requests
  Astro.cookies.set("devpad_jwt", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours
  });
}
---

<script define:vars={{ token }}>
  // Also store in localStorage for client-side requests
  if (token) {
    localStorage.setItem('devpad_jwt', token);
    window.location.href = '/posts';
  }
</script>
```

**API Callback (`packages/server/src/routes/auth.ts`):**

```typescript
authRouter.get("/callback", c => {
  const token = c.req.query("token");

  if (!token) {
    return c.json({ code: "INVALID_CALLBACK", message: "No token provided" }, 400);
  }

  setCookie(c, "devpad_jwt", token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return c.html(`<script>window.location.href = '/posts';</script>`);
});
```

### Step 3: Token Verification

On subsequent requests, the JWT is verified with Devpad:

```typescript
const verifyWithDevpadJWT = async (devpadApi: string, jwtToken: string): Promise<Result<DevpadUser, string>> => {
  const fetchResult = await try_catch_async(
    async () => {
      const response = await fetch(`${devpadApi}/api/auth/verify`, {
        method: "GET",
        headers: { Authorization: `Bearer jwt:${jwtToken}` },
      });
      if (!response.ok) throw new Error("jwt_invalid");
      return response.json();
    },
    () => "jwt_invalid"
  );

  return pipe(fetchResult)
    .flat_map((json: unknown) => {
      const parsed = DevpadVerifyResponseSchema.safeParse(json);
      if (!parsed.success) return err("invalid_user_response");
      if (!parsed.data.authenticated || !parsed.data.user) return err("not_authenticated");

      const devpadUser = parsed.data.user;
      return ok({
        github_id: devpadUser.github_id,
        username: devpadUser.name,
        email: devpadUser.email ?? null,
        avatar_url: devpadUser.image_url ?? null,
      });
    })
    .result();
};
```

### Logout Flow

**Frontend (`apps/website/src/pages/auth/logout.astro`):**

```html
<script>
  localStorage.removeItem('devpad_jwt');
  window.location.href = '/';
</script>
```

**API (`packages/server/src/routes/auth.ts`):**

```typescript
authRouter.get("/logout", c => {
  deleteCookie(c, "session");
  deleteCookie(c, "devpad_session");
  deleteCookie(c, "devpad_jwt");

  return c.html(`
    <script>
      document.cookie = 'session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      window.location.href = '/';
    </script>
  `);
});
```

---

## Authentication Methods

The auth middleware supports three authentication methods, checked in order:

### 1. API Token (Auth-Token Header)

For programmatic access (CI/CD, scripts, external integrations):

```bash
curl -H "Auth-Token: your-api-token" https://api.example.com/api/blog/posts
```

**Implementation:**

```typescript
const authToken = c.req.header("Auth-Token");
if (authToken) {
  const result = await validateApiToken(ctx.db, authToken);
  if (result.ok) {
    c.set("user", result.value);
    return next();
  }
}
```

API tokens are hashed with SHA-256 and stored in the `access_keys` table:

```typescript
const validateApiToken = async (db: DrizzleDB, token: string): Promise<Result<User, string>> => {
  const tokenHash = await hashToken(token);

  const [keyRow] = await db
    .select()
    .from(accessKeys)
    .where(and(eq(accessKeys.key_hash, tokenHash), eq(accessKeys.enabled, true)))
    .limit(1);

  if (!keyRow) return err("invalid_token");

  const [userRow] = await db.select().from(users).where(eq(users.id, keyRow.user_id)).limit(1);

  if (!userRow) return err("user_not_found");

  return ok(rowToUser(userRow));
};
```

### 2. JWT via Authorization Header

For API clients that have a JWT token:

```bash
curl -H "Authorization: Bearer jwt:eyJhbG..." https://api.example.com/api/blog/posts
```

**Implementation:**

```typescript
const authHeader = c.req.header("Authorization");
if (authHeader) {
  const jwtResult = extractJWTFromHeader(authHeader);
  if (jwtResult.ok) {
    const result = await authenticateWithJWT(ctx.db, ctx.devpadApi, jwtResult.value);
    if (result.ok) {
      c.set("user", result.value);
      c.set("jwtToken", jwtResult.value);
      return next();
    }
  }
}
```

**JWT Extraction:**

```typescript
const JWT_PREFIX = "Bearer jwt:";

export const extractJWTFromHeader = (authHeader: string): Result<string, string> => {
  if (!authHeader.startsWith(JWT_PREFIX)) return err("missing_jwt_prefix");
  const token = authHeader.slice(JWT_PREFIX.length);
  if (token.length === 0) return err("empty_jwt_token");
  return ok(token);
};
```

### 3. JWT via Cookie

For browser-based sessions (default for web app):

```typescript
const jwtCookie = getCookie(c, "devpad_jwt");
if (jwtCookie) {
  const result = await authenticateWithJWT(ctx.db, ctx.devpadApi, jwtCookie);
  if (result.ok) {
    c.set("user", result.value);
    c.set("jwtToken", jwtCookie);
    return next();
  }
}
```

---

## Authorization in the API Layer

### Path-Based Access Control

The middleware uses path matching to determine authentication requirements:

```typescript
const EXEMPT_PATHS = ["/health", "/auth/login", "/auth/logout", "/auth/callback"];
const OPTIONAL_AUTH_PATHS = ["/auth/status"];

export const isExemptPath = (path: string): boolean => 
  EXEMPT_PATHS.some(exempt => path === exempt || path.startsWith(`${exempt}/`));

export const isOptionalAuthPath = (path: string): boolean => 
  OPTIONAL_AUTH_PATHS.some(p => path === p || path.startsWith(`${p}/`));
```

| Path Type | Behavior |
|-----------|----------|
| Exempt paths | No authentication check performed |
| Optional auth paths | Auth checked but request proceeds if unauthenticated |
| All other paths | Authentication required (401 if not authenticated) |

### Middleware Application

The auth middleware is applied globally in the API app:

```typescript
// packages/server/src/index.ts
export const createApiApp = (env: Bindings) => {
  const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

  app.use("*", logger());

  // Context setup
  app.use("*", async (c, next) => {
    const ctx = createContextFromBindings(env);
    c.set("appContext", ctx);
    await next();
  });

  // Auth middleware - runs on all routes
  app.use("*", authMiddleware);

  // Route registration...
  app.route("/api/blog", blogRouter);
  app.route("/health", healthRouter);
  app.route("/auth", authRouter);

  return app;
};
```

### The `withAuth` Helper

For protected route handlers, use the `withAuth` wrapper:

```typescript
// packages/server/src/middleware/require-auth.ts
export const withAuth =
  <E extends BaseEnv, P extends string, I extends Input, T>(
    handler: AuthenticatedHandler<E, P, I, T>
  ) =>
  async (c: Context<E, P, I>): Promise<T | Response> => {
    const user = c.get("user");
    if (!user) {
      return c.json({ code: "UNAUTHORIZED", message: "Authentication required" }, 401);
    }
    return handler(c, user, c.get("appContext"));
  };
```

**Usage in routes:**

```typescript
postsRouter.get(
  "/",
  zValidator("query", PostListParamsSchema),
  withAuth(async (c, user, ctx) => {
    const params = valid<z.infer<typeof PostListParamsSchema>>(c, "query");
    const service = createPostService({ db: ctx.db, corpus: ctx.corpus });
    const result = await service.list(user.id, params);
    return handleResult(c, result);
  })
);
```

### User-Scoped Data Access

All service methods receive the `user.id` to scope queries:

```typescript
// Only returns posts belonging to the authenticated user
const result = await service.list(user.id, params);

// Creates a post with the authenticated user as author
const result = await service.create(user.id, input);
```

---

## User Management

### User Schema

```typescript
// packages/schema/src/tables.ts
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  github_id: integer("github_id").notNull().unique(),
  username: text("username").notNull(),
  email: text("email"),
  avatar_url: text("avatar_url"),
  created_at: integer("created_at", { mode: "timestamp" }).notNull(),
  updated_at: integer("updated_at", { mode: "timestamp" }).notNull(),
});
```

### User Type

```typescript
// packages/schema/src/types.ts
export const UserSchema = createSelectSchema(users);
export type User = z.infer<typeof UserSchema>;

// User type includes:
// - id: number
// - github_id: number
// - username: string
// - email: string | null
// - avatar_url: string | null
// - created_at: Date
// - updated_at: Date
```

### Automatic User Creation/Update

When a user authenticates via Devpad, their profile is automatically created or updated:

```typescript
const ensureUser = async (db: DrizzleDB, devpadUser: DevpadUser): Promise<Result<User, string>> => {
  const now = new Date();

  await db
    .insert(users)
    .values({
      github_id: devpadUser.github_id,
      username: devpadUser.username,
      email: devpadUser.email,
      avatar_url: devpadUser.avatar_url,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: users.github_id,
      set: {
        username: devpadUser.username,
        email: devpadUser.email,
        avatar_url: devpadUser.avatar_url,
        updated_at: now,
      },
    });

  const [userRow] = await db.select().from(users)
    .where(eq(users.github_id, devpadUser.github_id)).limit(1);

  if (!userRow) return err("upsert_failed");

  return ok(rowToUser(userRow));
};
```

---

## Example Usages

### Getting the Current User ID

In a route handler with `withAuth`:

```typescript
postsRouter.post(
  "/",
  zValidator("json", PostCreateSchema),
  withAuth(async (c, user, ctx) => {
    // user.id is the authenticated user's database ID
    const result = await service.create(user.id, input);
    return handleResult(c, result, 201);
  })
);
```

### Checking Authentication Status

**API Endpoint:**

```typescript
authRouter.get("/status", c => {
  const user = c.get("user");

  return c.json({
    authenticated: !!user,
    user: user ?? null,
  });
});
```

**Client-side usage:**

```typescript
const response = await fetch('/auth/status', { credentials: 'same-origin' });
const { authenticated, user } = await response.json();

if (authenticated) {
  console.log(`Logged in as ${user.username}`);
}
```

### Protecting Routes

**Method 1: Using `withAuth` wrapper (recommended):**

```typescript
import { withAuth } from "../middleware/require-auth";

router.get(
  "/protected-resource",
  withAuth(async (c, user, ctx) => {
    // This only runs if user is authenticated
    return c.json({ userId: user.id });
  })
);
```

**Method 2: Manual check:**

```typescript
router.get("/protected-resource", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ code: "UNAUTHORIZED", message: "Authentication required" }, 401);
  }
  return c.json({ userId: user.id });
});
```

### Accessing User Context in Components

**Astro component with SSR auth check:**

```typescript
---
// Check auth status via SSR
const response = await api.ssr('/auth/status', Astro.request, {}, Astro.locals);
const { authenticated, user } = await response.json();
---

<AuthStatus initialUser={user} initialAuthenticated={authenticated} />
```

**SolidJS component (`apps/website/src/components/layout/auth-status.tsx`):**

```tsx
import { Show, createSignal } from "solid-js";

interface Props {
  initialUser?: User | null;
  initialAuthenticated?: boolean;
}

const AuthStatus = (props: Props) => {
  const [user] = createSignal<User | null>(props.initialUser ?? null);

  return (
    <div class="user-info">
      <Show
        when={user()}
        fallback={<a href="/auth/login" class="auth-btn login-btn">Login</a>}
      >
        {u => (
          <>
            <span class="username">{u().username}</span>
            <a href="/auth/logout" class="auth-btn logout-btn">Logout</a>
          </>
        )}
      </Show>
    </div>
  );
};
```

### Making Authenticated API Calls

**From the frontend (`apps/website/src/lib/api.ts`):**

```typescript
export const api = {
  async fetch(path: string, options: RequestInit = {}): Promise<Response> {
    return fetch(path, {
      ...options,
      credentials: "same-origin", // Includes cookies automatically
    });
  },

  async json<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await this.fetch(path, options);
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.message || `Request failed: ${res.status}`);
    }
    return res.json();
  },

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.json<T>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },
};

// Usage:
const posts = await api.json('/api/blog/posts');
const newPost = await api.post('/api/blog/posts', { title: 'Hello', content: '...' });
```

### Using API Tokens for Programmatic Access

**Creating an API token (via the API):**

```bash
curl -X POST https://api.example.com/api/blog/tokens \
  -H "Cookie: devpad_jwt=..." \
  -H "Content-Type: application/json" \
  -d '{"name": "CI/CD Token"}'
```

**Using the token:**

```bash
curl https://api.example.com/api/blog/posts \
  -H "Auth-Token: your-generated-token"
```

---

## Testing Authentication

### Test Setup

The test infrastructure provides helpers for creating authenticated test contexts:

```typescript
// packages/server/__tests__/setup.ts
export const createTestContext = (): TestContext => {
  const sqliteDb = new Database(":memory:");
  applyMigrations(sqliteDb);
  
  const bunDb = drizzle(sqliteDb, { schema });
  const db = bunDb as unknown as DrizzleDB;
  const corpus = createTestCorpus();

  return {
    sqliteDb,
    db,
    corpus,
    ctx: createAppContext(db, corpus),
    reset: () => { /* clear tables */ },
    close: () => sqliteDb.close(),
  };
};
```

### Creating Test Users

```typescript
export const createTestUser = async (
  ctx: TestContext,
  overrides: Partial<{ github_id: number; username: string; email: string }> = {}
): Promise<TestUser> => {
  const now = new Date();
  const githubId = overrides.github_id ?? 12345 + Math.floor(Math.random() * 100000);
  const username = overrides.username ?? `testuser-${githubId}`;

  const [user] = await ctx.db
    .insert(schema.users)
    .values({
      github_id: githubId,
      username,
      email: overrides.email ?? `${username}@example.com`,
      avatar_url: "https://github.com/ghost.png",
      created_at: now,
      updated_at: now,
    })
    .returning();

  return user;
};
```

### Creating Test Tokens

```typescript
export const createTestToken = async (
  ctx: TestContext,
  userId: number,
  name: string,
  keyHash: string,
  enabled = true
) => {
  const [token] = await ctx.db
    .insert(schema.accessKeys)
    .values({
      user_id: userId,
      key_hash: keyHash,
      name,
      enabled,
      created_at: new Date(),
    })
    .returning();

  return token;
};

// Usage:
const plainToken = "test-api-token-123";
const keyHash = await hashToken(plainToken);
await createTestToken(ctx, user.id, "test-token", keyHash);
```

### Mocking Devpad Verification

```typescript
export const createMockDevpadVerifyFetch = (config: MockDevpadVerifyConfig) => {
  return async (url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const urlStr = typeof url === "string" ? url : url.url;

    if (urlStr.includes("/api/auth/verify")) {
      if (!config.authenticated || !config.user) {
        return new Response(JSON.stringify({ authenticated: false, user: null }));
      }

      return new Response(JSON.stringify({
        authenticated: true,
        user: {
          id: `user-${config.user.github_id}`,
          name: config.user.username,
          email: config.user.email,
          github_id: config.user.github_id,
          image_url: config.user.avatar_url,
        },
      }));
    }

    return new Response("Not found", { status: 404 });
  };
};

// Usage in tests:
globalThis.fetch = mockFetchWithPreconnect(
  createMockDevpadVerifyFetch({
    authenticated: true,
    user: { github_id: 99999, username: "jwtuser", email: "jwt@example.com", avatar_url: null }
  })
);
```

### Creating Authenticated Test Apps

```typescript
// For routes that need authentication
export const createAuthenticatedTestApp = (
  ctx: TestContext,
  router: Hono,
  basePath: string,
  userId: number
) => {
  const app = new Hono();

  app.use("*", async (c, next) => {
    c.set("appContext", ctx.ctx);
    c.set("user", { id: userId });
    await next();
  });

  app.route(basePath, router);
  return app;
};

// Usage:
const user = await createTestUser(ctx);
const app = createAuthenticatedTestApp(ctx, postsRouter, "/posts", user.id);
const res = await app.request("/posts");
```

### Example Integration Test

```typescript
describe("Auth Middleware Integration", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  afterEach(() => {
    ctx.close();
  });

  it("authenticates with valid enabled token", async () => {
    const user = await createTestUser(ctx);
    const plainToken = "valid-token-abc123";
    const keyHash = await hashToken(plainToken);
    await createTestToken(ctx, user.id, "my-token", keyHash);

    const app = createTestApp(ctx, devpadApi);
    const res = await app.request("/api/protected", {
      headers: { "Auth-Token": plainToken },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user_id).toBe(user.id);
  });

  it("rejects disabled token", async () => {
    const user = await createTestUser(ctx);
    const plainToken = "disabled-token-123";
    await createTestToken(ctx, user.id, "disabled", await hashToken(plainToken), false);

    const app = createTestApp(ctx, devpadApi);
    const res = await app.request("/api/protected", {
      headers: { "Auth-Token": plainToken },
    });

    expect(res.status).toBe(401);
  });
});
```

---

## Security Considerations

1. **Token Hashing**: API tokens are stored as SHA-256 hashes, never in plain text
2. **httpOnly Cookies**: JWT cookies are httpOnly to prevent XSS attacks
3. **Secure Cookies**: Cookies are marked `secure` for HTTPS-only transmission
4. **SameSite**: Cookies use `Lax` SameSite to prevent CSRF
5. **Token Expiry**: JWTs have a 7-day expiry (API), 24-hour (frontend cookie)
6. **Disabled Tokens**: API tokens can be disabled without deletion

---

## Devpad Response Schema

The auth middleware expects this response format from Devpad's `/api/auth/verify` endpoint:

```typescript
const DevpadVerifyResponseSchema = z.object({
  authenticated: z.boolean(),
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().nullable().optional(),
    github_id: z.number(),
    image_url: z.string().nullable().optional(),
    task_view: z.string().optional(),
  }).nullable(),
});
```

---

## Troubleshooting

### Common Issues

1. **401 on all requests**: Check that `devpad_jwt` cookie is being set correctly
2. **User not created**: Verify Devpad is returning `authenticated: true` and a valid user object
3. **API token not working**: Ensure the token is enabled and the hash matches
4. **Cross-origin issues**: Preview deployments need `mode: "jwt"` parameter for login

### Debug Logging

The context creation logs useful debug info:

```typescript
console.log(`[CONTEXT] Creating context. DEVPAD_API=${env.DEVPAD_API} ENV=${env.ENVIRONMENT}`);
```
