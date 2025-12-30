# JWT-based Cross-Domain Authentication Implementation Plan

## Overview

This document outlines the implementation plan for JWT-based authentication between the dev-blog application and devpad.tools.

### Problem Statement

- **Production** (`blog.devpad.tools`): Can use devpad's session cookies (`.devpad.tools` domain)
- **Preview** (`*.blog-devpad.pages.dev`): Cannot use cookies (different domain)
- Current blog auth only handles cookie passthrough, not JWT tokens
- Response schema mismatch between blog expectations and devpad's actual `/api/auth/verify` response

### Solution

Implement dual-mode authentication:
1. **Cookie mode** (production): Forward cookies to devpad's `/api/auth/verify`
2. **JWT mode** (preview/cross-domain): Receive JWT via callback, store in localStorage, send as `Bearer jwt:{token}`

---

## Auth Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PRODUCTION (blog.devpad.tools)                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  User clicks Login                                                           │
│       │                                                                      │
│       ▼                                                                      │
│  Blog redirects to devpad.tools/auth/github?return_to=blog.devpad.tools     │
│       │                                                                      │
│       ▼                                                                      │
│  GitHub OAuth → Devpad sets session cookie (.devpad.tools domain)           │
│       │                                                                      │
│       ▼                                                                      │
│  Devpad redirects back to blog.devpad.tools                                 │
│       │                                                                      │
│       ▼                                                                      │
│  Blog API requests include devpad's session cookie automatically            │
│       │                                                                      │
│       ▼                                                                      │
│  Blog backend forwards cookie to devpad /api/auth/verify → User verified    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        PREVIEW (*.blog-devpad.pages.dev)                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  User clicks Login                                                           │
│       │                                                                      │
│       ▼                                                                      │
│  Blog redirects to devpad.tools/auth/github?return_to={preview-url}         │
│       │              &mode=jwt                                               │
│       ▼                                                                      │
│  GitHub OAuth → Devpad creates session + generates JWT                      │
│       │                                                                      │
│       ▼                                                                      │
│  Devpad redirects to {preview-url}/auth/callback?token={jwt}                │
│       │                                                                      │
│       ▼                                                                      │
│  Blog /auth/callback page stores JWT in localStorage                        │
│       │                                                                      │
│       ▼                                                                      │
│  Blog API requests include Authorization: Bearer jwt:{token}                │
│       │                                                                      │
│       ▼                                                                      │
│  Blog backend forwards JWT to devpad /api/auth/verify → User verified       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Changes Required

### 1. Blog Backend Changes

#### 1.1 Update Auth Middleware (`packages/server/src/middleware/auth.ts`)

**Current behavior**: Only checks `Auth-Token` header (API keys) and cookies.

**Required changes**:
- Add JWT detection from `Authorization: Bearer jwt:{token}` header
- Forward JWT to devpad's `/api/auth/verify` with the same `Authorization` header
- Fix response schema to match devpad's actual response format

```typescript
// Current DevpadUserSchema (WRONG)
const DevpadUserSchema = z.object({
  id: z.number(),
  github_id: z.number(),
  username: z.string(),
  email: z.string().nullable(),
  avatar_url: z.string().nullable(),
});

// Actual devpad /api/auth/verify response format
const DevpadVerifyResponseSchema = z.object({
  authenticated: z.boolean(),
  user: z.object({
    id: z.string(),           // string UUID, not number
    name: z.string(),         // 'name' not 'username'
    email: z.string().nullable().optional(),
    github_id: z.number(),
    image_url: z.string().nullable().optional(),  // 'image_url' not 'avatar_url'
    task_view: z.string().optional(),
  }).nullable(),
});
```

**New auth flow in middleware**:
```
1. Check Auth-Token header → API key auth (existing)
2. Check Authorization: Bearer jwt:{token} → Forward to devpad with same header
3. Check Cookie header → Forward to devpad (existing)
4. If all fail → 401 Unauthorized
```

#### 1.2 Update Auth Routes (`packages/server/src/routes/auth.ts`)

**Current behavior**: 
- `/auth/login` redirects to devpad with just `return_to`
- `/auth/user` returns current user
- `/auth/logout` clears cookies

**Required changes**:

