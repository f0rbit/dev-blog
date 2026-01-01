import { Database } from "bun:sqlite";
import { type DrizzleDB, type PostsCorpus, type Project, type Result, create_corpus, create_memory_backend, err, ok, postsStoreDefinition } from "@blog/schema";
import * as schema from "@blog/schema/database";
import { drizzle } from "drizzle-orm/bun-sqlite";

export type TestUser = {
	id: number;
	github_id: number;
	username: string;
	email: string | null;
	avatar_url: string | null;
	created_at: Date;
	updated_at: Date;
};

export const createTestCorpus = (): PostsCorpus => {
	const backend = create_memory_backend();
	return create_corpus().with_backend(backend).with_store(postsStoreDefinition).build() as PostsCorpus;
};

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

  CREATE TABLE IF NOT EXISTS blog_posts (
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

  CREATE TABLE IF NOT EXISTS blog_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    parent TEXT DEFAULT 'root',
    UNIQUE(owner_id, name)
  );

  CREATE TABLE IF NOT EXISTS blog_tags (
    post_id INTEGER NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    PRIMARY KEY (post_id, tag)
  );

  CREATE TABLE IF NOT EXISTS blog_post_projects (
    post_id INTEGER NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (post_id, project_id)
  );

  CREATE TABLE IF NOT EXISTS access_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    key_hash TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    note TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`;

export type TestContext = {
	sqliteDb: Database;
	db: DrizzleDB;
	corpus: PostsCorpus;
	reset: () => void;
	close: () => void;
};

export const createTestContext = (): TestContext => {
	const sqliteDb = new Database(":memory:");
	sqliteDb.exec(SCHEMA_SQL);

	const db = drizzle(sqliteDb) as unknown as DrizzleDB;
	const backend = create_memory_backend();
	const corpus = create_corpus().with_backend(backend).with_store(postsStoreDefinition).build() as PostsCorpus;

	return {
		sqliteDb,
		db,
		corpus,
		reset: () => {
			sqliteDb.exec("DELETE FROM blog_post_projects");
			sqliteDb.exec("DELETE FROM blog_tags");
			sqliteDb.exec("DELETE FROM blog_posts");
			sqliteDb.exec("DELETE FROM blog_categories");
			sqliteDb.exec("DELETE FROM access_keys");
			sqliteDb.exec("DELETE FROM users");
		},
		close: () => {
			sqliteDb.close();
		},
	};
};

export const createTestUser = async (ctx: TestContext, overrides: Partial<{ github_id: number; username: string; email: string; avatar_url: string }> = {}): Promise<TestUser> => {
	const now = new Date();
	const githubId = overrides.github_id ?? 12345 + Math.floor(Math.random() * 100000);
	const username = overrides.username ?? `testuser-${githubId}`;

	const [user] = await ctx.db
		.insert(schema.users)
		.values({
			github_id: githubId,
			username,
			email: overrides.email ?? `${username}@example.com`,
			avatar_url: overrides.avatar_url ?? "https://github.com/ghost.png",
			created_at: now,
			updated_at: now,
		})
		.returning();

	if (!user) throw new Error("Failed to create test user");
	return user;
};

export const createTestCategory = async (ctx: TestContext, userId: number, name: string, parent = "root") => {
	const [category] = await ctx.db
		.insert(schema.categories)
		.values({
			owner_id: userId,
			name,
			parent,
		})
		.returning();

	if (!category) throw new Error("Failed to create test category");
	return category;
};

export const createTestPost = async (ctx: TestContext, authorId: number, overrides: Partial<{ slug: string; category: string; archived: boolean; publish_at: Date | null }> = {}) => {
	const uuid = crypto.randomUUID();
	const slug = overrides.slug ?? `test-post-${uuid.slice(0, 8)}`;

	const [post] = await ctx.db
		.insert(schema.posts)
		.values({
			uuid,
			author_id: authorId,
			slug,
			category: overrides.category ?? "root",
			archived: overrides.archived ?? false,
			publish_at: overrides.publish_at,
			created_at: new Date(),
			updated_at: new Date(),
		})
		.returning();

	if (!post) throw new Error("Failed to create test post");
	return post;
};

export const createTestToken = async (ctx: TestContext, userId: number, name: string, keyHash: string, enabled = true) => {
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

	if (!token) throw new Error("Failed to create test token");
	return token;
};

export type DevpadUser = {
	github_id: number;
	username: string;
	email: string | null;
	avatar_url: string | null;
};

export type MockDevpadVerifyConfig = {
	authenticated: boolean;
	user: DevpadUser | null;
	shouldFail?: boolean;
};

export const createMockDevpadVerifyFetch = (config: MockDevpadVerifyConfig) => {
	return async (url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
		const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

		if (urlStr.includes("/api/auth/verify")) {
			if (config.shouldFail) {
				return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
			}

			if (!config.authenticated || !config.user) {
				return new Response(JSON.stringify({ authenticated: false, user: null }), { status: 200 });
			}

			return new Response(
				JSON.stringify({
					authenticated: true,
					user: {
						id: `user-${config.user.github_id}`,
						name: config.user.username,
						email: config.user.email,
						github_id: config.user.github_id,
						image_url: config.user.avatar_url,
					},
				}),
				{ status: 200 }
			);
		}

		return new Response("Not found", { status: 404 });
	};
};

export type MockDevpadProvider = {
	setProjects: (projects: Project[]) => void;
	setError: (error: string | null) => void;
	fetchProjects: (token: string) => Promise<Result<Project[], string>>;
};

export const createMockDevpadProvider = (): MockDevpadProvider => {
	let projects: Project[] = [];
	let error: string | null = null;

	return {
		setProjects: p => {
			projects = p;
		},
		setError: e => {
			error = e;
		},
		fetchProjects: async _token => {
			if (error) return err(error);
			return ok(projects);
		},
	};
};

export const generateId = (): string => crypto.randomUUID();
