# SSR Architecture and Solid Integration in dev-blog

This document provides an exhaustive reference for understanding Server-Side Rendering (SSR) in this project, including how Astro and Solid components interact, data fetching patterns, authentication handling, and best practices.

## Table of Contents

1. [Overview](#overview)
2. [Astro Configuration](#astro-configuration)
3. [Solid Integration](#solid-integration)
4. [Component Patterns](#component-patterns)
5. [API Layer](#api-layer)
6. [Data Fetching Patterns](#data-fetching-patterns)
7. [Auth and Middleware](#auth-and-middleware)
8. [Best Practices](#best-practices)
9. [Common Pitfalls](#common-pitfalls)

---

## Overview

This project implements a full SSR architecture using:

- **Astro 5.1** - The meta-framework handling SSR, routing, and page generation
- **Solid.js 1.9** - For interactive UI components with selective hydration
- **Cloudflare Workers** - As the deployment target with D1 database and R2 storage
- **Hono** - The API server framework running alongside Astro

### Architecture Diagram

```
                     Cloudflare Worker
                           |
              +------------+------------+
              |                         |
         Unified Router                 |
      (packages/server/worker.ts)       |
              |                         |
    +---------+---------+               |
    |                   |               |
  Hono API         Astro SSR            |
 /api/*, /auth/*   Everything else      |
    |                   |               |
    +-------------------+               |
              |                         |
        D1 Database              R2 Bucket (Corpus)
```

The key architectural insight is that **both the API (Hono) and the SSR frontend (Astro) run as a unified Cloudflare Worker**. The unified router in `worker.ts` directs requests to either Hono or Astro based on the URL path.

---

## Astro Configuration

### Core Configuration (`apps/website/astro.config.mjs`)

```javascript
import { resolve } from "node:path";
import cloudflare from "@astrojs/cloudflare";
import solidJs from "@astrojs/solid-js";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [solidJs()],
  adapter: cloudflare({
    mode: "advanced",
    imageService: "passthrough",
    platformProxy: {
      enabled: true,
    },
  }),
  output: "server",
  vite: {
    resolve: {
      alias: {
        "@blog/schema": resolve("../../packages/schema/src/index.ts"),
      },
    },
  },
});
```

### Key Configuration Points

| Setting | Value | Purpose |
|---------|-------|---------|
| `output` | `"server"` | Enables SSR mode - all pages are server-rendered by default |
| `adapter` | `cloudflare` | Configures Cloudflare Workers as the deployment target |
| `mode` | `"advanced"` | Enables advanced worker features including custom routing |
| `platformProxy.enabled` | `true` | Enables local dev proxy to simulate Cloudflare bindings |
| `integrations` | `[solidJs()]` | Enables Solid components with client-side hydration |

### Type Definitions (`apps/website/src/env.d.ts`)

The project defines custom types for the Cloudflare runtime environment:

```typescript
/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

type ApiHandler = {
  fetch: (request: Request) => Promise<Response>;
};

type RuntimeEnv = {
  API_HANDLER?: ApiHandler;
  ASSETS: { fetch: (req: Request | string) => Promise<Response> };
  DB: D1Database;
  CORPUS_BUCKET: R2Bucket;
  ENVIRONMENT: string;
  DEVPAD_API: string;
  [key: string]: unknown;
};

declare namespace App {
  interface Locals {
    runtime: {
      env: RuntimeEnv;
      cf: CfProperties;
      ctx: ExecutionContext;
      caches: CacheStorage;
    };
  }
}
```

**Critical:** The `API_HANDLER` binding is injected by the unified worker and allows Astro pages to make internal API calls without HTTP overhead.

---

## Solid Integration

### How Solid Works with Astro SSR

Astro uses an "Islands Architecture" where:
1. Astro components render on the server as static HTML
2. Solid components can render on the server AND hydrate on the client
3. Client directives (`client:*`) control when/how hydration occurs

### Client Directives Used in This Project

The project uses the following client directives:

#### `client:load`

Components hydrate immediately when the page loads. Used for interactive components that need to be usable right away.

**Example from `app-layout.astro`:**
```astro
<AuthStatus client:load initialUser={authUser} initialAuthenticated={authAuthenticated} />
```

**Example from `posts/new.astro`:**
```astro
<PostEditor client:load categories={categories} projects={projects} />
```

**Example from `categories/index.astro`:**
```astro
<CategoriesPage client:load initialCategories={categories} />
```

**Example from `settings/index.astro`:**
```astro
<SettingsPage client:load initialUser={user} initialTokens={tokens} />
```

#### No Client Directive (Static)

If no `client:*` directive is used, the component renders on the server but does NOT hydrate on the client. The HTML is static.

**This project does not use any non-hydrated Solid components** - all Solid components use `client:load` because they require interactivity.

### SSR-Safe Solid Code Patterns

#### Pattern 1: Using `isServer` to Guard Browser APIs

The `Modal` component demonstrates checking for server context:

```typescript
// apps/website/src/components/ui/modal.tsx
import { Portal, isServer } from "solid-js/web";

createEffect(() => {
  if (isServer) return;  // Guard against SSR
  if (props.isOpen) {
    document.addEventListener("keydown", handleKeydown);
    onCleanup(() => {
      document.removeEventListener("keydown", handleKeydown);
    });
  }
});
```

#### Pattern 2: Checking `typeof window`

The `CategoriesPage` component guards against SSR data fetching:

```typescript
// apps/website/src/components/category/categories-page.tsx
const fetchCategories = async (): Promise<Category[]> => {
  if (typeof window === "undefined") {
    return [];  // Don't fetch during SSR - use initial data instead
  }
  const data = await api.json<{ categories?: CategoryNode[] }>("/api/blog/categories");
  return flattenTree(data.categories ?? []);
};
```

#### Pattern 3: Initial Data Props with Lazy Fetch

Components receive SSR-fetched data as props, then optionally refetch on client:

```typescript
// apps/website/src/components/category/categories-page.tsx
interface Props {
  initialCategories?: Category[];
}

const CategoriesPage: Component<Props> = props => {
  const [fetchTrigger, setFetchTrigger] = createSignal(0);
  const [categories, { refetch }] = createResource(
    () => {
      const trigger = fetchTrigger();
      // Skip initial fetch if we have SSR data, but always fetch on trigger > 0
      if (trigger === 0 && props.initialCategories && props.initialCategories.length > 0) {
        return null;  // Returning null skips the fetch
      }
      return trigger;
    },
    fetchCategories,
    { initialValue: props.initialCategories ?? [] }
  );
  // ...
};
```

This pattern:
1. Uses SSR-provided `initialCategories` on first render
2. Avoids network request during hydration
3. Allows explicit refetch via `setFetchTrigger(n => n + 1)`

---

## Component Patterns

### Pattern 1: SSR Data Props with Client Interactivity

**Used in:** `SettingsPage`, `CategoriesPage`, `PostEditor`, `ProjectSelector`

Server fetches data during SSR, passes to component, component manages local state:

```astro
---
// pages/settings/index.astro
let user: User | null = null;
let tokens: Token[] = [];

try {
  const runtime = Astro.locals.runtime;
  const [userRes, tokensRes] = await Promise.all([
    api.ssr("/auth/status", Astro.request, {}, runtime),
    api.ssr("/api/blog/tokens", Astro.request, {}, runtime)
  ]);

  if (userRes.ok) {
    const data = await userRes.json();
    if (data.authenticated) {
      user = data.user;
    }
  }

  if (tokensRes.ok) {
    const data = await tokensRes.json();
    tokens = data.tokens ?? [];
  }
} catch (e) {
  // Settings fetch failed silently
}
---

<SettingsPage client:load initialUser={user} initialTokens={tokens} />
```

```typescript
// components/settings/settings-page.tsx
interface SettingsPageProps {
  initialUser?: User | null;
  initialTokens?: Token[];
}

const SettingsPage: Component<SettingsPageProps> = props => {
  const [user] = createSignal<User | null>(props.initialUser ?? null);
  const [tokens, setTokens] = createSignal<Token[]>(props.initialTokens ?? []);
  // Component manages updates independently
};
```

### Pattern 2: Server-Only Data Rendering

**Used in:** `posts/index.astro`, Landing page

For data that doesn't need client-side updates, render entirely in Astro:

```astro
---
// pages/posts/index.astro
let posts: Post[] = [];
let projectMap: Record<string, string> = {};
let error: string | null = null;

try {
  const runtime = Astro.locals.runtime;
  const [postsRes, projectsRes] = await Promise.all([
    api.ssr("/api/blog/posts?limit=100", Astro.request, {}, runtime),
    api.ssr("/api/blog/projects", Astro.request, {}, runtime)
  ]);

  if (!postsRes.ok) {
    throw new Error("Failed to fetch posts");
  }
  const postsData = (await postsRes.json()) as { posts?: Post[] };
  posts = postsData.posts ?? [];
  // ...
} catch (err) {
  error = "Failed to load posts";
}
---

<!-- Pure Astro template, no Solid component needed -->
<div class="posts-grid">
  {posts.map((post) => (
    <div class="post-card">
      <a href={`/posts/${post.slug}`} class="post-card__link">
        <span class="post-card__title">{post.title}</span>
      </a>
    </div>
  ))}
</div>
```

### Pattern 3: Page-Level Script Coordination

**Used in:** `posts/[slug].astro` (Edit Post page)

When Astro pages need to coordinate with Solid components:

```astro
---
// pages/posts/[slug].astro
---

<div id="editor-container" data-uuid={post.uuid}>
  <PostEditor client:load post={post} categories={categories} projects={projects} onFormReady={() => {}} />
</div>

<script is:inline define:vars={{ API_BASE: api.blog("") }}>
  // Define postEditorReady BEFORE DOMContentLoaded to avoid race condition
  var postEditorState = {
    getFormData: null,
    saveBtn: null,
    uuid: null
  };

  window.postEditorReady = function(getFormData) {
    postEditorState.getFormData = getFormData;
    if (postEditorState.saveBtn) {
      postEditorState.saveBtn.disabled = false;
    }
  };
</script>
```

```typescript
// components/post/post-editor.tsx
onMount(async () => {
  // Notify parent that form is ready (for external save button)
  if (props.onFormReady) {
    props.onFormReady(getFormData);
  }
  
  // Also check for window global for Astro page coordination
  const win = window as Window & { postEditorReady?: (fn: typeof getFormData) => void };
  if (win.postEditorReady) {
    win.postEditorReady(getFormData);
  }
});
```

### Pattern 4: Pure UI Components (No SSR Considerations)

**Used in:** `Button`, `Input`, `Select`, `Textarea`, `TagEditor`

Simple, presentational components with no browser APIs:

```typescript
// components/ui/button.tsx
const Button: ParentComponent<ButtonProps> = props => {
  const [local, rest] = splitProps(props, ["variant", "type", "disabled", "onClick", "class", "children"]);
  
  return (
    <button {...rest} type={buttonType()} disabled={local.disabled} onClick={local.onClick} class={classes()}>
      {local.children}
    </button>
  );
};
```

These render identically on server and client.

---

## API Layer

### API Client Structure (`apps/website/src/lib/api.ts`)

The API client provides two distinct modes of operation:

#### Client-Side Fetching

Used by Solid components after hydration:

```typescript
export const api = {
  blog: (path: string) => `/api/blog${path ? (path.startsWith("/") ? path : `/${path}`) : ""}`,
  
  auth: (path: string) => `/auth${path.startsWith("/") ? path : `/${path}`}`,

  async fetch(path: string, options: RequestInit = {}): Promise<Response> {
    return fetch(path, {
      ...options,
      credentials: "same-origin",  // Include cookies for auth
    });
  },

  async json<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await this.fetch(path, options);
    if (!res.ok) {
      const errorData = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(errorData.message || `Request failed: ${res.status}`);
    }
    return res.json() as Promise<T>;
  },

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.json<T>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.json<T>(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  async delete(path: string): Promise<void> {
    const res = await this.fetch(path, { method: "DELETE" });
    if (!res.ok) {
      const errorData = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(errorData.message || `Delete failed: ${res.status}`);
    }
  },
};
```

#### Server-Side Rendering Fetching

The `api.ssr()` method handles SSR requests with internal routing optimization:

```typescript
/**
 * Make an SSR request to the API.
 * If running in the unified worker, uses direct internal call.
 * Otherwise falls back to HTTP fetch.
 */
async ssr(
  path: string, 
  request: Request, 
  options: RequestInit = {}, 
  runtime?: { env?: RuntimeEnv }
): Promise<Response> {
  const url = new URL(path, request.url);
  const cookie = request.headers.get("cookie") ?? "";

  // If we have access to the internal API handler, use it directly
  const apiHandler = runtime?.env?.API_HANDLER;
  if (apiHandler) {
    const internalRequest = new Request(url.toString(), {
      ...options,
      headers: {
        ...options.headers,
        Cookie: cookie,  // Forward cookies for auth
      },
    });
    return apiHandler.fetch(internalRequest);
  }

  // Fallback to HTTP fetch (for local dev or non-unified deployments)
  return fetch(url.toString(), {
    ...options,
    headers: {
      ...options.headers,
      Cookie: cookie,
    },
  });
}
```

**Key Points:**
1. `API_HANDLER` is injected by the unified worker (see below)
2. Internal calls bypass HTTP stack for better performance
3. Cookies are always forwarded to maintain authentication context
4. Falls back to HTTP fetch for local development

#### Result-Based API Methods

For safer error handling without exceptions:

```typescript
/** Result-based fetch that returns errors as values instead of throwing */
async fetchResult<T>(path: string, options?: RequestInit): Promise<Result<T, ApiError>> {
  return try_catch_async(
    async () => {
      const res = await this.fetch(path, options);
      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({}))) as { message?: string };
        throw { status: res.status, message: errorData.message || `Request failed: ${res.status}` };
      }
      return res.json() as Promise<T>;
    },
    (e): ApiError => {
      if (typeof e === "object" && e !== null && "status" in e) {
        return e as ApiError;
      }
      return { status: 0, message: e instanceof Error ? e.message : "Network error" };
    }
  );
}
```

### Unified Worker (`packages/server/src/worker.ts`)

The unified worker routes requests between Hono API and Astro SSR:

```typescript
import type { Bindings } from "@blog/schema";
import { createApiApp } from "./index";

type AstroHandler = {
  fetch: (request: Request, env: Bindings & { API_HANDLER?: ApiHandler }, ctx: ExecutionContext) => Promise<Response>;
};

type ApiHandler = {
  fetch: (request: Request) => Promise<Response>;
};

// API route prefixes that should be handled by Hono
const API_PREFIXES = ["/api/", "/health", "/auth/"];

export const createUnifiedApp = (env: Bindings, astroHandler: AstroHandler) => {
  const apiApp = createApiApp(env);

  // Create API handler that Astro can use for internal requests
  const apiHandler: ApiHandler = {
    fetch: async (request: Request) => apiApp.fetch(request, env, {} as ExecutionContext),
  };

  return {
    async fetch(request: Request, _env: Bindings, ctx: ExecutionContext): Promise<Response> {
      const url = new URL(request.url);
      const path = url.pathname;

      // Route API paths to Hono
      if (API_PREFIXES.some(prefix => path.startsWith(prefix) || path === prefix.replace(/\/$/, ""))) {
        return apiApp.fetch(request, env, ctx);
      }

      // Pass API handler to Astro via env so it can make internal requests
      const envWithApi = { ...env, API_HANDLER: apiHandler };

      // Everything else goes to Astro SSR
      return astroHandler.fetch(request, envWithApi, ctx);
    },
  };
};
```

**Key Insight:** The `API_HANDLER` is passed to Astro through the environment, allowing `api.ssr()` to call the API directly without HTTP overhead.

---

## Data Fetching Patterns

### Pattern 1: Parallel SSR Fetching

**Best for:** Pages needing multiple data sources

```astro
---
// pages/posts/[slug].astro
const runtime = Astro.locals.runtime;

const [postRes, catRes, projRes] = await Promise.all([
  api.ssr(`/api/blog/posts/${slug}`, Astro.request, {}, runtime),
  api.ssr("/api/blog/categories", Astro.request, {}, runtime),
  api.ssr("/api/blog/projects", Astro.request, {}, runtime),
]);

if (postRes.ok) {
  post = await postRes.json();
}

if (catRes.ok) {
  const catData = await catRes.json();
  categories = flattenTree(catData.categories ?? []);
}

if (projRes.ok) {
  const projData = await projRes.json();
  projects = projData.projects ?? [];
}
---
```

### Pattern 2: Sequential SSR Fetching with Dependencies

**Best for:** When later fetches depend on earlier results

```astro
---
// pages/posts/[uuid]/versions.astro
const runtime = Astro.locals.runtime;

// First fetch: get versions
const versionsRes = await api.ssr(`/api/blog/posts/${uuid}/versions`, Astro.request, {}, runtime);

if (versionsRes.ok) {
  const data = await versionsRes.json();
  versions = data.versions ?? [];
}

// Second fetch: only if we have versions, get post details
if (versions.length > 0) {
  const postsRes = await api.ssr("/api/blog/posts?limit=100", Astro.request, {}, runtime);
  if (postsRes.ok) {
    const postsData = await postsRes.json();
    const post = postsData.posts?.find((p) => p.uuid === uuid);
    if (post) {
      postInfo = { slug: post.slug, corpus_version: post.corpus_version };
    }
  }
}
---
```

### Pattern 3: Client-Side Lazy Fetching

**Best for:** Data that's expensive or infrequently needed

```typescript
// components/post/project-selector.tsx
const fetchProjects = async (): Promise<Project[]> => {
  const response = await api.fetch("/api/blog/projects");
  if (!response.ok) return [];
  const data: { projects?: Project[] } = await response.json();
  return data.projects ?? [];
};

export const ProjectSelector = (props: ProjectSelectorProps) => {
  const [fetchTrigger, setFetchTrigger] = createSignal(0);

  const [projects] = createResource(
    () => {
      const trigger = fetchTrigger();
      // Skip initial fetch if we have SSR data
      if (trigger === 0 && props.initialProjects && props.initialProjects.length > 0) {
        return null;
      }
      return trigger;
    },
    fetchProjects,
    { initialValue: props.initialProjects ?? [] }
  );

  const handleRefresh = async () => {
    await api.fetch("/api/blog/projects/refresh", { method: "POST" });
    setFetchTrigger(n => n + 1);  // Trigger refetch
  };
};
```

---

## Auth and Middleware

### Authentication Flow

The project uses DevPad OAuth for authentication with JWT tokens:

```
1. User clicks "Login" -> Redirect to DevPad OAuth
2. DevPad authenticates -> Redirects back with JWT token
3. Callback page sets httpOnly cookie + localStorage
4. Subsequent requests include cookie for SSR auth
```

### Auth Callback (`pages/auth/callback.astro`)

```astro
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

**Dual Storage:**
- `httpOnly` cookie - Used by SSR for secure server-side auth
- `localStorage` - Available for client-side JavaScript (though not currently used)

### Auth Middleware (`packages/server/src/middleware/auth.ts`)

The auth middleware supports multiple authentication methods:

```typescript
export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const path = new URL(c.req.url).pathname;

  // Exempt paths don't require auth
  if (isExemptPath(path)) return next();

  const ctx = c.get("appContext");
  const isOptional = isOptionalAuthPath(path);

  // Method 1: API Token header
  const authToken = c.req.header("Auth-Token");
  if (authToken) {
    const result = await validateApiToken(ctx.db, authToken);
    if (result.ok) {
      c.set("user", result.value);
      return next();
    }
  }

  // Method 2: JWT in Authorization header
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

  // Method 3: JWT in cookie (used by SSR)
  const jwtCookie = getCookie(c, "devpad_jwt");
  if (jwtCookie) {
    const result = await authenticateWithJWT(ctx.db, ctx.devpadApi, jwtCookie);
    if (result.ok) {
      c.set("user", result.value);
      c.set("jwtToken", jwtCookie);
      return next();
    }
  }

  // Method 4: DevPad session cookie (legacy)
  const cookie = c.req.header("Cookie");
  if (cookie) {
    const result = await authenticateWithCookie(ctx.db, ctx.devpadApi, cookie);
    if (result.ok) {
      c.set("user", result.value);
      return next();
    }
  }

  // Optional auth paths continue without user
  if (isOptional) return next();

  return c.json({ code: "UNAUTHORIZED", message: "Authentication required" }, 401);
});
```

### SSR Auth Propagation

When Astro pages make SSR API calls, cookies are forwarded automatically:

```typescript
// In api.ssr()
const cookie = request.headers.get("cookie") ?? "";

const internalRequest = new Request(url.toString(), {
  ...options,
  headers: {
    ...options.headers,
    Cookie: cookie,  // Forward cookies for auth
  },
});
```

### Auth Status in Layout

The app layout fetches auth status during SSR:

```astro
---
// layouts/app-layout.astro
let authUser = null;
let authAuthenticated = false;

try {
  const runtime = Astro.locals.runtime;
  const authRes = await api.ssr("/auth/status", Astro.request, {}, runtime);
  if (authRes.ok) {
    const data = await authRes.json();
    authAuthenticated = data.authenticated;
    authUser = data.user;
  }
} catch (e) {
  // Auth fetch failed silently
}
---

<AuthStatus client:load initialUser={authUser} initialAuthenticated={authAuthenticated} />
```

---

## Best Practices

### 1. Always Use `api.ssr()` for Server-Side Data Fetching

```astro
---
// GOOD - Uses SSR method with runtime for internal routing
const runtime = Astro.locals.runtime;
const response = await api.ssr("/api/blog/posts", Astro.request, {}, runtime);

// BAD - Direct fetch bypasses internal routing optimization
const response = await fetch("http://localhost:3000/api/blog/posts");
---
```

### 2. Pass Initial Data to Hydrated Components

```astro
---
// GOOD - Server fetches, passes to component
const data = await api.ssr(...);
---
<MyComponent client:load initialData={data} />
```

```typescript
// GOOD - Component uses initial data, skips fetch during hydration
const MyComponent = (props: { initialData?: Data }) => {
  const [data] = createResource(
    () => props.initialData ? null : true,  // Skip if have initial data
    fetchData,
    { initialValue: props.initialData }
  );
};
```

### 3. Guard Browser APIs in Effects

```typescript
// GOOD
createEffect(() => {
  if (isServer) return;  // Guard SSR
  document.addEventListener("keydown", handler);
  onCleanup(() => document.removeEventListener("keydown", handler));
});

// ALSO GOOD
createEffect(() => {
  if (typeof window === "undefined") return;
  // Browser-only code
});
```

### 4. Handle Fetch Errors Gracefully

```astro
---
let data = null;
let error = null;

try {
  const res = await api.ssr(...);
  if (!res.ok) throw new Error("Failed to fetch");
  data = await res.json();
} catch (e) {
  error = "Failed to load data";
}
---

{error ? (
  <div class="form-error">{error}</div>
) : (
  <DataComponent data={data} />
)}
```

### 5. Use Parallel Fetching When Possible

```astro
---
// GOOD - Parallel fetches
const [res1, res2, res3] = await Promise.all([
  api.ssr("/api/a", request, {}, runtime),
  api.ssr("/api/b", request, {}, runtime),
  api.ssr("/api/c", request, {}, runtime),
]);

// BAD - Sequential fetches (slower)
const res1 = await api.ssr("/api/a", request, {}, runtime);
const res2 = await api.ssr("/api/b", request, {}, runtime);
const res3 = await api.ssr("/api/c", request, {}, runtime);
---
```

### 6. Use `client:load` for Interactive Components

Since all interactive components in this project need immediate interactivity, consistently use `client:load`:

```astro
<!-- Interactive form - needs immediate hydration -->
<PostEditor client:load categories={categories} />

<!-- Settings page - needs immediate hydration -->
<SettingsPage client:load initialUser={user} />
```

### 7. Transform Data Before Passing to Components

```astro
---
// Transform tree structure in Astro (runs once on server)
const flattenTree = (nodes) => nodes.flatMap(n => [
  { name: n.name, parent: n.parent },
  ...flattenTree(n.children ?? [])
]);

const data = await api.ssr(...);
const categories = flattenTree(data.categories ?? []);
---

<CategoriesPage client:load initialCategories={categories} />
```

---

## Common Pitfalls

### Pitfall 1: Accessing `window` or `document` During SSR

**Problem:**
```typescript
// CRASH during SSR
const Component = () => {
  const width = window.innerWidth;  // window is undefined on server
  return <div style={{ width: `${width}px` }} />;
};
```

**Solution:**
```typescript
const Component = () => {
  const [width, setWidth] = createSignal(0);
  
  onMount(() => {
    // onMount only runs on client
    setWidth(window.innerWidth);
  });
  
  return <div style={{ width: `${width()}px` }} />;
};
```

### Pitfall 2: Fetching in Component During Hydration

**Problem:**
```typescript
// Duplicate fetch: once on server (via Astro), once on client (during hydration)
const Component = () => {
  const [data] = createResource(fetchData);  // Always fetches
  return <div>{data()?.title}</div>;
};
```

**Solution:**
```typescript
const Component = (props: { initialData?: Data }) => {
  const [fetchTrigger, setFetchTrigger] = createSignal(0);
  const [data] = createResource(
    () => {
      if (fetchTrigger() === 0 && props.initialData) return null;  // Skip
      return fetchTrigger();
    },
    fetchData,
    { initialValue: props.initialData }
  );
  return <div>{data()?.title}</div>;
};
```

### Pitfall 3: Forgetting to Forward Cookies in SSR Fetches

**Problem:**
```astro
---
// Auth will fail - no cookies forwarded
const response = await fetch("/api/blog/posts");
---
```

**Solution:**
```astro
---
// Cookies automatically forwarded
const runtime = Astro.locals.runtime;
const response = await api.ssr("/api/blog/posts", Astro.request, {}, runtime);
---
```

### Pitfall 4: Not Handling API Errors

**Problem:**
```astro
---
// Crashes if API returns error
const res = await api.ssr(...);
const data = await res.json();  // Throws if not JSON
---
```

**Solution:**
```astro
---
let data = null;
let error = null;

try {
  const res = await api.ssr(...);
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  data = await res.json();
} catch (e) {
  error = e instanceof Error ? e.message : "Unknown error";
}
---

{error ? <Error message={error} /> : <Content data={data} />}
```

### Pitfall 5: Race Conditions Between Astro Scripts and Solid Hydration

**Problem:**
```astro
<PostEditor client:load onFormReady={} />

<script>
  // May run BEFORE PostEditor hydrates
  document.getElementById("save-btn").disabled = false;
</script>
```

**Solution:**
```astro
<script is:inline>
  // Define global callback BEFORE component hydrates
  window.postEditorReady = function(getFormData) {
    postEditorState.getFormData = getFormData;
    if (postEditorState.saveBtn) {
      postEditorState.saveBtn.disabled = false;
    }
  };
</script>

<PostEditor client:load />
```

```typescript
// In PostEditor
onMount(() => {
  const win = window as Window & { postEditorReady?: Function };
  if (win.postEditorReady) {
    win.postEditorReady(getFormData);
  }
});
```

### Pitfall 6: Using `fetch` Instead of `api.fetch` in Components

**Problem:**
```typescript
// Missing credentials, auth may fail
const data = await fetch("/api/blog/posts").then(r => r.json());
```

**Solution:**
```typescript
// Includes credentials: "same-origin"
const data = await api.json<PostsResponse>("/api/blog/posts");
```

### Pitfall 7: Hydration Mismatch

**Problem:**
```typescript
// Server renders different content than client
const Component = () => {
  const time = new Date().toLocaleTimeString();  // Different on server vs client
  return <span>{time}</span>;
};
```

**Solution:**
```typescript
const Component = () => {
  const [time, setTime] = createSignal("");
  
  onMount(() => {
    setTime(new Date().toLocaleTimeString());
  });
  
  return <span>{time()}</span>;  // Empty on SSR, populated on client
};
```

---

## Utility Libraries

### Date Utilities (`apps/website/src/lib/date-utils.ts`)

SSR-safe date formatting utilities:

```typescript
export const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export const relativeTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  // ... relative time calculation
};
```

**Note:** These are SSR-safe because they use `Date` constructor which works in all JS environments. However, `relativeTime` can cause hydration mismatches if called during render (server/client have different "now"). Use in `onMount` or accept the mismatch.

### Form Utilities (`apps/website/src/lib/form-utils.ts`)

Client-only form state management using Solid signals:

```typescript
export const createFormState = (): FormState => {
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const handleSubmit = async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
    setSubmitting(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operation failed");
      return undefined;
    } finally {
      setSubmitting(false);
    }
  };

  return { submitting, error, setError, handleSubmit, handleSubmitResult };
};
```

**Note:** This uses Solid signals, so it only works in Solid components (client-side after hydration).

### Markdown Utilities (`apps/website/src/lib/markdown.ts`)

Markdown rendering using unified/remark/rehype:

```typescript
export const renderMarkdown = async (content: string): Promise<string> => {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeHighlight)
    .use(rehypeStringify)
    .process(content);

  return String(result);
};
```

**SSR Consideration:** This can run on both server and client. In `PostPreview`, it's called in a `createEffect` which runs on client during hydration - avoiding SSR processing of potentially large markdown.

---

## Summary

This project implements a sophisticated SSR architecture that:

1. **Uses Astro's full SSR mode** with Cloudflare Workers adapter
2. **Integrates Solid.js** for interactive UI islands with `client:load` hydration
3. **Optimizes API calls** using internal routing when available
4. **Handles authentication** across SSR and client contexts via JWT cookies
5. **Provides patterns** for data fetching, component design, and error handling

Key takeaways:
- Always use `api.ssr()` for server-side data fetching
- Pass initial data to hydrated components to avoid duplicate fetches
- Guard browser APIs with `isServer` or `typeof window` checks
- Handle errors gracefully in both SSR and client contexts
- Use the unified worker's `API_HANDLER` for optimal internal API calls
