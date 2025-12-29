import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { type DrizzleDB, type PostCreate, type PostUpdate, categories, tags, users } from "@blog/schema";
import { drizzle } from "drizzle-orm/bun-sqlite";

type R2ObjectBody = {
	text: () => Promise<string>;
	customMetadata?: Record<string, string>;
};

type R2Object = R2ObjectBody & {
	key: string;
	uploaded: Date;
	customMetadata?: Record<string, string>;
};

type StoredItem = {
	body: string;
	metadata: Record<string, string>;
	uploaded: Date;
};

class MemoryR2Bucket {
	private store = new Map<string, StoredItem>();

	async put(key: string, body: string, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }): Promise<void> {
		this.store.set(key, {
			body,
			metadata: options?.customMetadata ?? {},
			uploaded: new Date(),
		});
	}

	async get(key: string): Promise<R2ObjectBody | null> {
		const stored = this.store.get(key);
		if (!stored) return null;

		return {
			text: async () => stored.body,
			customMetadata: stored.metadata,
		};
	}

	async list(options?: { prefix?: string }): Promise<{ objects: R2Object[] }> {
		const prefix = options?.prefix ?? "";
		const objects: R2Object[] = [];

		for (const [key, value] of this.store.entries()) {
			if (key.startsWith(prefix)) {
				objects.push({
					key,
					uploaded: value.uploaded,
					customMetadata: value.metadata,
					text: async () => value.body,
				});
			}
		}

		return { objects };
	}

	async delete(keys: string | string[]): Promise<void> {
		const keyList = Array.isArray(keys) ? keys : [keys];
		for (const key of keyList) {
			this.store.delete(key);
		}
	}

	clear(): void {
		this.store.clear();
	}
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    github_id INTEGER NOT NULL UNIQUE,
    username TEXT NOT NULL,
    email TEXT,
    avatar_url TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    author_id INTEGER NOT NULL REFERENCES users(id),
    slug TEXT NOT NULL,
    corpus_version TEXT,
    category TEXT NOT NULL DEFAULT 'root',
    archived INTEGER NOT NULL DEFAULT 0,
    publish_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    project_id TEXT,
    UNIQUE(author_id, slug)
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    parent TEXT DEFAULT 'root',
    UNIQUE(owner_id, name)
  );

  CREATE TABLE IF NOT EXISTS tags (
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    PRIMARY KEY (post_id, tag)
  );
