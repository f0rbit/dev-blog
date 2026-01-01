import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { AppContext } from "@blog/schema";
import { Hono } from "hono";
import { type CategoryNode, categoriesRouter } from "../../src/routes/categories";
import { type TestContext, createTestCategory, createTestContext, createTestPost, createTestUser } from "../setup";

type Category = {
	id: number;
	owner_id: number;
	name: string;
	parent: string | null;
};

type CategoriesTreeResponse = { categories: CategoryNode[] };
type ErrorResponse = { code: string; message: string };

const createTestApp = (ctx: TestContext, userId: number) => {
	const app = new Hono<{ Variables: { user: { id: number }; appContext: AppContext } }>();

	app.use("*", async (c, next) => {
		c.set("appContext", {
			db: ctx.db,
			corpus: ctx.corpus,
			devpadApi: "https://devpad.test",
			environment: "test",
		});
		c.set("user", { id: userId });
		await next();
	});

	app.route("/api/blog/categories", categoriesRouter);

	return app;
};

describe("Categories Route Integration", () => {
	let ctx: TestContext;

	beforeEach(() => {
		ctx = createTestContext();
	});

	afterEach(() => {
		ctx.close();
	});

	describe("GET /api/blog/categories", () => {
		it("lists categories as tree structure", async () => {
			const user = await createTestUser(ctx);
			await createTestCategory(ctx, user.id, "tech", "root");
			await createTestCategory(ctx, user.id, "frontend", "tech");
			await createTestCategory(ctx, user.id, "backend", "tech");

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/categories");

			expect(res.status).toBe(200);
			const body = (await res.json()) as CategoriesTreeResponse;

			expect(body.categories).toHaveLength(1);
			const tech = body.categories[0];
			expect(tech?.name).toBe("tech");
			expect(tech?.children).toHaveLength(2);

			const childNames = tech?.children.map(c => c.name).sort();
			expect(childNames).toEqual(["backend", "frontend"]);
		});

		it("returns empty array when no categories", async () => {
			const user = await createTestUser(ctx);

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/categories");

			expect(res.status).toBe(200);
			const body = (await res.json()) as CategoriesTreeResponse;
			expect(body.categories).toEqual([]);
		});

		it("only returns categories for current user", async () => {
			const userA = await createTestUser(ctx, { github_id: 100001 });
			const userB = await createTestUser(ctx, { github_id: 100002 });

			await createTestCategory(ctx, userA.id, "tech", "root");
			await createTestCategory(ctx, userB.id, "lifestyle", "root");

			const appA = createTestApp(ctx, userA.id);
			const resA = await appA.request("/api/blog/categories");
			const bodyA = (await resA.json()) as CategoriesTreeResponse;

			expect(bodyA.categories).toHaveLength(1);
			expect(bodyA.categories[0]?.name).toBe("tech");
		});
	});

	describe("POST /api/blog/categories", () => {
		it("creates category at root level", async () => {
			const user = await createTestUser(ctx);

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/categories", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "tech" }),
			});

			expect(res.status).toBe(201);
			const body = (await res.json()) as Category;
			expect(body.name).toBe("tech");
			expect(body.parent).toBe("root");
		});

		it("creates category with valid parent", async () => {
			const user = await createTestUser(ctx);
			await createTestCategory(ctx, user.id, "tech", "root");

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/categories", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "frontend", parent: "tech" }),
			});

			expect(res.status).toBe(201);
			const body = (await res.json()) as Category;
			expect(body.name).toBe("frontend");
			expect(body.parent).toBe("tech");
		});

		it("fails with invalid parent", async () => {
			const user = await createTestUser(ctx);

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/categories", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "orphan", parent: "nonexistent" }),
			});

			expect(res.status).toBe(400);
			const body = (await res.json()) as ErrorResponse;
			expect(body.code).toBe("BAD_REQUEST");
		});

		it("fails with duplicate name", async () => {
			const user = await createTestUser(ctx);
			await createTestCategory(ctx, user.id, "tech", "root");

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/categories", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "tech" }),
			});

			expect(res.status).toBe(409);
			const body = (await res.json()) as ErrorResponse;
			expect(body.code).toBe("CONFLICT");
		});

		it("allows same name for different users", async () => {
			const userA = await createTestUser(ctx, { github_id: 200001 });
			const userB = await createTestUser(ctx, { github_id: 200002 });

			await createTestCategory(ctx, userA.id, "tech", "root");

			const appB = createTestApp(ctx, userB.id);
			const res = await appB.request("/api/blog/categories", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "tech" }),
			});

			expect(res.status).toBe(201);
		});
	});

	describe("PUT /api/blog/categories/:name", () => {
		it("renames category", async () => {
			const user = await createTestUser(ctx);
			await createTestCategory(ctx, user.id, "old-name", "root");

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/categories/old-name", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "new-name" }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Category;
			expect(body.name).toBe("new-name");
		});

		it("updates childrens parent refs", async () => {
			const user = await createTestUser(ctx);
			await createTestCategory(ctx, user.id, "parent", "root");
			await createTestCategory(ctx, user.id, "child", "parent");

			const app = createTestApp(ctx, user.id);
			await app.request("/api/blog/categories/parent", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "renamed-parent" }),
			});

			const listRes = await app.request("/api/blog/categories");
			const body = (await listRes.json()) as CategoriesTreeResponse;

			expect(body.categories).toHaveLength(1);
			const parent = body.categories[0];
			expect(parent?.name).toBe("renamed-parent");
			expect(parent?.children).toHaveLength(1);
			expect(parent?.children[0]?.name).toBe("child");
			expect(parent?.children[0]?.parent).toBe("renamed-parent");
		});

		it("updates posts category refs", async () => {
			const user = await createTestUser(ctx);
			await createTestCategory(ctx, user.id, "old-cat", "root");
			await createTestPost(ctx, user.id, { category: "old-cat" });

			const app = createTestApp(ctx, user.id);
			await app.request("/api/blog/categories/old-cat", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "new-cat" }),
			});

			const listRes = await app.request("/api/blog/categories");
			const body = (await listRes.json()) as CategoriesTreeResponse;
			expect(body.categories[0]?.name).toBe("new-cat");
		});

		it("returns 404 for non-existent category", async () => {
			const user = await createTestUser(ctx);

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/categories/nonexistent", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "new-name" }),
			});

			expect(res.status).toBe(404);
		});

		it("fails when renaming to existing name", async () => {
			const user = await createTestUser(ctx);
			await createTestCategory(ctx, user.id, "cat-a", "root");
			await createTestCategory(ctx, user.id, "cat-b", "root");

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/categories/cat-a", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "cat-b" }),
			});

			expect(res.status).toBe(409);
		});

		it("returns same category if name unchanged", async () => {
			const user = await createTestUser(ctx);
			await createTestCategory(ctx, user.id, "same-name", "root");

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/categories/same-name", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "same-name" }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Category;
			expect(body.name).toBe("same-name");
		});
	});

	describe("DELETE /api/blog/categories/:name", () => {
		it("deletes empty category", async () => {
			const user = await createTestUser(ctx);
			await createTestCategory(ctx, user.id, "to-delete", "root");

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/categories/to-delete", {
				method: "DELETE",
			});

			expect(res.status).toBe(204);

			const listRes = await app.request("/api/blog/categories");
			const body = (await listRes.json()) as CategoriesTreeResponse;
			expect(body.categories).toHaveLength(0);
		});

		it("blocked when has children", async () => {
			const user = await createTestUser(ctx);
			await createTestCategory(ctx, user.id, "parent", "root");
			await createTestCategory(ctx, user.id, "child", "parent");

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/categories/parent", {
				method: "DELETE",
			});

			expect(res.status).toBe(409);
			const body = (await res.json()) as ErrorResponse;
			expect(body.message).toContain("children");
		});

		it("blocked when has posts", async () => {
			const user = await createTestUser(ctx);
			await createTestCategory(ctx, user.id, "with-posts", "root");
			await createTestPost(ctx, user.id, { category: "with-posts" });

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/categories/with-posts", {
				method: "DELETE",
			});

			expect(res.status).toBe(409);
			const body = (await res.json()) as ErrorResponse;
			expect(body.message).toContain("posts");
		});

		it("returns 404 for non-existent category", async () => {
			const user = await createTestUser(ctx);

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/categories/nonexistent", {
				method: "DELETE",
			});

			expect(res.status).toBe(404);
		});

		it("cannot delete another users category", async () => {
			const userA = await createTestUser(ctx, { github_id: 300001 });
			const userB = await createTestUser(ctx, { github_id: 300002 });

			await createTestCategory(ctx, userA.id, "a-category", "root");

			const appB = createTestApp(ctx, userB.id);
			const res = await appB.request("/api/blog/categories/a-category", {
				method: "DELETE",
			});

			expect(res.status).toBe(404);
		});
	});
});
