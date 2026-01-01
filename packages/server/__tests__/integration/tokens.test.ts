import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { AppContext } from "@blog/schema";
import { Hono } from "hono";
import { authMiddleware } from "../../src/middleware/auth";
import { tokensRouter } from "../../src/routes/tokens";
import { hashToken } from "../../src/utils/crypto";
import { type TestContext, createAuthenticatedTestApp, createTestContext, createTestToken, createTestUser } from "../setup";

type SanitizedToken = {
	id: number;
	name: string;
	note: string | null;
	enabled: boolean;
	created_at: string;
};

type TokenWithPlainKey = SanitizedToken & { token: string };

type TokenListResponse = { tokens: SanitizedToken[] };

const createTestApp = (ctx: TestContext, userId: number) => createAuthenticatedTestApp(ctx, tokensRouter, "/api/blog/tokens", userId);

const createAuthTestApp = (ctx: TestContext) => {
	const app = new Hono<{ Variables: { user: { id: number }; appContext: AppContext } }>();

	app.use("*", async (c, next) => {
		c.set("appContext", {
			db: ctx.db,
			corpus: ctx.corpus,
			devpadApi: "https://devpad.test",
			environment: "test",
		});
		await next();
	});

	app.use("*", authMiddleware);

	app.get("/api/protected", c => {
		const user = c.get("user");
		return c.json({ user_id: user.id });
	});

	return app;
};

