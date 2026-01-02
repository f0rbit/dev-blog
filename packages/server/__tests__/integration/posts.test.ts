import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { type PostCreate, type PostUpdate, tags } from "@blog/schema";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { postsRouter } from "../../src/routes/posts";
import { type PostService, createPostService } from "../../src/services/posts";
import { type TestContext, createTestApp as createSharedTestApp, createTestCategory, createTestContext, createTestUser, createUnauthenticatedTestApp } from "../setup";

/** Helper to build PostCreate with defaults for required fields */
const post = (overrides: Partial<PostCreate> & Pick<PostCreate, "slug" | "title" | "content">): PostCreate => ({
	format: "md",
	category: "root",
	tags: [],
	...overrides,
});

describe("PostService", () => {
	let ctx: ReturnType<typeof createTestContext>;
	let service: PostService;
	let userId: number;

	beforeEach(async () => {
		ctx = createTestContext();
		service = createPostService({ db: ctx.db, corpus: ctx.corpus });
		const user = await createTestUser(ctx);
		userId = user.id;
	});

	afterEach(() => {
		ctx.close();
	});

	describe("create", () => {
		it("creates post with UUID", async () => {
			const input = post({ slug: "my-first-post", title: "My First Post", content: "Hello world!" });

			const result = await service.create(userId, input);

			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
			expect(result.value.slug).toBe("my-first-post");
			expect(result.value.title).toBe("My First Post");
			expect(result.value.content).toBe("Hello world!");
		});

		it("stores content in Corpus", async () => {
			const input = post({ slug: "test-post", title: "Test", content: "Content" });

			const result = await service.create(userId, input);
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.corpus_version).toBeDefined();
			expect(typeof result.value.corpus_version).toBe("string");
			expect(result.value.corpus_version?.length).toBeGreaterThan(0);
		});

		it("handles slug conflicts", async () => {
			const input = post({ slug: "duplicate-slug", title: "First Post", content: "Content" });

			const first = await service.create(userId, input);
			expect(first.ok).toBe(true);

			const second = await service.create(userId, { ...input, title: "Second Post" });
			expect(second.ok).toBe(false);
			if (second.ok) return;

			expect(second.error.type).toBe("slug_conflict");
			if (second.error.type === "slug_conflict") {
				expect(second.error.slug).toBe("duplicate-slug");
			}
		});

		it("creates with tags", async () => {
			const input = post({ slug: "tagged-post", title: "Tagged", content: "Content", tags: ["typescript", "testing", "vitest"] });

			const result = await service.create(userId, input);
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.tags).toEqual(["typescript", "testing", "vitest"]);
		});

		it("creates as draft when publish_at is null", async () => {
			const input = post({ slug: "draft-post", title: "Draft", content: "WIP", publish_at: null });

			const result = await service.create(userId, input);
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.publish_at).toBeNull();
		});

		it("creates as published with past publish_at", async () => {
			const pastDate = new Date("2020-01-01");
			const input = post({ slug: "published-post", title: "Published", content: "Content", publish_at: pastDate });

			const result = await service.create(userId, input);
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.publish_at?.getTime()).toBe(pastDate.getTime());
		});

		it("creates as scheduled with future publish_at", async () => {
			const futureDate = new Date("2099-12-31");
			const input = post({ slug: "scheduled-post", title: "Scheduled", content: "Content", publish_at: futureDate });

			const result = await service.create(userId, input);
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.publish_at?.getTime()).toBe(futureDate.getTime());
		});

		it("creates with category", async () => {
			const input = post({ slug: "categorized", title: "Categorized Post", content: "Content", category: "tutorials" });

			const result = await service.create(userId, input);
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.category).toBe("tutorials");
		});

		it("creates with project_ids", async () => {
			const input = post({ slug: "project-post", title: "Project Post", content: "Content", project_ids: ["proj-123"] });

			const result = await service.create(userId, input);
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.project_ids).toEqual(["proj-123"]);
		});

		it("creates with adoc format", async () => {
			const input = post({ slug: "asciidoc-post", title: "Asciidoc Post", content: "= Title\n\nContent", format: "adoc" });

			const result = await service.create(userId, input);
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.format).toBe("adoc");
		});

		it("defaults category to root", async () => {
			const input = post({ slug: "no-category", title: "No Category", content: "Content" });

			const result = await service.create(userId, input);
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.category).toBe("root");
		});

		it("allows same slug for different users", async () => {
			const user2 = await createTestUser(ctx, { username: "testuser2" });

			const input = post({ slug: "same-slug", title: "Post", content: "Content" });

			const first = await service.create(userId, input);
			const second = await service.create(user2.id, input);

			expect(first.ok).toBe(true);
			expect(second.ok).toBe(true);
		});
	});

	describe("update", () => {
		let postUuid: string;

		beforeEach(async () => {
			const createResult = await service.create(
				userId,
				post({
					slug: "update-test",
					title: "Original Title",
					content: "Original content",
					tags: ["original"],
				})
			);
			expect(createResult.ok).toBe(true);
			if (createResult.ok) {
				postUuid = createResult.value.uuid;
			}
		});

		it("updates metadata only without new Corpus version", async () => {
			const original = await service.getByUuid(userId, postUuid);
			expect(original.ok).toBe(true);
			if (!original.ok) return;
			const originalVersion = original.value.corpus_version;

			const input: PostUpdate = {
				category: "updates",
			};

			const result = await service.update(userId, postUuid, input);
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.category).toBe("updates");
			expect(result.value.corpus_version).toBe(originalVersion);
		});

		it("updates content and creates new Corpus version with parent", async () => {
			const original = await service.getByUuid(userId, postUuid);
			expect(original.ok).toBe(true);
			if (!original.ok) return;
			const originalVersion = original.value.corpus_version;

			const input: PostUpdate = {
				title: "Updated Title",
				content: "Updated content",
			};

			const result = await service.update(userId, postUuid, input);
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.title).toBe("Updated Title");
			expect(result.value.content).toBe("Updated content");
			expect(result.value.corpus_version).not.toBe(originalVersion);

			const versions = await service.listVersions(userId, postUuid);
			expect(versions.ok).toBe(true);
			if (!versions.ok) return;

			expect(versions.value.length).toBe(2);
			const latestVersion = versions.value.find(v => v.hash === result.value.corpus_version);
			expect(latestVersion?.parent).toBe(originalVersion);
		});

		it("can change slug", async () => {
			const input: PostUpdate = {
				slug: "new-slug",
			};

			const result = await service.update(userId, postUuid, input);
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.slug).toBe("new-slug");

			const getByNewSlug = await service.getBySlug(userId, "new-slug");
			expect(getByNewSlug.ok).toBe(true);
		});

		it("returns slug conflict error for existing slug", async () => {
			await service.create(
				userId,
				post({
					slug: "existing-slug",
					title: "Existing",
					content: "Content",
				})
			);

			const input: PostUpdate = {
				slug: "existing-slug",
			};

			const result = await service.update(userId, postUuid, input);
			expect(result.ok).toBe(false);
			if (result.ok) return;

			expect(result.error.type).toBe("slug_conflict");
		});

		it("updates tags", async () => {
			const input: PostUpdate = {
				tags: ["new-tag-1", "new-tag-2"],
			};

			const result = await service.update(userId, postUuid, input);
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.tags).toEqual(["new-tag-1", "new-tag-2"]);
		});

		it("can clear all tags", async () => {
			const input: PostUpdate = {
				tags: [],
			};

			const result = await service.update(userId, postUuid, input);
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.tags).toEqual([]);
		});

		it("can update archived status", async () => {
			const input: PostUpdate = {
				archived: true,
			};

			const result = await service.update(userId, postUuid, input);
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.archived).toBe(true);
		});

		it("can update publish_at", async () => {
			const newDate = new Date("2025-06-15");
			const input: PostUpdate = {
				publish_at: newDate,
			};

			const result = await service.update(userId, postUuid, input);
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.publish_at?.getTime()).toBe(newDate.getTime());
		});

		it("returns not_found for non-existent post", async () => {
			const result = await service.update(userId, "non-existent-uuid", { title: "New" });
			expect(result.ok).toBe(false);
			if (result.ok) return;

			expect(result.error.type).toBe("not_found");
		});

		it("cannot update another users post", async () => {
			const user2 = await createTestUser(ctx, { username: "testuser2" });
			const result = await service.update(user2.id, postUuid, { title: "Hack" });
			expect(result.ok).toBe(false);
		});

		it("updates description", async () => {
			const input: PostUpdate = {
				description: "New description",
			};

			const result = await service.update(userId, postUuid, input);
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.description).toBe("New description");
		});

		it("updates format", async () => {
			const input: PostUpdate = {
				format: "adoc",
			};

			const result = await service.update(userId, postUuid, input);
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.format).toBe("adoc");
		});
	});

	describe("versioning", () => {
		let postUuid: string;

		beforeEach(async () => {
			const createResult = await service.create(
				userId,
				post({
					slug: "versioned-post",
					title: "V1",
					content: "First version",
				})
			);
			expect(createResult.ok).toBe(true);
			if (createResult.ok) {
				postUuid = createResult.value.uuid;
			}
		});

		it("lists all versions", async () => {
			await service.update(userId, postUuid, { title: "V2", content: "Second version" });
			await service.update(userId, postUuid, { title: "V3", content: "Third version" });

			const result = await service.listVersions(userId, postUuid);
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.length).toBe(3);
		});

		it("gets specific version content", async () => {
			const original = await service.getByUuid(userId, postUuid);
			expect(original.ok).toBe(true);
			if (!original.ok) return;
			if (!original.value.corpus_version) return;
			const v1Hash = original.value.corpus_version;

			await service.update(userId, postUuid, { title: "V2", content: "Second version" });

			const v1Content = await service.getVersion(userId, postUuid, v1Hash);
			expect(v1Content.ok).toBe(true);
			if (!v1Content.ok) return;

			expect(v1Content.value.title).toBe("V1");
			expect(v1Content.value.content).toBe("First version");
		});

		it("restores old version and creates new version", async () => {
			const original = await service.getByUuid(userId, postUuid);
			expect(original.ok).toBe(true);
			if (!original.ok) return;
			if (!original.value.corpus_version) return;
			const v1Hash = original.value.corpus_version;

			await service.update(userId, postUuid, { title: "V2", content: "Second version" });
			const afterUpdate = await service.getByUuid(userId, postUuid);
			expect(afterUpdate.ok).toBe(true);
			if (!afterUpdate.ok) return;
			if (!afterUpdate.value.corpus_version) return;
			const v2Hash = afterUpdate.value.corpus_version;

			const restored = await service.restoreVersion(userId, postUuid, v1Hash);
			expect(restored.ok).toBe(true);
			if (!restored.ok) return;

			expect(restored.value.title).toBe("V1");
			expect(restored.value.content).toBe("First version");
			expect(restored.value.corpus_version).not.toBe(v2Hash);

			const versions = await service.listVersions(userId, postUuid);
			expect(versions.ok).toBe(true);
			if (!versions.ok) return;

			const hasV2Parent = versions.value.some(v => v.parent === v2Hash);
			expect(hasV2Parent).toBe(true);
		});

		it("parent chain is maintained", async () => {
			const v1 = await service.getByUuid(userId, postUuid);
			expect(v1.ok).toBe(true);
			if (!v1.ok) return;

			await service.update(userId, postUuid, { title: "V2" });
			const v2 = await service.getByUuid(userId, postUuid);
			expect(v2.ok).toBe(true);
			if (!v2.ok) return;

			await service.update(userId, postUuid, { title: "V3" });
			const v3 = await service.getByUuid(userId, postUuid);
			expect(v3.ok).toBe(true);
			if (!v3.ok) return;

			const versions = await service.listVersions(userId, postUuid);
			expect(versions.ok).toBe(true);
			if (!versions.ok) return;

			const versionMap = new Map(versions.value.map(v => [v.hash, v]));

			if (!v1.value.corpus_version || !v2.value.corpus_version || !v3.value.corpus_version) return;
			const ver1 = versionMap.get(v1.value.corpus_version);
			const ver2 = versionMap.get(v2.value.corpus_version);
			const ver3 = versionMap.get(v3.value.corpus_version);

			expect(ver1?.parent).toBeNull();
			expect(ver2?.parent).toBe(v1.value.corpus_version);
			expect(ver3?.parent).toBe(v2.value.corpus_version);
		});

		it("returns not_found for non-existent version", async () => {
			const result = await service.getVersion(userId, postUuid, "nonexistent");
			expect(result.ok).toBe(false);
			if (result.ok) return;

			expect(result.error.type).toBe("corpus_error");
		});

		it("returns not_found when listing versions of non-existent post", async () => {
			const result = await service.listVersions(userId, "non-existent-uuid");
			expect(result.ok).toBe(false);
			if (result.ok) return;

			expect(result.error.type).toBe("not_found");
		});
	});

	describe("publishing", () => {
		beforeEach(async () => {
			await service.create(userId, post({ slug: "draft-1", title: "Draft 1", content: "Draft content", publish_at: null }));
			await service.create(userId, post({ slug: "draft-2", title: "Draft 2", content: "Draft content", publish_at: null }));
			await service.create(userId, post({ slug: "published-1", title: "Published 1", content: "Published content", publish_at: new Date("2020-01-01") }));
			await service.create(userId, post({ slug: "published-2", title: "Published 2", content: "Published content", publish_at: new Date("2020-06-01") }));
			await service.create(userId, post({ slug: "scheduled-1", title: "Scheduled 1", content: "Scheduled content", publish_at: new Date("2099-12-01") }));
			await service.create(userId, post({ slug: "scheduled-2", title: "Scheduled 2", content: "Scheduled content", publish_at: new Date("2099-12-31") }));
		});

		it("filters by status=draft (null publish_at)", async () => {
			const result = await service.list(userId, {
				status: "draft",
				limit: 100,
				offset: 0,
				sort: "updated",
				archived: false,
			});

			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.posts.length).toBe(2);
			for (const p of result.value.posts) {
				expect(p.publish_at).toBeNull();
			}
		});

		it("filters by status=published (past publish_at)", async () => {
			const result = await service.list(userId, {
				status: "published",
				limit: 100,
				offset: 0,
				sort: "updated",
				archived: false,
			});

			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.posts.length).toBe(2);
			for (const p of result.value.posts) {
				expect(p.publish_at).not.toBeNull();
				if (p.publish_at) {
					expect(p.publish_at.getTime()).toBeLessThanOrEqual(Date.now());
				}
			}
		});

		it("filters by status=scheduled (future publish_at)", async () => {
			const result = await service.list(userId, {
				status: "scheduled",
				limit: 100,
				offset: 0,
				sort: "updated",
				archived: false,
			});

			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.posts.length).toBe(2);
			for (const p of result.value.posts) {
				expect(p.publish_at).not.toBeNull();
				if (p.publish_at) {
					expect(p.publish_at.getTime()).toBeGreaterThan(Date.now());
				}
			}
		});

		it("returns all statuses with status=all", async () => {
			const result = await service.list(userId, {
				status: "all",
				limit: 100,
				offset: 0,
				sort: "updated",
				archived: false,
			});

			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.posts.length).toBe(6);
		});

		it("updates publish_at to publish immediately", async () => {
			const draft = await service.getBySlug(userId, "draft-1");
			expect(draft.ok).toBe(true);
			if (!draft.ok) return;

			const now = new Date();
			const result = await service.update(userId, draft.value.uuid, {
				publish_at: now,
			});

			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.publish_at).not.toBeNull();
			if (result.value.publish_at) {
				expect(Math.abs(result.value.publish_at.getTime() - now.getTime())).toBeLessThan(1000);
			}
		});

		it("schedules by setting future publish_at", async () => {
			const draft = await service.getBySlug(userId, "draft-1");
			expect(draft.ok).toBe(true);
			if (!draft.ok) return;

			const futureDate = new Date("2099-06-15");
			const result = await service.update(userId, draft.value.uuid, {
				publish_at: futureDate,
			});

			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.publish_at?.getTime()).toBe(futureDate.getTime());
		});

		it("unpublishes by setting publish_at to null", async () => {
			const published = await service.getBySlug(userId, "published-1");
			expect(published.ok).toBe(true);
			if (!published.ok) return;

			const result = await service.update(userId, published.value.uuid, {
				publish_at: null,
			});

			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.publish_at).toBeNull();
		});
	});

	describe("filtering", () => {
		beforeEach(async () => {
			await createTestCategory(ctx, userId, "tech", "root");
			await createTestCategory(ctx, userId, "frontend", "tech");
			await createTestCategory(ctx, userId, "backend", "tech");
			await createTestCategory(ctx, userId, "lifestyle", "root");

			await service.create(userId, post({ slug: "post-root", title: "Root Post", content: "Content", category: "root", tags: ["general"], project_ids: ["proj-a"] }));
			await service.create(userId, post({ slug: "post-tech", title: "Tech Post", content: "Content", category: "tech", tags: ["coding"], project_ids: ["proj-a"] }));
			await service.create(userId, post({ slug: "post-frontend", title: "Frontend Post", content: "Content", category: "frontend", tags: ["react", "coding"], project_ids: ["proj-b"] }));
			await service.create(userId, post({ slug: "post-backend", title: "Backend Post", content: "Content", category: "backend", tags: ["nodejs", "coding"], project_ids: ["proj-b"] }));
			await service.create(userId, post({ slug: "post-lifestyle", title: "Lifestyle Post", content: "Content", category: "lifestyle", tags: ["travel"] }));

			const archivedResult = await service.create(userId, post({ slug: "post-archived", title: "Archived Post", content: "Content", category: "tech" }));
			if (archivedResult.ok) {
				await service.update(userId, archivedResult.value.uuid, { archived: true });
			}
		});

		it("filters by category including children", async () => {
			const result = await service.list(userId, {
				category: "tech",
				limit: 100,
				offset: 0,
				sort: "updated",
				archived: false,
				status: "all",
			});

			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.posts.length).toBe(3);
			const categories = result.value.posts.map(p => p.category);
			expect(categories).toContain("tech");
			expect(categories).toContain("frontend");
			expect(categories).toContain("backend");
		});

		it("filters by tag", async () => {
			const result = await service.list(userId, {
				tag: "coding",
				limit: 100,
				offset: 0,
				sort: "updated",
				archived: false,
				status: "all",
			});

			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.posts.length).toBe(3);
			for (const p of result.value.posts) {
				expect(p.tags).toContain("coding");
			}
		});

		it("filters by project", async () => {
			const result = await service.list(userId, {
				project: "proj-b",
				limit: 100,
				offset: 0,
				sort: "updated",
				archived: false,
				status: "all",
			});

			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.posts.length).toBe(2);
			for (const p of result.value.posts) {
				expect(p.project_ids).toContain("proj-b");
			}
		});

		it("excludes archived by default", async () => {
			const result = await service.list(userId, {
				limit: 100,
				offset: 0,
				sort: "updated",
				archived: false,
				status: "all",
			});

			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.posts.length).toBe(5);
			for (const p of result.value.posts) {
				expect(p.archived).toBe(false);
			}
		});

		it("includes archived when requested", async () => {
			const result = await service.list(userId, {
				limit: 100,
				offset: 0,
				sort: "updated",
				archived: true,
				status: "all",
			});

			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.posts.length).toBe(6);
			expect(result.value.posts.some(p => p.archived)).toBe(true);
		});

		it("pagination with limit", async () => {
			const result = await service.list(userId, {
				limit: 2,
				offset: 0,
				sort: "updated",
				archived: false,
				status: "all",
			});

			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.posts.length).toBe(2);
			expect(result.value.per_page).toBe(2);
			expect(result.value.total_posts).toBe(5);
			expect(result.value.total_pages).toBe(3);
			expect(result.value.current_page).toBe(1);
		});

		it("pagination with offset", async () => {
			const result = await service.list(userId, {
				limit: 2,
				offset: 2,
				sort: "updated",
				archived: false,
				status: "all",
			});

			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.posts.length).toBe(2);
			expect(result.value.current_page).toBe(2);
		});

		it("combines multiple filters", async () => {
			const result = await service.list(userId, {
				category: "tech",
				tag: "coding",
				limit: 100,
				offset: 0,
				sort: "updated",
				archived: false,
				status: "all",
			});

			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.posts.length).toBe(3);
		});

		it("returns empty list when no posts match tag", async () => {
			const result = await service.list(userId, {
				tag: "nonexistent",
				limit: 100,
				offset: 0,
				sort: "updated",
				archived: false,
				status: "all",
			});

			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.posts).toEqual([]);
		});
	});

	describe("delete", () => {
		let postUuid: string;

		beforeEach(async () => {
			const createResult = await service.create(
				userId,
				post({
					slug: "delete-test",
					title: "Delete Me",
					content: "Content",
					tags: ["tag1", "tag2"],
				})
			);
			expect(createResult.ok).toBe(true);
			if (createResult.ok) {
				postUuid = createResult.value.uuid;
			}
		});

		it("removes post from D1 and Corpus", async () => {
			const result = await service.delete(userId, postUuid);
			expect(result.ok).toBe(true);

			const getResult = await service.getByUuid(userId, postUuid);
			expect(getResult.ok).toBe(false);
		});

		it("returns error for non-existent post", async () => {
			const result = await service.delete(userId, "non-existent-uuid");
			expect(result.ok).toBe(false);
			if (result.ok) return;

			expect(result.error.type).toBe("not_found");
		});

		it("cascade deletes tags", async () => {
			const db = drizzle(ctx.sqliteDb);

			const tagsBefore = await db.select().from(tags);
			expect(tagsBefore.length).toBeGreaterThan(0);

			await service.delete(userId, postUuid);

			const tagsAfter = await db.select().from(tags);
			expect(tagsAfter.length).toBe(0);
		});

		it("cannot delete another users post", async () => {
			const user2 = await createTestUser(ctx, { username: "testuser2" });
			const result = await service.delete(user2.id, postUuid);
			expect(result.ok).toBe(false);

			const stillExists = await service.getByUuid(userId, postUuid);
			expect(stillExists.ok).toBe(true);
		});
	});

	describe("getBySlug", () => {
		it("retrieves post by slug", async () => {
			await service.create(userId, post({ slug: "find-me", title: "Find Me", content: "Content" }));

			const result = await service.getBySlug(userId, "find-me");
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.slug).toBe("find-me");
			expect(result.value.title).toBe("Find Me");
		});

		it("returns not_found for non-existent slug", async () => {
			const result = await service.getBySlug(userId, "nonexistent");
			expect(result.ok).toBe(false);
			if (result.ok) return;

			expect(result.error.type).toBe("not_found");
		});

		it("cannot find another users post", async () => {
			await service.create(userId, post({ slug: "private-post", title: "Private", content: "Content" }));

			const user2 = await createTestUser(ctx, { username: "testuser2" });
			const result = await service.getBySlug(user2.id, "private-post");
			expect(result.ok).toBe(false);
		});
	});

	describe("getByUuid", () => {
		it("retrieves post by uuid", async () => {
			const createResult = await service.create(userId, post({ slug: "uuid-test", title: "UUID Test", content: "Content" }));
			expect(createResult.ok).toBe(true);
			if (!createResult.ok) return;

			const result = await service.getByUuid(userId, createResult.value.uuid);
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.uuid).toBe(createResult.value.uuid);
			expect(result.value.title).toBe("UUID Test");
		});

		it("returns not_found for non-existent uuid", async () => {
			const result = await service.getByUuid(userId, "non-existent-uuid");
			expect(result.ok).toBe(false);
			if (result.ok) return;

			expect(result.error.type).toBe("not_found");
		});
	});

	describe("project associations", () => {
		it("creates post with multiple project_ids", async () => {
			const result = await service.create(
				userId,
				post({
					slug: "multi-project",
					title: "Multi Project Post",
					content: "Content",
					project_ids: ["proj-a", "proj-b", "proj-c"],
				})
			);

			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.value.project_ids).toEqual(["proj-a", "proj-b", "proj-c"]);
		});

		it("creates post with no projects", async () => {
			const result = await service.create(
				userId,
				post({
					slug: "no-project",
					title: "No Project Post",
					content: "Content",
				})
			);

			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.value.project_ids).toEqual([]);
		});

		it("updates project associations", async () => {
			const createResult = await service.create(
				userId,
				post({
					slug: "update-projects",
					title: "Post",
					content: "Content",
					project_ids: ["proj-a"],
				})
			);
			expect(createResult.ok).toBe(true);
			if (!createResult.ok) return;

			const updateResult = await service.update(userId, createResult.value.uuid, {
				project_ids: ["proj-b", "proj-c"],
			});
			expect(updateResult.ok).toBe(true);
			if (!updateResult.ok) return;
			expect(updateResult.value.project_ids).toEqual(["proj-b", "proj-c"]);
		});

		it("clears all project associations", async () => {
			const createResult = await service.create(
				userId,
				post({
					slug: "clear-projects",
					title: "Post",
					content: "Content",
					project_ids: ["proj-a", "proj-b"],
				})
			);
			expect(createResult.ok).toBe(true);
			if (!createResult.ok) return;

			const updateResult = await service.update(userId, createResult.value.uuid, {
				project_ids: [],
			});
			expect(updateResult.ok).toBe(true);
			if (!updateResult.ok) return;
			expect(updateResult.value.project_ids).toEqual([]);
		});

		it("filters posts by project", async () => {
			await service.create(userId, post({ slug: "proj-a-only", title: "A Only", content: "Content", project_ids: ["proj-a"] }));
			await service.create(userId, post({ slug: "proj-a-and-b", title: "A and B", content: "Content", project_ids: ["proj-a", "proj-b"] }));
			await service.create(userId, post({ slug: "proj-b-only", title: "B Only", content: "Content", project_ids: ["proj-b"] }));

			const resultA = await service.list(userId, {
				project: "proj-a",
				limit: 100,
				offset: 0,
				sort: "updated",
				archived: false,
				status: "all",
			});
			expect(resultA.ok).toBe(true);
			if (!resultA.ok) return;
			expect(resultA.value.posts.length).toBe(2);

			const resultB = await service.list(userId, {
				project: "proj-b",
				limit: 100,
				offset: 0,
				sort: "updated",
				archived: false,
				status: "all",
			});
			expect(resultB.ok).toBe(true);
			if (!resultB.ok) return;
			expect(resultB.value.posts.length).toBe(2);
		});

		it("preserves project_ids when fetching by uuid", async () => {
			const createResult = await service.create(
				userId,
				post({
					slug: "fetch-projects",
					title: "Post",
					content: "Content",
					project_ids: ["proj-x", "proj-y"],
				})
			);
			expect(createResult.ok).toBe(true);
			if (!createResult.ok) return;

			const fetchResult = await service.getByUuid(userId, createResult.value.uuid);
			expect(fetchResult.ok).toBe(true);
			if (!fetchResult.ok) return;
			expect(fetchResult.value.project_ids).toEqual(["proj-x", "proj-y"]);
		});

		it("preserves project_ids when fetching by slug", async () => {
			const createResult = await service.create(
				userId,
				post({
					slug: "fetch-projects-slug",
					title: "Post",
					content: "Content",
					project_ids: ["proj-m", "proj-n"],
				})
			);
			expect(createResult.ok).toBe(true);
			if (!createResult.ok) return;

			const fetchResult = await service.getBySlug(userId, "fetch-projects-slug");
			expect(fetchResult.ok).toBe(true);
			if (!fetchResult.ok) return;
			expect(fetchResult.value.project_ids).toEqual(["proj-m", "proj-n"]);
		});
	});
});

