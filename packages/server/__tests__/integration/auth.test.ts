import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { AppContext } from "@blog/schema";
import { Hono } from "hono";
import { authMiddleware } from "../../src/middleware/auth";
import { type TestContext, createMockDevpadVerifyFetch, createTestContext, createTestToken, createTestUser } from "../setup";

type AuthResponse = {
	authenticated: boolean;
	user: { id: number; username: string; email: string | null } | null;
};

type ProtectedResponse = {
	user_id: number;
};

type JwtCheckResponse = {
	has_jwt: boolean;
	jwt: string | null;
};

type ErrorResponse = {
	code: string;
	message: string;
};

const createTestApp = (ctx: TestContext, devpadApi: string) => {
	const app = new Hono<{ Variables: { user: { id: number }; appContext: AppContext; jwtToken?: string } }>();

	app.use("*", async (c, next) => {
		c.set("appContext", {
			db: ctx.db,
			corpus: ctx.corpus,
			devpadApi,
			environment: "test",
		});
		await next();
	});

	app.use("*", authMiddleware);

	app.get("/health", c => c.json({ status: "ok" }));
	app.get("/auth/login", c => c.json({ redirect: "/oauth" }));
	app.get("/auth/logout", c => c.json({ logged_out: true }));
	app.get("/auth/callback", c => c.json({ callback: true }));
	app.get("/auth/status", c => {
		const user = c.get("user");
		return c.json({ authenticated: !!user, user: user ?? null });
	});
	app.get("/api/protected", c => {
		const user = c.get("user");
		return c.json({ user_id: user.id });
	});
	app.get("/api/jwt-check", c => {
		const jwtToken = c.get("jwtToken");
		return c.json({ has_jwt: !!jwtToken, jwt: jwtToken ?? null });
	});

	return app;
};

const hashToken = async (token: string): Promise<string> => {
	const encoder = new TextEncoder();
	const data = encoder.encode(token);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(hashBuffer))
		.map(b => b.toString(16).padStart(2, "0"))
		.join("");
};

const mockFetchWithPreconnect = (handler: (url: string | URL | Request, init?: RequestInit) => Promise<Response>) => {
	const fn = handler as typeof globalThis.fetch;
	(fn as unknown as { preconnect: () => void }).preconnect = () => {};
	return fn;
};

