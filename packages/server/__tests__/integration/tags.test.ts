import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { AppContext } from "@blog/schema";
import * as schema from "@blog/schema/database";
import { Hono } from "hono";
import { tagsRouter } from "../../src/routes/tags";
import { type TestContext, createTestContext, createTestPost, createTestUser } from "../setup";

type TagWithCount = { tag: string; count: number };
type TagsListResponse = { tags: TagWithCount[] };
type PostTagsResponse = { tags: string[] };

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

	app.route("/api/blog/tags", tagsRouter);

	return app;
};

const addTagsToPost = async (ctx: TestContext, postId: number, tags: string[]) => {
	for (const tag of tags) {
		await ctx.db.insert(schema.tags).values({ post_id: postId, tag });
	}
};

describe("Tags Route Integration", () => {
	let ctx: TestContext;

	beforeEach(() => {
		ctx = createTestContext();
	});

	afterEach(() => {
		ctx.close();
	});

	describe("GET /api/blog/tags", () => {
		it("lists all tags with counts", async () => {
			const user = await createTestUser(ctx);
			const post1 = await createTestPost(ctx, user.id);
			const post2 = await createTestPost(ctx, user.id);
			const post3 = await createTestPost(ctx, user.id);

			await addTagsToPost(ctx, post1.id, ["javascript", "react"]);
			await addTagsToPost(ctx, post2.id, ["javascript", "nodejs"]);
			await addTagsToPost(ctx, post3.id, ["javascript"]);

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/tags");

			expect(res.status).toBe(200);
			const body = (await res.json()) as TagsListResponse;

			const jsTag = body.tags.find(t => t.tag === "javascript");
			expect(jsTag?.count).toBe(3);

			const reactTag = body.tags.find(t => t.tag === "react");
			expect(reactTag?.count).toBe(1);

			const nodeTag = body.tags.find(t => t.tag === "nodejs");
			expect(nodeTag?.count).toBe(1);
		});

		it("returns empty array when no tags", async () => {
			const user = await createTestUser(ctx);
			await createTestPost(ctx, user.id);

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/tags");

			expect(res.status).toBe(200);
			const body = (await res.json()) as TagsListResponse;
			expect(body.tags).toEqual([]);
		});

		it("only counts tags for current users posts", async () => {
			const userA = await createTestUser(ctx, { github_id: 100001 });
			const userB = await createTestUser(ctx, { github_id: 100002 });

			const postA = await createTestPost(ctx, userA.id);
			const postB = await createTestPost(ctx, userB.id);

			await addTagsToPost(ctx, postA.id, ["shared-tag"]);
			await addTagsToPost(ctx, postB.id, ["shared-tag", "b-only"]);

			const appA = createTestApp(ctx, userA.id);
			const resA = await appA.request("/api/blog/tags");
			const bodyA = (await resA.json()) as TagsListResponse;

			expect(bodyA.tags).toHaveLength(1);
			expect(bodyA.tags[0]?.tag).toBe("shared-tag");
			expect(bodyA.tags[0]?.count).toBe(1);
		});
	});

	describe("GET /api/blog/tags/posts/:uuid/tags", () => {
		it("gets posts tags", async () => {
			const user = await createTestUser(ctx);
			const post = await createTestPost(ctx, user.id);
			await addTagsToPost(ctx, post.id, ["tag1", "tag2", "tag3"]);

			const app = createTestApp(ctx, user.id);
			const res = await app.request(`/api/blog/tags/posts/${post.uuid}/tags`);

			expect(res.status).toBe(200);
			const body = (await res.json()) as PostTagsResponse;
			expect(body.tags.sort()).toEqual(["tag1", "tag2", "tag3"]);
		});

		it("returns empty array for post with no tags", async () => {
			const user = await createTestUser(ctx);
			const post = await createTestPost(ctx, user.id);

			const app = createTestApp(ctx, user.id);
			const res = await app.request(`/api/blog/tags/posts/${post.uuid}/tags`);

			expect(res.status).toBe(200);
			const body = (await res.json()) as PostTagsResponse;
			expect(body.tags).toEqual([]);
		});

		it("returns 404 for non-existent post", async () => {
			const user = await createTestUser(ctx);

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/tags/posts/00000000-0000-0000-0000-000000000000/tags");

			expect(res.status).toBe(404);
		});

		it("cannot get another users post tags", async () => {
			const userA = await createTestUser(ctx, { github_id: 200001 });
			const userB = await createTestUser(ctx, { github_id: 200002 });

			const postA = await createTestPost(ctx, userA.id);
			await addTagsToPost(ctx, postA.id, ["secret"]);

			const appB = createTestApp(ctx, userB.id);
			const res = await appB.request(`/api/blog/tags/posts/${postA.uuid}/tags`);

			expect(res.status).toBe(404);
		});
	});

	describe("PUT /api/blog/tags/posts/:uuid/tags", () => {
		it("replaces all tags", async () => {
			const user = await createTestUser(ctx);
			const post = await createTestPost(ctx, user.id);
			await addTagsToPost(ctx, post.id, ["old1", "old2"]);

			const app = createTestApp(ctx, user.id);
			const res = await app.request(`/api/blog/tags/posts/${post.uuid}/tags`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tags: ["new1", "new2", "new3"] }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as PostTagsResponse;
			expect(body.tags.sort()).toEqual(["new1", "new2", "new3"]);

			const getRes = await app.request(`/api/blog/tags/posts/${post.uuid}/tags`);
			const getBody = (await getRes.json()) as PostTagsResponse;
			expect(getBody.tags.sort()).toEqual(["new1", "new2", "new3"]);
		});

		it("clears all tags with empty array", async () => {
			const user = await createTestUser(ctx);
			const post = await createTestPost(ctx, user.id);
			await addTagsToPost(ctx, post.id, ["tag1", "tag2"]);

			const app = createTestApp(ctx, user.id);
			const res = await app.request(`/api/blog/tags/posts/${post.uuid}/tags`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tags: [] }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as PostTagsResponse;
			expect(body.tags).toEqual([]);
		});

		it("deduplicates tags", async () => {
			const user = await createTestUser(ctx);
			const post = await createTestPost(ctx, user.id);

			const app = createTestApp(ctx, user.id);
			const res = await app.request(`/api/blog/tags/posts/${post.uuid}/tags`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tags: ["dup", "dup", "unique"] }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as PostTagsResponse;
			expect(body.tags.sort()).toEqual(["dup", "unique"]);
		});

		it("returns 404 for non-existent post", async () => {
			const user = await createTestUser(ctx);

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/tags/posts/00000000-0000-0000-0000-000000000000/tags", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tags: ["tag"] }),
			});

			expect(res.status).toBe(404);
		});
	});

	describe("POST /api/blog/tags/posts/:uuid/tags", () => {
		it("adds new tags to existing", async () => {
			const user = await createTestUser(ctx);
			const post = await createTestPost(ctx, user.id);
			await addTagsToPost(ctx, post.id, ["existing"]);

			const app = createTestApp(ctx, user.id);
			const res = await app.request(`/api/blog/tags/posts/${post.uuid}/tags`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tags: ["new1", "new2"] }),
			});

			expect(res.status).toBe(201);
			const body = (await res.json()) as PostTagsResponse;
			expect(body.tags.sort()).toEqual(["existing", "new1", "new2"]);
		});

		it("ignores duplicate tags", async () => {
			const user = await createTestUser(ctx);
			const post = await createTestPost(ctx, user.id);
			await addTagsToPost(ctx, post.id, ["existing"]);

			const app = createTestApp(ctx, user.id);
			const res = await app.request(`/api/blog/tags/posts/${post.uuid}/tags`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tags: ["existing", "new"] }),
			});

			expect(res.status).toBe(201);
			const body = (await res.json()) as PostTagsResponse;
			expect(body.tags.sort()).toEqual(["existing", "new"]);
		});

		it("adds tags to post with no existing tags", async () => {
			const user = await createTestUser(ctx);
			const post = await createTestPost(ctx, user.id);

			const app = createTestApp(ctx, user.id);
			const res = await app.request(`/api/blog/tags/posts/${post.uuid}/tags`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tags: ["first", "second"] }),
			});

			expect(res.status).toBe(201);
			const body = (await res.json()) as PostTagsResponse;
			expect(body.tags.sort()).toEqual(["first", "second"]);
		});

		it("returns 404 for non-existent post", async () => {
			const user = await createTestUser(ctx);

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/tags/posts/00000000-0000-0000-0000-000000000000/tags", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tags: ["tag"] }),
			});

			expect(res.status).toBe(404);
		});
	});

	describe("DELETE /api/blog/tags/posts/:uuid/tags/:tag", () => {
		it("removes tag from post", async () => {
			const user = await createTestUser(ctx);
			const post = await createTestPost(ctx, user.id);
			await addTagsToPost(ctx, post.id, ["keep", "remove"]);

			const app = createTestApp(ctx, user.id);
			const res = await app.request(`/api/blog/tags/posts/${post.uuid}/tags/remove`, {
				method: "DELETE",
			});

			expect(res.status).toBe(204);

			const getRes = await app.request(`/api/blog/tags/posts/${post.uuid}/tags`);
			const body = (await getRes.json()) as PostTagsResponse;
			expect(body.tags).toEqual(["keep"]);
		});

		it("returns 404 for non-existent tag on post", async () => {
			const user = await createTestUser(ctx);
			const post = await createTestPost(ctx, user.id);
			await addTagsToPost(ctx, post.id, ["exists"]);

			const app = createTestApp(ctx, user.id);
			const res = await app.request(`/api/blog/tags/posts/${post.uuid}/tags/nonexistent`, {
				method: "DELETE",
			});

			expect(res.status).toBe(404);
		});

		it("returns 404 for non-existent post", async () => {
			const user = await createTestUser(ctx);

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/tags/posts/00000000-0000-0000-0000-000000000000/tags/any", {
				method: "DELETE",
			});

			expect(res.status).toBe(404);
		});

		it("cannot delete tag from another users post", async () => {
			const userA = await createTestUser(ctx, { github_id: 300001 });
			const userB = await createTestUser(ctx, { github_id: 300002 });

			const postA = await createTestPost(ctx, userA.id);
			await addTagsToPost(ctx, postA.id, ["target"]);

			const appB = createTestApp(ctx, userB.id);
			const res = await appB.request(`/api/blog/tags/posts/${postA.uuid}/tags/target`, {
				method: "DELETE",
			});

			expect(res.status).toBe(404);

			const appA = createTestApp(ctx, userA.id);
			const getRes = await appA.request(`/api/blog/tags/posts/${postA.uuid}/tags`);
			const body = (await getRes.json()) as PostTagsResponse;
			expect(body.tags).toContain("target");
		});
	});
});