Add `/auth/callback` endpoint to handle JWT redirect:
```typescript
authRouter.get("/callback", c => {
  const token = c.req.query("token");
  
  if (!token) {
    return c.json({ code: "INVALID_CALLBACK", message: "No token provided" }, 400);
  }
  
  // Return HTML page that stores token and redirects
  return c.html(`
    <!DOCTYPE html>
    <html>
    <head><title>Authenticating...</title></head>
    <body>
      <script>
        localStorage.setItem('devpad_jwt', '${token}');
        window.location.href = '/posts';
      </script>
    </body>
    </html>
  `);
});
```

Update `/auth/login` to detect preview vs production:
```typescript
authRouter.get("/login", c => {
  const ctx = c.get("appContext");
  const origin = new URL(c.req.url).origin;
  
  // Detect if this is a preview deployment (not on devpad.tools domain)
  const isPreview = !origin.includes('devpad.tools');
  
  // For preview deployments, request JWT mode
  const params = new URLSearchParams({
    return_to: `${origin}/auth/callback`,
    ...(isPreview && { mode: 'jwt' })
  });
  
  return c.redirect(`${ctx.devpadApi}/auth/github?${params}`);
});
```

Update `/auth/logout` to clear localStorage token:
```typescript
authRouter.get("/logout", c => {
  // Return HTML page that clears both cookies and localStorage
  return c.html(`
    <!DOCTYPE html>
    <html>
    <head><title>Logging out...</title></head>
    <body>
      <script>
        localStorage.removeItem('devpad_jwt');
        document.cookie = 'session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        document.cookie = 'devpad_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        window.location.href = '/';
      </script>
    </body>
    </html>
  `);
});
```

Add `/auth/status` endpoint for frontend to check auth state:
```typescript
authRouter.get("/status", c => {
  const user = c.get("user");
  
  return c.json({
    authenticated: !!user,
    user: user ? {
      id: user.id,
      username: user.username,
      email: user.email,
      avatar_url: user.avatar_url,
    } : null,
  });
});
```

### 2. Blog Frontend Changes

#### 2.1 Create Auth Service (`apps/website/src/lib/auth.ts`)

New file to manage auth state and token handling:

```typescript
const JWT_STORAGE_KEY = 'devpad_jwt';

export const auth = {
  getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(JWT_STORAGE_KEY);
  },
  
  setToken(token: string): void {
    localStorage.setItem(JWT_STORAGE_KEY, token);
  },
  
  clearToken(): void {
    localStorage.removeItem(JWT_STORAGE_KEY);
  },
  
  getAuthHeaders(): Record<string, string> {
    const token = this.getToken();
    if (token) {
      return { 'Authorization': `Bearer jwt:${token}` };
    }
    return {};
  },
  
  isPreviewDeployment(): boolean {
    if (typeof window === 'undefined') return false;
    return !window.location.hostname.includes('devpad.tools');
  },
};
```

#### 2.2 Update API Client (`apps/website/src/lib/api.ts`)

Update to include auth headers:

```typescript
import { auth } from './auth';

const API_HOST = import.meta.env.PUBLIC_API_URL ?? "http://localhost:8080";

export const api = {
  host: API_HOST,
  
  blog: (path: string) => `${API_HOST}/api/blog${path.startsWith("/") ? path : `/${path}`}`,
  
  auth: (path: string) => `${API_HOST}/auth${path.startsWith("/") ? path : `/${path}`}`,
  
  // New: fetch with auth
  async fetch(path: string, options: RequestInit = {}): Promise<Response> {
    const headers = {
      ...options.headers,
      ...auth.getAuthHeaders(),
    };
    
    return fetch(`${API_HOST}${path}`, {
      ...options,
      headers,
      credentials: 'include', // Still send cookies for production
    });
  },
};
```

#### 2.3 Update Auth Status Component (`apps/website/src/components/layout/auth-status.tsx`)

```typescript
import { createSignal, onMount, Show } from "solid-js";
import { auth } from "@/lib/auth";
import { api } from "@/lib/api";

type User = {
  id: number;
  username: string;
  avatar_url: string | null;
};

const AuthStatus = () => {
  const [user, setUser] = createSignal<User | null>(null);
  const [loading, setLoading] = createSignal(true);
  
  onMount(async () => {
    try {
      const response = await api.fetch('/auth/status');
      if (response.ok) {
        const data = await response.json();
        if (data.authenticated) {
          setUser(data.user);
        }
      }
    } catch (e) {
      console.error('Failed to check auth status:', e);
    } finally {
      setLoading(false);
    }
  });
  
  return (
    <div class="user-info">
      <Show when={!loading()} fallback={<span class="loading">...</span>}>
        <Show
          when={user()}
          fallback={
            <a href="/auth/login" class="auth-btn login-btn">Login</a>
          }
        >
          {(u) => (
            <>
              <span class="username">{u().username}</span>
              <a href="/auth/logout" class="auth-btn logout-btn">Logout</a>
            </>
          )}
        </Show>
      </Show>
    </div>
  );
};

export default AuthStatus;
```