`;

const createTestContext = () => {
	const sqliteDb = new Database(":memory:");
	sqliteDb.exec(SCHEMA_SQL);

	const db = drizzle(sqliteDb) as DrizzleDB;
	const corpus = new MemoryR2Bucket();

	return {
		sqliteDb,
		db,
		corpus: corpus as unknown as R2Bucket,
		reset: () => {
			sqliteDb.exec("DELETE FROM tags");
			sqliteDb.exec("DELETE FROM posts");
			sqliteDb.exec("DELETE FROM categories");
			sqliteDb.exec("DELETE FROM users");
			corpus.clear();
		},
		close: () => {
			sqliteDb.close();
		},
	};
};

import { type PostService, createPostService } from "../../src/services/posts";

const createTestUser = async (ctx: ReturnType<typeof createTestContext>, suffix = "") => {
	const now = new Date();
	const githubId = 12345 + Math.floor(Math.random() * 100000);
	const [user] = await ctx.db
		.insert(users)
		.values({
			github_id: githubId,
			username: `testuser${suffix}`,
			email: `test${suffix}@example.com`,
			avatar_url: "https://github.com/ghost.png",
			created_at: now,
			updated_at: now,
		})
		.returning();
	if (!user) throw new Error("Failed to create test user");
	return user;
};

const createTestCategory = async (ctx: ReturnType<typeof createTestContext>, userId: number, name: string, parent = "root") => {
	const [category] = await ctx.db
		.insert(categories)
		.values({
			owner_id: userId,
			name,
			parent,
		})
		.returning();
	if (!category) throw new Error("Failed to create test category");
	return category;
};

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
			const input: PostCreate = {
				slug: "my-first-post",
				title: "My First Post",
				content: "Hello world!",
				format: "md",
			};

			const result = await service.create(userId, input);

			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
			expect(result.value.slug).toBe("my-first-post");
			expect(result.value.title).toBe("My First Post");
			expect(result.value.content).toBe("Hello world!");
		});

		it("stores content in Corpus", async () => {
			const input: PostCreate = {
				slug: "test-post",
				title: "Test",
				content: "Content",
				format: "md",
			};

			const result = await service.create(userId, input);
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.corpus_version).toMatch(/^[a-f0-9]{64}$/);
		});

		it("handles slug conflicts", async () => {
			const input: PostCreate = {
				slug: "duplicate-slug",
				title: "First Post",
				content: "Content",
				format: "md",
			};

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
			const input: PostCreate = {
				slug: "tagged-post",
				title: "Tagged",
				content: "Content",
				format: "md",
				tags: ["typescript", "testing", "vitest"],
			};

			const result = await service.create(userId, input);
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.tags).toEqual(["typescript", "testing", "vitest"]);
		});

		it("creates as draft when publish_at is null", async () => {
			const input: PostCreate = {
				slug: "draft-post",
				title: "Draft",
				content: "WIP",
				format: "md",
				publish_at: null,
			};

			const result = await service.create(userId, input);
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.publish_at).toBeNull();
		});

		it("creates as published with past publish_at", async () => {
			const pastDate = new Date("2020-01-01");
			const input: PostCreate = {
				slug: "published-post",
				title: "Published",
				content: "Content",
				format: "md",
				publish_at: pastDate,
			};

			const result = await service.create(userId, input);
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.publish_at?.getTime()).toBe(pastDate.getTime());
		});

		it("creates as scheduled with future publish_at", async () => {
			const futureDate = new Date("2099-12-31");
			const input: PostCreate = {
				slug: "scheduled-post",
				title: "Scheduled",
				content: "Content",
				format: "md",
				publish_at: futureDate,
			};

			const result = await service.create(userId, input);
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.publish_at?.getTime()).toBe(futureDate.getTime());
		});

		it("creates with category", async () => {
			const input: PostCreate = {
				slug: "categorized",
				title: "Categorized Post",
				content: "Content",
				format: "md",
				category: "tutorials",
			};

			const result = await service.create(userId, input);
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.category).toBe("tutorials");
		});

		it("creates with project_id", async () => {
			const input: PostCreate = {
				slug: "project-post",
				title: "Project Post",
				content: "Content",
				format: "md",
				project_id: "proj-123",
			};

			const result = await service.create(userId, input);
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.project_id).toBe("proj-123");
		});

		it("creates with adoc format", async () => {
			const input: PostCreate = {
				slug: "asciidoc-post",
				title: "Asciidoc Post",
				content: "= Title\n\nContent",
				format: "adoc",
			};

			const result = await service.create(userId, input);
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.format).toBe("adoc");
		});

		it("defaults category to root", async () => {
			const input: PostCreate = {
				slug: "no-category",
				title: "No Category",
				content: "Content",
				format: "md",
			};

			const result = await service.create(userId, input);
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.category).toBe("root");
		});

		it("allows same slug for different users", async () => {
			const user2 = await createTestUser(ctx, "2");

			const input: PostCreate = {
				slug: "same-slug",
				title: "Post",
				content: "Content",
				format: "md",
			};

			const first = await service.create(userId, input);
			const second = await service.create(user2.id, input);

			expect(first.ok).toBe(true);
			expect(second.ok).toBe(true);
		});
	});

	describe("update", () => {
		let postUuid: string;

		beforeEach(async () => {
			const createResult = await service.create(userId, {
				slug: "update-test",
				title: "Original Title",
				content: "Original content",
				format: "md",
				tags: ["original"],
			});
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
			await service.create(userId, {
				slug: "existing-slug",
				title: "Existing",
				content: "Content",
				format: "md",
			});

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
			const user2 = await createTestUser(ctx, "2");
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
			const createResult = await service.create(userId, {
				slug: "versioned-post",
				title: "V1",
				content: "First version",
				format: "md",
			});
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
			await service.create(userId, {
				slug: "draft-1",
				title: "Draft 1",
				content: "Draft content",
				format: "md",
				publish_at: null,
			});

			await service.create(userId, {
				slug: "draft-2",
				title: "Draft 2",
				content: "Draft content",
				format: "md",
				publish_at: null,
			});

			await service.create(userId, {
				slug: "published-1",
				title: "Published 1",
				content: "Published content",
				format: "md",
				publish_at: new Date("2020-01-01"),
			});

			await service.create(userId, {
				slug: "published-2",
				title: "Published 2",
				content: "Published content",
				format: "md",
				publish_at: new Date("2020-06-01"),
			});

			await service.create(userId, {
				slug: "scheduled-1",
				title: "Scheduled 1",
				content: "Scheduled content",
				format: "md",
				publish_at: new Date("2099-12-01"),
			});

			await service.create(userId, {
				slug: "scheduled-2",
				title: "Scheduled 2",
				content: "Scheduled content",
				format: "md",
				publish_at: new Date("2099-12-31"),
			});
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
			for (const post of result.value.posts) {
				expect(post.publish_at).toBeNull();
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
			for (const post of result.value.posts) {
				expect(post.publish_at).not.toBeNull();
				if (post.publish_at) {
					expect(post.publish_at.getTime()).toBeLessThanOrEqual(Date.now());
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
			for (const post of result.value.posts) {
				expect(post.publish_at).not.toBeNull();
				if (post.publish_at) {
					expect(post.publish_at.getTime()).toBeGreaterThan(Date.now());
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

			await service.create(userId, {
				slug: "post-root",
				title: "Root Post",
				content: "Content",
				format: "md",
				category: "root",
				tags: ["general"],
				project_id: "proj-a",
			});

			await service.create(userId, {
				slug: "post-tech",
				title: "Tech Post",
				content: "Content",
				format: "md",
				category: "tech",
				tags: ["coding"],
				project_id: "proj-a",
			});

			await service.create(userId, {
				slug: "post-frontend",
				title: "Frontend Post",
				content: "Content",
				format: "md",
				category: "frontend",
				tags: ["react", "coding"],
				project_id: "proj-b",
			});

			await service.create(userId, {
				slug: "post-backend",
				title: "Backend Post",
				content: "Content",
				format: "md",
				category: "backend",
				tags: ["nodejs", "coding"],
				project_id: "proj-b",
			});

			await service.create(userId, {
				slug: "post-lifestyle",
				title: "Lifestyle Post",
				content: "Content",
				format: "md",
				category: "lifestyle",
				tags: ["travel"],
			});

			const archivedResult = await service.create(userId, {
				slug: "post-archived",
				title: "Archived Post",
				content: "Content",
				format: "md",
				category: "tech",
			});
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
			for (const post of result.value.posts) {
				expect(post.tags).toContain("coding");
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
			for (const post of result.value.posts) {
				expect(post.project_id).toBe("proj-b");
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
			for (const post of result.value.posts) {
				expect(post.archived).toBe(false);
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
			const createResult = await service.create(userId, {
				slug: "delete-test",
				title: "Delete Me",
				content: "Content",
				format: "md",
				tags: ["tag1", "tag2"],
			});
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
			const user2 = await createTestUser(ctx, "2");
			const result = await service.delete(user2.id, postUuid);
			expect(result.ok).toBe(false);

			const stillExists = await service.getByUuid(userId, postUuid);
			expect(stillExists.ok).toBe(true);
		});
	});

	describe("getBySlug", () => {
		it("retrieves post by slug", async () => {
			await service.create(userId, {
				slug: "find-me",
				title: "Find Me",
				content: "Content",
				format: "md",
			});

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
			await service.create(userId, {
				slug: "private-post",
				title: "Private",
				content: "Content",
				format: "md",
			});

			const user2 = await createTestUser(ctx, "2");
			const result = await service.getBySlug(user2.id, "private-post");
			expect(result.ok).toBe(false);
		});
	});

	describe("getByUuid", () => {
		it("retrieves post by uuid", async () => {
			const createResult = await service.create(userId, {
				slug: "uuid-test",
				title: "UUID Test",
				content: "Content",
				format: "md",
			});
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
});