type Post = {
	uuid: string;
	slug: string;
	title: string;
	content: string;
	format: string;
	category: string;
	tags: string[];
	project_ids: string[];
	archived: boolean;
	publish_at: string | null;
	description: string | null;
	corpus_version: string | null;
	created_at: string;
	updated_at: string;
};

type PostListResponse = {
	posts: Post[];
	total_posts: number;
	total_pages: number;
	current_page: number;
	per_page: number;
};

type ErrorResponse = { code: string; message: string };

const createTestApp = (ctx: TestContext, userId: number) => createSharedTestApp(ctx, postsRouter, "/api/blog/posts", { userId });

const createUnauthenticatedApp = (ctx: TestContext) => createUnauthenticatedTestApp(ctx, postsRouter, "/api/blog/posts");

describe("Posts Routes (HTTP)", () => {
	let ctx: TestContext;

	beforeEach(() => {
		ctx = createTestContext();
	});

	afterEach(() => {
		ctx.close();
	});

	describe("GET /api/blog/posts", () => {
		it("requires authentication", async () => {
			const app = createUnauthenticatedApp(ctx);
			const res = await app.request("/api/blog/posts");

			expect(res.status).toBe(401);
			const body = (await res.json()) as ErrorResponse;
			expect(body.code).toBe("UNAUTHORIZED");
		});

		it("returns posts list", async () => {
			const user = await createTestUser(ctx);
			const service = createPostService({ db: ctx.db, corpus: ctx.corpus });
			await service.create(user.id, post({ slug: "first-post", title: "First Post", content: "Content 1" }));
			await service.create(user.id, post({ slug: "second-post", title: "Second Post", content: "Content 2" }));

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/posts");

			expect(res.status).toBe(200);
			const body = (await res.json()) as PostListResponse;
			expect(body.posts).toHaveLength(2);
			expect(body.total_posts).toBe(2);
		});

		it("returns empty list when no posts", async () => {
			const user = await createTestUser(ctx);

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/posts");

			expect(res.status).toBe(200);
			const body = (await res.json()) as PostListResponse;
			expect(body.posts).toEqual([]);
			expect(body.total_posts).toBe(0);
		});

		it("only returns posts for current user", async () => {
			const userA = await createTestUser(ctx, { github_id: 100001 });
			const userB = await createTestUser(ctx, { github_id: 100002 });
			const service = createPostService({ db: ctx.db, corpus: ctx.corpus });

			await service.create(userA.id, post({ slug: "a-post", title: "A Post", content: "Content" }));
			await service.create(userB.id, post({ slug: "b-post", title: "B Post", content: "Content" }));

			const appA = createTestApp(ctx, userA.id);
			const resA = await appA.request("/api/blog/posts");
			const bodyA = (await resA.json()) as PostListResponse;

			expect(bodyA.posts).toHaveLength(1);
			expect(bodyA.posts[0]?.slug).toBe("a-post");
		});

		it("supports pagination", async () => {
			const user = await createTestUser(ctx);
			const service = createPostService({ db: ctx.db, corpus: ctx.corpus });

			for (let i = 1; i <= 5; i++) {
				await service.create(user.id, post({ slug: `post-${i}`, title: `Post ${i}`, content: `Content ${i}` }));
			}

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/posts?limit=2&offset=0");

			expect(res.status).toBe(200);
			const body = (await res.json()) as PostListResponse;
			expect(body.posts).toHaveLength(2);
			expect(body.total_posts).toBe(5);
			expect(body.total_pages).toBe(3);
			expect(body.per_page).toBe(2);
		});

		it("filters by status", async () => {
			const user = await createTestUser(ctx);
			const service = createPostService({ db: ctx.db, corpus: ctx.corpus });

			await service.create(user.id, post({ slug: "draft", title: "Draft", content: "Content", publish_at: null }));
			await service.create(user.id, post({ slug: "published", title: "Published", content: "Content", publish_at: new Date("2020-01-01") }));

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/posts?status=draft");

			expect(res.status).toBe(200);
			const body = (await res.json()) as PostListResponse;
			expect(body.posts).toHaveLength(1);
			expect(body.posts[0]?.slug).toBe("draft");
		});
	});

	describe("GET /api/blog/posts/:slug", () => {
		it("requires authentication", async () => {
			const app = createUnauthenticatedApp(ctx);
			const res = await app.request("/api/blog/posts/some-slug");

			expect(res.status).toBe(401);
			const body = (await res.json()) as ErrorResponse;
			expect(body.code).toBe("UNAUTHORIZED");
		});

		it("returns single post by slug", async () => {
			const user = await createTestUser(ctx);
			const service = createPostService({ db: ctx.db, corpus: ctx.corpus });
			await service.create(user.id, post({ slug: "my-post", title: "My Post", content: "Content here" }));

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/posts/my-post");

			expect(res.status).toBe(200);
			const body = (await res.json()) as Post;
			expect(body.slug).toBe("my-post");
			expect(body.title).toBe("My Post");
			expect(body.content).toBe("Content here");
		});

		it("returns 404 for non-existent slug", async () => {
			const user = await createTestUser(ctx);

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/posts/nonexistent");

			expect(res.status).toBe(404);
			const body = (await res.json()) as ErrorResponse;
			expect(body.code).toBe("NOT_FOUND");
		});

		it("cannot access another users post", async () => {
			const userA = await createTestUser(ctx, { github_id: 200001 });
			const userB = await createTestUser(ctx, { github_id: 200002 });
			const service = createPostService({ db: ctx.db, corpus: ctx.corpus });

			await service.create(userA.id, post({ slug: "private-post", title: "Private", content: "Content" }));

			const appB = createTestApp(ctx, userB.id);
			const res = await appB.request("/api/blog/posts/private-post");

			expect(res.status).toBe(404);
		});
	});

	describe("POST /api/blog/posts", () => {
		it("requires authentication", async () => {
			const app = createUnauthenticatedApp(ctx);
			const res = await app.request("/api/blog/posts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ slug: "test", title: "Test", content: "Content" }),
			});

			expect(res.status).toBe(401);
			const body = (await res.json()) as ErrorResponse;
			expect(body.code).toBe("UNAUTHORIZED");
		});

		it("creates post", async () => {
			const user = await createTestUser(ctx);

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/posts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ slug: "new-post", title: "New Post", content: "Content", format: "md" }),
			});

			expect(res.status).toBe(201);
			const body = (await res.json()) as Post;
			expect(body.slug).toBe("new-post");
			expect(body.title).toBe("New Post");
			expect(body.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
		});

		it("creates post with tags", async () => {
			const user = await createTestUser(ctx);

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/posts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ slug: "tagged", title: "Tagged Post", content: "Content", format: "md", tags: ["typescript", "testing"] }),
			});

			expect(res.status).toBe(201);
			const body = (await res.json()) as Post;
			expect(body.tags).toEqual(["typescript", "testing"]);
		});

		it("returns 409 for duplicate slug", async () => {
			const user = await createTestUser(ctx);
			const service = createPostService({ db: ctx.db, corpus: ctx.corpus });
			await service.create(user.id, post({ slug: "existing", title: "Existing", content: "Content" }));

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/posts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ slug: "existing", title: "New", content: "Content", format: "md" }),
			});

			expect(res.status).toBe(409);
			const body = (await res.json()) as ErrorResponse;
			expect(body.code).toBe("CONFLICT");
		});

		it("validates required fields", async () => {
			const user = await createTestUser(ctx);

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/posts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ slug: "missing-title" }),
			});

			expect(res.status).toBe(400);
		});
	});

	describe("PUT /api/blog/posts/:uuid", () => {
		it("requires authentication", async () => {
			const app = createUnauthenticatedApp(ctx);
			const res = await app.request("/api/blog/posts/00000000-0000-0000-0000-000000000000", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: "Updated" }),
			});

			expect(res.status).toBe(401);
			const body = (await res.json()) as ErrorResponse;
			expect(body.code).toBe("UNAUTHORIZED");
		});

		it("updates post", async () => {
			const user = await createTestUser(ctx);
			const service = createPostService({ db: ctx.db, corpus: ctx.corpus });
			const createResult = await service.create(user.id, post({ slug: "update-me", title: "Original", content: "Content" }));
			expect(createResult.ok).toBe(true);
			if (!createResult.ok) return;

			const app = createTestApp(ctx, user.id);
			const res = await app.request(`/api/blog/posts/${createResult.value.uuid}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: "Updated Title" }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Post;
			expect(body.title).toBe("Updated Title");
			expect(body.slug).toBe("update-me");
		});

		it("updates post slug", async () => {
			const user = await createTestUser(ctx);
			const service = createPostService({ db: ctx.db, corpus: ctx.corpus });
			const createResult = await service.create(user.id, post({ slug: "old-slug", title: "Post", content: "Content" }));
			expect(createResult.ok).toBe(true);
			if (!createResult.ok) return;

			const app = createTestApp(ctx, user.id);
			const res = await app.request(`/api/blog/posts/${createResult.value.uuid}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ slug: "new-slug" }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Post;
			expect(body.slug).toBe("new-slug");
		});

		it("returns 404 for non-existent uuid", async () => {
			const user = await createTestUser(ctx);

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/posts/00000000-0000-0000-0000-000000000000", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: "Updated" }),
			});

			expect(res.status).toBe(404);
			const body = (await res.json()) as ErrorResponse;
			expect(body.code).toBe("NOT_FOUND");
		});

		it("returns 409 for slug conflict", async () => {
			const user = await createTestUser(ctx);
			const service = createPostService({ db: ctx.db, corpus: ctx.corpus });

			await service.create(user.id, post({ slug: "taken", title: "Taken", content: "Content" }));
			const createResult = await service.create(user.id, post({ slug: "other", title: "Other", content: "Content" }));
			expect(createResult.ok).toBe(true);
			if (!createResult.ok) return;

			const app = createTestApp(ctx, user.id);
			const res = await app.request(`/api/blog/posts/${createResult.value.uuid}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ slug: "taken" }),
			});

			expect(res.status).toBe(409);
			const body = (await res.json()) as ErrorResponse;
			expect(body.code).toBe("CONFLICT");
		});

		it("cannot update another users post", async () => {
			const userA = await createTestUser(ctx, { github_id: 300001 });
			const userB = await createTestUser(ctx, { github_id: 300002 });
			const service = createPostService({ db: ctx.db, corpus: ctx.corpus });

			const createResult = await service.create(userA.id, post({ slug: "a-post", title: "A Post", content: "Content" }));
			expect(createResult.ok).toBe(true);
			if (!createResult.ok) return;

			const appB = createTestApp(ctx, userB.id);
			const res = await appB.request(`/api/blog/posts/${createResult.value.uuid}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: "Hacked" }),
			});

			expect(res.status).toBe(404);
		});

		it("validates uuid format", async () => {
			const user = await createTestUser(ctx);

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/posts/not-a-uuid", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: "Updated" }),
			});

			expect(res.status).toBe(400);
		});
	});

	describe("DELETE /api/blog/posts/:uuid", () => {
		it("requires authentication", async () => {
			const app = createUnauthenticatedApp(ctx);
			const res = await app.request("/api/blog/posts/00000000-0000-0000-0000-000000000000", {
				method: "DELETE",
			});

			expect(res.status).toBe(401);
			const body = (await res.json()) as ErrorResponse;
			expect(body.code).toBe("UNAUTHORIZED");
		});

		it("deletes post", async () => {
			const user = await createTestUser(ctx);
			const service = createPostService({ db: ctx.db, corpus: ctx.corpus });
			const createResult = await service.create(user.id, post({ slug: "delete-me", title: "Delete Me", content: "Content" }));
			expect(createResult.ok).toBe(true);
			if (!createResult.ok) return;

			const app = createTestApp(ctx, user.id);
			const res = await app.request(`/api/blog/posts/${createResult.value.uuid}`, {
				method: "DELETE",
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as { success: boolean };
			expect(body.success).toBe(true);

			const getRes = await app.request(`/api/blog/posts/${createResult.value.slug}`);
			expect(getRes.status).toBe(404);
		});

		it("returns 404 for non-existent uuid", async () => {
			const user = await createTestUser(ctx);

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/posts/00000000-0000-0000-0000-000000000000", {
				method: "DELETE",
			});

			expect(res.status).toBe(404);
			const body = (await res.json()) as ErrorResponse;
			expect(body.code).toBe("NOT_FOUND");
		});

		it("cannot delete another users post", async () => {
			const userA = await createTestUser(ctx, { github_id: 400001 });
			const userB = await createTestUser(ctx, { github_id: 400002 });
			const service = createPostService({ db: ctx.db, corpus: ctx.corpus });

			const createResult = await service.create(userA.id, post({ slug: "a-post", title: "A Post", content: "Content" }));
			expect(createResult.ok).toBe(true);
			if (!createResult.ok) return;

			const appB = createTestApp(ctx, userB.id);
			const res = await appB.request(`/api/blog/posts/${createResult.value.uuid}`, {
				method: "DELETE",
			});

			expect(res.status).toBe(404);

			const appA = createTestApp(ctx, userA.id);
			const listRes = await appA.request("/api/blog/posts");
			const body = (await listRes.json()) as PostListResponse;
			expect(body.posts).toHaveLength(1);
		});

		it("validates uuid format", async () => {
			const user = await createTestUser(ctx);

			const app = createTestApp(ctx, user.id);
			const res = await app.request("/api/blog/posts/not-a-uuid", {
				method: "DELETE",
			});

			expect(res.status).toBe(400);
		});
	});
});