describe("Auth Middleware Integration", () => {
	let ctx: TestContext;
	let devpadApi: string;
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		ctx = createTestContext();
		devpadApi = "https://devpad.test";
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		ctx.close();
		globalThis.fetch = originalFetch;
	});

	describe("exempt paths", () => {
		it("allows /health without auth", async () => {
			const app = createTestApp(ctx, devpadApi);
			const res = await app.request("/health");

			expect(res.status).toBe(200);
			const body = (await res.json()) as { status: string };
			expect(body.status).toBe("ok");
		});

		it("allows /auth/login without auth", async () => {
			const app = createTestApp(ctx, devpadApi);
			const res = await app.request("/auth/login");

			expect(res.status).toBe(200);
		});

		it("allows /auth/logout without auth", async () => {
			const app = createTestApp(ctx, devpadApi);
			const res = await app.request("/auth/logout");

			expect(res.status).toBe(200);
		});

		it("allows /auth/callback without auth", async () => {
			const app = createTestApp(ctx, devpadApi);
			const res = await app.request("/auth/callback");

			expect(res.status).toBe(200);
		});
	});

	describe("optional auth paths", () => {
		it("returns authenticated=false for /auth/status without auth", async () => {
			const app = createTestApp(ctx, devpadApi);
			const res = await app.request("/auth/status");

			expect(res.status).toBe(200);
			const body = (await res.json()) as AuthResponse;
			expect(body.authenticated).toBe(false);
			expect(body.user).toBeNull();
		});

		it("returns user for /auth/status with valid token auth", async () => {
			const user = await createTestUser(ctx);
			const plainToken = "test-api-token-123";
			const keyHash = await hashToken(plainToken);
			await createTestToken(ctx, user.id, "test-token", keyHash);

			const app = createTestApp(ctx, devpadApi);
			const res = await app.request("/auth/status", {
				headers: { "Auth-Token": plainToken },
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as AuthResponse;
			expect(body.authenticated).toBe(true);
			expect(body.user?.id).toBe(user.id);
		});
	});

	describe("Auth-Token header validation", () => {
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
			const body = (await res.json()) as ProtectedResponse;
			expect(body.user_id).toBe(user.id);
		});

		it("rejects invalid token", async () => {
			const app = createTestApp(ctx, devpadApi);
			const res = await app.request("/api/protected", {
				headers: { "Auth-Token": "invalid-token-xyz" },
			});

			expect(res.status).toBe(401);
		});

		it("rejects disabled token", async () => {
			const user = await createTestUser(ctx);
			const plainToken = "disabled-token-123";
			const keyHash = await hashToken(plainToken);
			await createTestToken(ctx, user.id, "disabled-token", keyHash, false);

			const app = createTestApp(ctx, devpadApi);
			const res = await app.request("/api/protected", {
				headers: { "Auth-Token": plainToken },
			});

			expect(res.status).toBe(401);
		});
	});

	describe("JWT auth via Authorization header", () => {
		it("authenticates with valid JWT and creates user", async () => {
			const mockUser = {
				github_id: 99999,
				username: "jwtuser",
				email: "jwt@example.com",
				avatar_url: "https://github.com/jwtuser.png",
			};

			globalThis.fetch = mockFetchWithPreconnect(createMockDevpadVerifyFetch({ authenticated: true, user: mockUser }));

			const app = createTestApp(ctx, devpadApi);
			const res = await app.request("/api/protected", {
				headers: { Authorization: "Bearer jwt:valid-jwt-token" },
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as ProtectedResponse;
			expect(body.user_id).toBeDefined();
		});

		it("stores jwtToken in context for JWT auth", async () => {
			const mockUser = {
				github_id: 88888,
				username: "jwtcheck",
				email: null,
				avatar_url: null,
			};

			globalThis.fetch = mockFetchWithPreconnect(createMockDevpadVerifyFetch({ authenticated: true, user: mockUser }));

			const app = createTestApp(ctx, devpadApi);
			const res = await app.request("/api/jwt-check", {
				headers: { Authorization: "Bearer jwt:my-special-token" },
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as JwtCheckResponse;
			expect(body.has_jwt).toBe(true);
			expect(body.jwt).toBe("my-special-token");
		});

		it("rejects invalid JWT", async () => {
			globalThis.fetch = mockFetchWithPreconnect(createMockDevpadVerifyFetch({ authenticated: false, user: null }));

			const app = createTestApp(ctx, devpadApi);
			const res = await app.request("/api/protected", {
				headers: { Authorization: "Bearer jwt:invalid-jwt" },
			});

			expect(res.status).toBe(401);
		});

		it("rejects malformed Authorization header", async () => {
			const app = createTestApp(ctx, devpadApi);
			const res = await app.request("/api/protected", {
				headers: { Authorization: "Bearer not-jwt-format" },
			});

			expect(res.status).toBe(401);
		});
	});

	describe("JWT auth via cookie", () => {
		it("authenticates with valid devpad_jwt cookie", async () => {
			const mockUser = {
				github_id: 77777,
				username: "cookieuser",
				email: "cookie@example.com",
				avatar_url: null,
			};

			globalThis.fetch = mockFetchWithPreconnect(createMockDevpadVerifyFetch({ authenticated: true, user: mockUser }));

			const app = createTestApp(ctx, devpadApi);
			const res = await app.request("/api/protected", {
				headers: { Cookie: "devpad_jwt=valid-cookie-token" },
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as ProtectedResponse;
			expect(body.user_id).toBeDefined();
		});

		it("stores jwtToken from cookie in context", async () => {
			const mockUser = {
				github_id: 66666,
				username: "cookiejwt",
				email: null,
				avatar_url: null,
			};

			globalThis.fetch = mockFetchWithPreconnect(createMockDevpadVerifyFetch({ authenticated: true, user: mockUser }));

			const app = createTestApp(ctx, devpadApi);
			const res = await app.request("/api/jwt-check", {
				headers: { Cookie: "devpad_jwt=cookie-jwt-value" },
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as JwtCheckResponse;
			expect(body.has_jwt).toBe(true);
			expect(body.jwt).toBe("cookie-jwt-value");
		});
	});

	describe("user creation/update on login", () => {
		it("creates new user on first login", async () => {
			const mockUser = {
				github_id: 111111,
				username: "newuser",
				email: "new@example.com",
				avatar_url: "https://github.com/new.png",
			};

			globalThis.fetch = mockFetchWithPreconnect(createMockDevpadVerifyFetch({ authenticated: true, user: mockUser }));

			const app = createTestApp(ctx, devpadApi);
			const res = await app.request("/api/protected", {
				headers: { Authorization: "Bearer jwt:new-user-token" },
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as ProtectedResponse;
			expect(body.user_id).toBeDefined();

			const res2 = await app.request("/auth/status", {
				headers: { Authorization: "Bearer jwt:new-user-token" },
			});
			const body2 = (await res2.json()) as AuthResponse;
			expect(body2.user?.username).toBe("newuser");
			expect(body2.user?.email).toBe("new@example.com");
		});

		it("updates existing user on subsequent login", async () => {
			const user = await createTestUser(ctx, {
				github_id: 222222,
				username: "oldname",
				email: "old@example.com",
			});

			const mockUser = {
				github_id: 222222,
				username: "newname",
				email: "updated@example.com",
				avatar_url: "https://github.com/updated.png",
			};

			globalThis.fetch = mockFetchWithPreconnect(createMockDevpadVerifyFetch({ authenticated: true, user: mockUser }));

			const app = createTestApp(ctx, devpadApi);
			const res = await app.request("/auth/status", {
				headers: { Authorization: "Bearer jwt:update-user-token" },
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as AuthResponse;
			expect(body.user?.id).toBe(user.id);
			expect(body.user?.username).toBe("newname");
			expect(body.user?.email).toBe("updated@example.com");
		});
	});

	describe("multi-user isolation", () => {
		it("user A cannot use user Bs token", async () => {
			const userA = await createTestUser(ctx, { github_id: 333333, username: "userA" });
			const userB = await createTestUser(ctx, { github_id: 444444, username: "userB" });

			const tokenA = "token-for-user-a";
			const tokenB = "token-for-user-b";
			await createTestToken(ctx, userA.id, "A-token", await hashToken(tokenA));
			await createTestToken(ctx, userB.id, "B-token", await hashToken(tokenB));

			const app = createTestApp(ctx, devpadApi);

			const resA = await app.request("/api/protected", {
				headers: { "Auth-Token": tokenA },
			});
			const bodyA = (await resA.json()) as ProtectedResponse;
			expect(bodyA.user_id).toBe(userA.id);

			const resB = await app.request("/api/protected", {
				headers: { "Auth-Token": tokenB },
			});
			const bodyB = (await resB.json()) as ProtectedResponse;
			expect(bodyB.user_id).toBe(userB.id);

			expect(bodyA.user_id).not.toBe(bodyB.user_id);
		});

		it("tokens are user-specific", async () => {
			const userA = await createTestUser(ctx, { github_id: 555555 });
			const tokenForA = "user-a-secret-token";
			await createTestToken(ctx, userA.id, "A-secret", await hashToken(tokenForA));

			const app = createTestApp(ctx, devpadApi);
			const res = await app.request("/api/protected", {
				headers: { "Auth-Token": tokenForA },
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as ProtectedResponse;
			expect(body.user_id).toBe(userA.id);
		});
	});

	describe("protected routes require auth", () => {
		it("returns 401 for protected route without auth", async () => {
			const app = createTestApp(ctx, devpadApi);
			const res = await app.request("/api/protected");

			expect(res.status).toBe(401);
			const body = (await res.json()) as ErrorResponse;
			expect(body.code).toBe("UNAUTHORIZED");
		});
	});
});