#### 2.4 Create Auth Callback Page (`apps/website/src/pages/auth/callback.astro`)

```astro
---
// This page handles the JWT callback from devpad
// The actual token storage happens via the backend's HTML response
// This is just a fallback if someone navigates here directly
---

<html>
<head>
  <title>Authenticating...</title>
</head>
<body>
  <script>
    // Check if we have a token in the URL (fallback handling)
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    
    if (token) {
      localStorage.setItem('devpad_jwt', token);
      window.location.href = '/posts';
    } else if (localStorage.getItem('devpad_jwt')) {
      // Already have token, redirect to posts
      window.location.href = '/posts';
    } else {
      // No token, redirect to login
      window.location.href = '/auth/login';
    }
  </script>
  <noscript>
    <p>JavaScript is required for authentication. Please enable JavaScript and try again.</p>
  </noscript>
</body>
</html>
```

#### 2.5 Create Auth Logout Page (`apps/website/src/pages/auth/logout.astro`)

```astro
---
// This page handles logout
---

<html>
<head>
  <title>Logging out...</title>
</head>
<body>
  <script>
    localStorage.removeItem('devpad_jwt');
    window.location.href = '/';
  </script>
</body>
</html>
```

### 3. Devpad Changes (Minimal)

The devpad auth already supports JWT generation and the `/api/auth/verify` endpoint accepts JWT tokens. The only potential change needed:

#### 3.1 Update GitHub OAuth Flow (`packages/server/src/routes/auth.ts`)

Check if devpad already handles the `mode=jwt` parameter or if the redirect decision needs updating:

**Current behavior** (line 86-104):
- Uses `FRONTEND_URL` env var to determine redirect
- Always redirects to `{frontendUrl}/auth/callback?token={jwt}` for cross-domain

**Required behavior**:
- Use `return_to` parameter from the OAuth state
- Optionally support `mode=jwt` to force JWT redirect even for same-domain

This may already work if devpad stores `return_to` in the OAuth state and uses it after callback. **Needs verification**.

#### 3.2 CORS Configuration

Ensure devpad's CORS allows requests from `*.blog-devpad.pages.dev`:

```typescript
// Already likely in devpad's CORS config, but verify:
const allowedOrigins = [
  /^https:\/\/.*\.pages\.dev$/,  // Cloudflare Pages previews
  /^https:\/\/blog\.devpad\.tools$/,
  /^http:\/\/localhost:\d+$/,
];
```

---

## Implementation Tasks

### Task 1: Fix Response Schema Mapping (Backend)
**Estimate**: ~30 LOC | **Parallel**: No (blocking)

Update `packages/server/src/middleware/auth.ts`:
1. Fix `DevpadUserSchema` to match actual devpad response
2. Update `verifyWithDevpad` to handle the `{ authenticated, user }` wrapper
3. Map devpad's `name` → blog's `username`, `image_url` → `avatar_url`

```typescript
// Key changes:
const DevpadVerifyResponseSchema = z.object({
  authenticated: z.boolean(),
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().nullable().optional(),
    github_id: z.number(),
    image_url: z.string().nullable().optional(),
  }).nullable(),
});

// In ensureUser, map fields:
await db.insert(users).values({
  github_id: devpadUser.github_id,
  username: devpadUser.name,  // Map name → username
  email: devpadUser.email ?? null,
  avatar_url: devpadUser.image_url ?? null,  // Map image_url → avatar_url
  // ...
});
```

### Task 2: Add JWT Auth Support to Middleware (Backend)
**Estimate**: ~50 LOC | **Parallel**: No (depends on Task 1)

Update `packages/server/src/middleware/auth.ts`:
1. Add JWT token detection from `Authorization: Bearer jwt:{token}`
2. Create `verifyWithDevpadJWT` function that forwards JWT in Authorization header
3. Update auth flow to check JWT before cookies