describe("Tokens Route Integration", () => {
	let ctx: TestContext;

	beforeEach(() => {
		ctx = createTestContext();
	});

	afterEach(() => {
		ctx.close();
	});

	describe("GET /api/blog/tokens", () => {
		it("lists users tokens (sanitized, no key_hash)", async () => {
			const user = await createTestUser(ctx);
			await createTestToken(ctx, user.id, "token-1", await hashToken("key1"));
			await createTestToken(ctx, user.id, "token-2", await hashToken("key2"));

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/tokens");

			expect(res.status).toBe(200);
			const body = (await res.json()) as TokenListResponse;
			expect(body.tokens).toHaveLength(2);

			for (const token of body.tokens) {
				expect(token).toHaveProperty("id");
				expect(token).toHaveProperty("name");
				expect(token).toHaveProperty("enabled");
				expect(token).toHaveProperty("created_at");
				expect(token).not.toHaveProperty("key_hash");
				expect(token).not.toHaveProperty("user_id");
			}
		});

		it("returns empty list when user has no tokens", async () => {
			const user = await createTestUser(ctx);

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/tokens");

			expect(res.status).toBe(200);
			const body = (await res.json()) as TokenListResponse;
			expect(body.tokens).toEqual([]);
		});

		it("only returns tokens for current user (multi-user isolation)", async () => {
			const userA = await createTestUser(ctx, { github_id: 100001 });
			const userB = await createTestUser(ctx, { github_id: 100002 });

			await createTestToken(ctx, userA.id, "A-token", await hashToken("keyA"));
			await createTestToken(ctx, userB.id, "B-token", await hashToken("keyB"));

			const appA = createTestApp(ctx, userA.id);
			const resA = await appA.request("/api/blog/tokens");
			const bodyA = (await resA.json()) as TokenListResponse;

			expect(bodyA.tokens).toHaveLength(1);
			expect(bodyA.tokens[0]?.name).toBe("A-token");

			const appB = createTestApp(ctx, userB.id);
			const resB = await appB.request("/api/blog/tokens");
			const bodyB = (await resB.json()) as TokenListResponse;

			expect(bodyB.tokens).toHaveLength(1);
			expect(bodyB.tokens[0]?.name).toBe("B-token");
		});
	});

	describe("POST /api/blog/tokens", () => {
		it("creates token and returns plain token once", async () => {
			const user = await createTestUser(ctx);

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/tokens", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "My New Token" }),
			});

			expect(res.status).toBe(201);
			const body = (await res.json()) as TokenWithPlainKey;

			expect(body.name).toBe("My New Token");
			expect(body.enabled).toBe(true);
			expect(body.token).toBeDefined();
			expect(body.token.length).toBeGreaterThan(32);
		});

		it("creates token with note", async () => {
			const user = await createTestUser(ctx);

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/tokens", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "CI Token", note: "For GitHub Actions" }),
			});

			expect(res.status).toBe(201);
			const body = (await res.json()) as TokenWithPlainKey;

			expect(body.name).toBe("CI Token");
			expect(body.note).toBe("For GitHub Actions");
		});

		it("created token can be used for authentication", async () => {
			const user = await createTestUser(ctx);

			const createApp = createTestApp(ctx, user.id);
			const createRes = await createApp.request("/api/blog/tokens", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "Auth Test Token" }),
			});

			expect(createRes.status).toBe(201);
			const createBody = (await createRes.json()) as TokenWithPlainKey;
			const plainToken = createBody.token;

			const authApp = createAuthTestApp(ctx);
			const authRes = await authApp.request("/api/protected", {
				headers: { "Auth-Token": plainToken },
			});

			expect(authRes.status).toBe(200);
			const authBody = (await authRes.json()) as { user_id: number };
			expect(authBody.user_id).toBe(user.id);
		});

		it("rejects empty name", async () => {
			const user = await createTestUser(ctx);

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/tokens", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "" }),
			});

			expect(res.status).toBe(400);
		});
	});

	describe("PUT /api/blog/tokens/:id", () => {
		it("updates token name", async () => {
			const user = await createTestUser(ctx);
			const token = await createTestToken(ctx, user.id, "Original Name", await hashToken("key"));

			const app = createTestApp(ctx, user.id);
			const res = await app.request(`/api/blog/tokens/${token.id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "New Name" }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as SanitizedToken;
			expect(body.name).toBe("New Name");
		});

		it("updates token note", async () => {
			const user = await createTestUser(ctx);
			const token = await createTestToken(ctx, user.id, "Token", await hashToken("key"));

			const app = createTestApp(ctx, user.id);
			const res = await app.request(`/api/blog/tokens/${token.id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ note: "Updated note" }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as SanitizedToken;
			expect(body.note).toBe("Updated note");
		});

		it("disables token", async () => {
			const user = await createTestUser(ctx);
			const token = await createTestToken(ctx, user.id, "Active Token", await hashToken("key"));

			const app = createTestApp(ctx, user.id);
			const res = await app.request(`/api/blog/tokens/${token.id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ enabled: false }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as SanitizedToken;
			expect(body.enabled).toBe(false);
		});

		it("re-enables disabled token", async () => {
			const user = await createTestUser(ctx);
			const token = await createTestToken(ctx, user.id, "Disabled Token", await hashToken("key"), false);

			const app = createTestApp(ctx, user.id);
			const res = await app.request(`/api/blog/tokens/${token.id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ enabled: true }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as SanitizedToken;
			expect(body.enabled).toBe(true);
		});

		it("returns 404 for non-existent token", async () => {
			const user = await createTestUser(ctx);

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/tokens/99999", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "New Name" }),
			});

			expect(res.status).toBe(404);
		});

		it("cannot update another users token", async () => {
			const userA = await createTestUser(ctx, { github_id: 200001 });
			const userB = await createTestUser(ctx, { github_id: 200002 });
			const tokenA = await createTestToken(ctx, userA.id, "A Token", await hashToken("keyA"));

			const appB = createTestApp(ctx, userB.id);
			const res = await appB.request(`/api/blog/tokens/${tokenA.id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "Hacked" }),
			});

			expect(res.status).toBe(404);
		});
	});

	describe("DELETE /api/blog/tokens/:id", () => {
		it("deletes token", async () => {
			const user = await createTestUser(ctx);
			const token = await createTestToken(ctx, user.id, "To Delete", await hashToken("key"));

			const app = createTestApp(ctx, user.id);
			const res = await app.request(`/api/blog/tokens/${token.id}`, {
				method: "DELETE",
			});

			expect(res.status).toBe(204);

			const listRes = await app.request("/api/blog/tokens");
			const body = (await listRes.json()) as TokenListResponse;
			expect(body.tokens).toHaveLength(0);
		});

		it("returns 404 for non-existent token", async () => {
			const user = await createTestUser(ctx);

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/tokens/99999", {
				method: "DELETE",
			});

			expect(res.status).toBe(404);
		});

		it("cannot delete another users token", async () => {
			const userA = await createTestUser(ctx, { github_id: 300001 });
			const userB = await createTestUser(ctx, { github_id: 300002 });
			const tokenA = await createTestToken(ctx, userA.id, "A Token", await hashToken("keyA"));

			const appB = createTestApp(ctx, userB.id);
			const res = await appB.request(`/api/blog/tokens/${tokenA.id}`, {
				method: "DELETE",
			});

			expect(res.status).toBe(404);

			const appA = createTestApp(ctx, userA.id);
			const listRes = await appA.request("/api/blog/tokens");
			const body = (await listRes.json()) as TokenListResponse;
			expect(body.tokens).toHaveLength(1);
		});

		it("deleted token can no longer be used for auth", async () => {
			const user = await createTestUser(ctx);
			const plainToken = "deletable-token-key";
			const token = await createTestToken(ctx, user.id, "Deletable", await hashToken(plainToken));

			const authApp = createAuthTestApp(ctx);
			const authRes1 = await authApp.request("/api/protected", {
				headers: { "Auth-Token": plainToken },
			});
			expect(authRes1.status).toBe(200);

			const app = createTestApp(ctx, user.id);
			await app.request(`/api/blog/tokens/${token.id}`, { method: "DELETE" });

			const authRes2 = await authApp.request("/api/protected", {
				headers: { "Auth-Token": plainToken },
			});
			expect(authRes2.status).toBe(401);
		});
	});
});
