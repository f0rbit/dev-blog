import { Database } from "bun:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { type AppContext, type DrizzleDB, type PostsCorpus, create_corpus, create_memory_backend, postsStoreDefinition, projectsCacheStoreDefinition } from "@blog/schema";
import * as schema from "@blog/schema/database";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Hono } from "hono";

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
	return create_corpus().with_backend(backend).with_store(postsStoreDefinition).with_store(projectsCacheStoreDefinition).build() as PostsCorpus;
};

/**
 * Reads and applies all Drizzle migrations to create tables.
 * This ensures tests use the exact same schema as production.
 */
const applyMigrations = (sqliteDb: Database) => {
	const migrationsDir = join(__dirname, "../../../migrations");
	const migrationFiles = readdirSync(migrationsDir)
		.filter(f => f.endsWith(".sql"))
		.sort();

	for (const file of migrationFiles) {
		const sql = readFileSync(join(migrationsDir, file), "utf-8");
		// Split by statement breakpoint and execute each statement
		const statements = sql
			.split("--> statement-breakpoint")
			.map(s => s.trim())
			.filter(Boolean);
		for (const statement of statements) {
			try {
				sqliteDb.exec(statement);
			} catch (e) {
				// Ignore "table already exists" errors for idempotency
				const msg = e instanceof Error ? e.message : String(e);
				if (!msg.includes("already exists")) {
					throw e;
				}
			}
		}
	}
};

export type TestContext = {
	sqliteDb: Database;
	db: DrizzleDB;
	corpus: PostsCorpus;
	ctx: AppContext;
	reset: () => void;
	close: () => void;
};

export const createAppContext = (db: DrizzleDB, corpus: PostsCorpus): AppContext => ({
	db,
	corpus,
	devpadApi: "https://devpad.test",
	environment: "test",
});

export const createTestContext = (): TestContext => {
	const sqliteDb = new Database(":memory:");

	// Apply all Drizzle migrations to create tables
	applyMigrations(sqliteDb);

	const bunDb = drizzle(sqliteDb, { schema });
	const db = bunDb as unknown as DrizzleDB;
	const backend = create_memory_backend();
	const corpus = create_corpus().with_backend(backend).with_store(postsStoreDefinition).build() as PostsCorpus;

	return {
		sqliteDb,
		db,
		corpus,
		ctx: createAppContext(db, corpus),
		reset: () => {
			// Clear tables in reverse dependency order using Drizzle
			bunDb.delete(schema.postProjects).run();
			bunDb.delete(schema.fetchLinks).run();
			bunDb.delete(schema.tags).run();
			bunDb.delete(schema.posts).run();
			bunDb.delete(schema.categories).run();
			bunDb.delete(schema.projectsCache).run();
			bunDb.delete(schema.integrations).run();
			bunDb.delete(schema.accessKeys).run();
			bunDb.delete(schema.users).run();
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

export { createMockDevpadProvider } from "../src/providers/devpad";
export type { DevpadProvider } from "../src/providers/devpad";

export const generateId = (): string => crypto.randomUUID();

export type TestAppOptions = {
	userId?: number;
	jwtToken?: string;
};

type TestAppVariables = {
	user: { id: number };
	appContext: AppContext;
	jwtToken?: string;
};

export const createTestApp = (ctx: TestContext, router: Hono<{ Variables: TestAppVariables }>, routePath: string, options: TestAppOptions = {}) => {
	const { userId = 1, jwtToken } = options;

	const app = new Hono<{ Variables: TestAppVariables }>();

	app.use("*", async (c, next) => {
		c.set("appContext", ctx.ctx);
		c.set("user", { id: userId });
		if (jwtToken) {
			c.set("jwtToken", jwtToken);
		}
		await next();
	});

	app.route(routePath, router);
	return app;
};

export const createAuthenticatedTestApp = (ctx: TestContext, router: Hono<{ Variables: TestAppVariables }>, basePath: string, userId: number) => createTestApp(ctx, router, basePath, { userId });

type UnauthenticatedVariables = {
	user?: { id: number };
	appContext: AppContext;
};

// biome-ignore lint/suspicious/noExplicitAny: Router types vary and we need flexibility for unauthenticated testing
export const createUnauthenticatedTestApp = (ctx: TestContext, router: Hono<any>, routePath: string) => {
	const app = new Hono<{ Variables: UnauthenticatedVariables }>();

	app.use("*", async (c, next) => {
		c.set("appContext", ctx.ctx);
		await next();
	});

	app.route(routePath, router);
	return app;
};