```typescript
const verifyWithDevpadJWT = async (
  devpadApi: string, 
  jwtToken: string
): Promise<Result<DevpadUser, string>> => {
  const response = await fetch(`${devpadApi}/api/auth/verify`, {
    method: "GET",
    headers: { 
      Authorization: `Bearer jwt:${jwtToken}` 
    },
  });
  // ... handle response
};
```

### Task 3: Add Auth Routes (Backend)
**Estimate**: ~80 LOC | **Parallel**: Yes (after Task 1)

Update `packages/server/src/routes/auth.ts`:
1. Add `/auth/callback` endpoint
2. Update `/auth/login` for preview detection
3. Add `/auth/status` endpoint
4. Update `/auth/logout` to return HTML

### Task 4: Create Frontend Auth Service
**Estimate**: ~40 LOC | **Parallel**: Yes

Create `apps/website/src/lib/auth.ts`:
1. Token storage/retrieval
2. Auth header generation
3. Preview detection helper

### Task 5: Update Frontend API Client
**Estimate**: ~20 LOC | **Parallel**: Yes (after Task 4)

Update `apps/website/src/lib/api.ts`:
1. Add `fetch` method with auth headers
2. Maintain backward compatibility

### Task 6: Update Auth Status Component
**Estimate**: ~50 LOC | **Parallel**: Yes (after Task 4, 5)

Update `apps/website/src/components/layout/auth-status.tsx`:
1. Check auth status on mount
2. Display user info or login button
3. Handle loading state

### Task 7: Create Auth Pages
**Estimate**: ~40 LOC | **Parallel**: Yes (after Task 4)

Create:
1. `apps/website/src/pages/auth/callback.astro`
2. `apps/website/src/pages/auth/logout.astro`

### Task 8: Verify Devpad Configuration
**Estimate**: ~10 LOC (if changes needed) | **Parallel**: Yes

1. Verify CORS allows `*.blog-devpad.pages.dev`
2. Verify OAuth callback handles `return_to` parameter
3. Test JWT flow end-to-end

---

## Task Dependency Graph

```
Task 1 (Schema Fix)
    │
    ▼
Task 2 (JWT Middleware)
    │
    ├──────────────────┐
    ▼                  ▼
Task 3 (Auth Routes)   Task 4 (Auth Service) ─────┐
                           │                       │
                           ▼                       │
                       Task 5 (API Client)         │
                           │                       │
                           ├───────────────────────┤
                           ▼                       ▼
                       Task 6 (Auth Status)    Task 7 (Auth Pages)

Task 8 (Devpad Config) ── runs in parallel from start
```

### Parallel Execution Groups

**Group 1** (Sequential - Critical Path):
- Task 1 → Task 2 → Task 3

**Group 2** (Parallel after Task 1):
- Task 4 → Task 5 → Task 6
- Task 4 → Task 7

**Group 3** (Independent):
- Task 8

---

## Testing Plan

### Unit Tests

Location: `packages/server/__tests__/unit/auth.test.ts`

#### Test 1: Schema Mapping
```typescript
describe('DevpadVerifyResponseSchema', () => {
  it('parses valid devpad response', () => {
    const response = {
      authenticated: true,
      user: {
        id: 'uuid-here',
        name: 'testuser',
        email: 'test@example.com',
        github_id: 12345,
        image_url: 'https://avatars.githubusercontent.com/u/12345',
      },
    };
    expect(DevpadVerifyResponseSchema.safeParse(response).success).toBe(true);
  });
  
  it('handles unauthenticated response', () => {
    const response = { authenticated: false, user: null };
    expect(DevpadVerifyResponseSchema.safeParse(response).success).toBe(true);
  });
});
```

#### Test 2: User Field Mapping
```typescript
describe('mapDevpadUserToBlogUser', () => {
  it('maps name to username and image_url to avatar_url', () => {
    const devpadUser = { id: '1', name: 'Test', github_id: 123, image_url: 'url' };
    const blogUser = mapDevpadUserToBlogUser(devpadUser);
    expect(blogUser.username).toBe('Test');
    expect(blogUser.avatar_url).toBe('url');
  });
});
```

### Integration Tests

Location: `packages/server/__tests__/integration/auth.test.ts`

#### Test 1: JWT Authentication Flow
```typescript
describe('JWT Authentication', () => {
  it('authenticates with valid JWT token', async () => {
    // Setup: Mock devpad verify endpoint
    mockDevpad.onVerify((req) => {
      if (req.headers.authorization === 'Bearer jwt:valid-token') {
        return { authenticated: true, user: mockUser };
      }
      return { authenticated: false };
    });
    
    const response = await app.request('/api/blog/posts', {
      headers: { Authorization: 'Bearer jwt:valid-token' },
    });
    
    expect(response.status).toBe(200);
  });
  
  it('rejects invalid JWT token', async () => {
    mockDevpad.onVerify(() => ({ authenticated: false }));
    
    const response = await app.request('/api/blog/posts', {
      headers: { Authorization: 'Bearer jwt:invalid-token' },
    });
    
    expect(response.status).toBe(401);
  });
});
```

#### Test 2: Cookie Fallback
```typescript
describe('Cookie Authentication Fallback', () => {
  it('falls back to cookie auth when no JWT provided', async () => {
    mockDevpad.onVerify((req) => {
      if (req.headers.cookie?.includes('auth_session')) {
        return { authenticated: true, user: mockUser };
      }
      return { authenticated: false };
    });
    
    const response = await app.request('/api/blog/posts', {
      headers: { Cookie: 'auth_session=valid-session' },
    });
    
    expect(response.status).toBe(200);
  });
});
```

#### Test 3: Auth Callback Endpoint
```typescript
describe('/auth/callback', () => {
  it('returns HTML that stores JWT token', async () => {
    const response = await app.request('/auth/callback?token=test-jwt-token');
    
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    
    const html = await response.text();
    expect(html).toContain("localStorage.setItem('devpad_jwt', 'test-jwt-token')");
  });
  
  it('returns error when no token provided', async () => {
    const response = await app.request('/auth/callback');
    
    expect(response.status).toBe(400);
  });
});
```

### Manual Testing Checklist

#### Production Flow (blog.devpad.tools)
- [ ] Navigate to blog.devpad.tools
- [ ] Click login → redirected to devpad.tools
- [ ] Complete GitHub OAuth
- [ ] Redirected back to blog.devpad.tools
- [ ] Auth status shows logged in user
- [ ] API requests work (posts load)
- [ ] Logout clears session

#### Preview Flow (*.blog-devpad.pages.dev)
- [ ] Navigate to preview URL
- [ ] Click login → redirected to devpad.tools with return_to param
- [ ] Complete GitHub OAuth
- [ ] Redirected back to preview URL /auth/callback?token=...
- [ ] JWT stored in localStorage
- [ ] Auth status shows logged in user
- [ ] API requests include JWT header
- [ ] Logout clears localStorage

#### Edge Cases
- [ ] Token expiry (24h) - user redirected to login
- [ ] Invalid token - user sees 401, redirected to login
- [ ] Browser refresh maintains auth state
- [ ] Multiple tabs share auth state (localStorage)
- [ ] Switching between preview and production (different auth mechanisms)

---

## Rollout Plan

1. **Phase 1**: Deploy backend changes (Tasks 1-3)
   - This is backward compatible - cookie auth still works
   - JWT auth becomes available but frontend doesn't use it yet

2. **Phase 2**: Deploy frontend changes (Tasks 4-7)
   - Frontend starts using JWT for preview deployments
   - Production still uses cookies (faster, no extra header)

3. **Phase 3**: Monitor and iterate
   - Watch for auth failures in logs
   - Track JWT expiry issues
   - Consider refresh token flow if needed

---

## Limitations & Future Considerations

### Current Limitations

1. **JWT Expiry**: 24-hour fixed expiry. User must re-login after expiry.
   - Future: Implement refresh token flow

2. **No Token Refresh**: JWT cannot be refreshed without re-authenticating.
   - Future: Add `/auth/refresh` endpoint

3. **localStorage Security**: JWT in localStorage is accessible to XSS.
   - Mitigation: Short expiry, CSP headers
   - Future: Consider httpOnly cookie for JWT on preview subdomain

4. **No Revocation**: Cannot revoke JWT tokens server-side.
   - Mitigation: Short expiry
   - Future: Token blacklist or session validation on each request

### Out of Scope

- Multi-tenant auth (single user per blog currently)
- OAuth with providers other than GitHub
- API key management changes
- Rate limiting on auth endpoints
