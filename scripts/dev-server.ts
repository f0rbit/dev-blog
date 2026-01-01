import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { create_corpus, create_file_backend, define_store, json_codec } from "@f0rbit/corpus";
import { serve } from "bun";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { DrizzleDB } from "../packages/schema/src/database";
import { type AppContext, PostContentSchema, type User } from "../packages/schema/src/types";
import { assetsRouter } from "../packages/server/src/routes/assets";
import { categoriesRouter } from "../packages/server/src/routes/categories";
import { postsRouter } from "../packages/server/src/routes/posts";
import { projectsRouter } from "../packages/server/src/routes/projects";
import { tagsRouter } from "../packages/server/src/routes/tags";
import { tokensRouter } from "../packages/server/src/routes/tokens";

const LOCAL_DIR = "./local";
const DB_PATH = `${LOCAL_DIR}/sqlite.db`;
const CORPUS_PATH = `${LOCAL_DIR}/corpus`;
const PORT = 8080;

const DEV_USER: User = {
	id: 1,
	github_id: 12345,
	username: "dev-user",
	email: "dev@local.test",
	avatar_url: "https://github.com/ghost.png",
	created_at: new Date(),
	updated_at: new Date(),
};

// Mock DevPad projects for testing
const MOCK_DEVPAD_PROJECTS = [
	{
		id: "proj-devpad",
		name: "DevPad",
		slug: "devpad",
		description: "The DevPad application itself",
		color: "#6366f1",
		icon: "📝",
		url: "https://github.com/f0rbit/devpad",
	},
	{
		id: "proj-dev-blog",
		name: "Dev Blog",
		slug: "dev-blog",
		description: "Personal developer blog",
		color: "#22c55e",
		icon: "📰",
		url: "https://github.com/f0rbit/dev-blog",
	},
	{
		id: "proj-media-timeline",
		name: "Media Timeline",
		slug: "media-timeline",
		description: "Track movies, shows, and games",
		color: "#f59e0b",
		icon: "🎬",
		url: "https://github.com/f0rbit/media-timeline",
	},
	{
		id: "proj-corpus",
		name: "Corpus",
		slug: "corpus",
		description: "Content versioning library",
		color: "#ec4899",
		icon: "📚",
		url: "https://github.com/f0rbit/corpus",
	},
	{
		id: "proj-homelab",
		name: "Homelab",
		slug: "homelab",
		description: "Self-hosted infrastructure",
		color: "#8b5cf6",
		icon: "🏠",
		url: null,
	},
];

// Valid mock API token for testing
const MOCK_DEVPAD_TOKEN = "devpad-test-token-12345";

// -----------------------------------------------------------------------------
// Dev Server App
// -----------------------------------------------------------------------------

type DevVariables = {
	user: User;
	appContext: AppContext;
};

const createDevApp = (appContext: AppContext) => {
	const app = new Hono<{ Variables: DevVariables }>();

	app.use("*", logger());
	app.use(
		"*",
		cors({
			origin: ["http://localhost:4321", "http://localhost:3000", "http://localhost:5173"],
			allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
			allowHeaders: ["Content-Type", "Authorization", "Auth-Token"],
			credentials: true,
		})
	);

	app.use("*", async (c, next) => {
		c.set("appContext", appContext);
		c.set("user", DEV_USER);
		await next();
	});

	app.get("/health", c =>
		c.json({
			status: "ok",
			timestamp: new Date().toISOString(),
			environment: "development",
			user: DEV_USER.username,
		})
	);

	app.get("/auth/user", c => c.json({ user: DEV_USER }));
	app.get("/auth/login", c => c.redirect("/"));
	app.get("/auth/logout", c => c.json({ success: true, message: "Logged out" }));

	// Mock DevPad API endpoint (simulates external DevPad service)
	app.get("/mock-devpad/projects", c => {
		const authHeader = c.req.header("Authorization");
		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			return c.json({ error: "Missing authorization header" }, 401);
		}
		const token = authHeader.replace("Bearer ", "");
		if (token !== MOCK_DEVPAD_TOKEN) {
			return c.json({ error: "Invalid or expired token" }, 401);
		}
		return c.json({ projects: MOCK_DEVPAD_PROJECTS });
	});

	// Mount API routes
	app.route("/posts", postsRouter);
	app.route("/tags", tagsRouter);
	app.route("/categories", categoriesRouter);
	app.route("/tokens", tokensRouter);
	app.route("/assets", assetsRouter);
	app.route("/projects", projectsRouter);

	app.notFound(c => c.json({ code: "NOT_FOUND", message: "Resource not found" }, 404));

	app.onError((error, c) => {
		console.error("Unhandled error:", error);
		return c.json(
			{
				code: "INTERNAL_ERROR",
				message: error.message,
			},
			500
		);
	});

	return app;
};

const checkDatabase = (): boolean => {
	if (!existsSync(DB_PATH)) {
		console.error(`❌ Database not found at ${DB_PATH}`);
		console.error('   Run "bun run db:setup" first to create and seed the database');
		return false;
	}
	return true;
};

const main = async () => {
	if (!checkDatabase()) {
		process.exit(1);
	}

	console.log("🚀 Starting dev server...\n");

	// Create SQLite database and wrap with Drizzle
	const sqlite = new Database(DB_PATH);
	const db = drizzle(sqlite) as DrizzleDB;

	// Create file-based corpus using the library
	const backend = create_file_backend({ base_path: CORPUS_PATH });
	const posts_store = define_store("posts", json_codec(PostContentSchema));
	const corpus = create_corpus().with_backend(backend).with_store(posts_store).build();

	const appContext: AppContext = {
		db,
		corpus,
		devpadApi: `http://localhost:${PORT}/mock-devpad`,
		environment: "development",
	};

	const app = createDevApp(appContext);

	console.log(`✓ Database: ${DB_PATH}`);
	console.log(`✓ Corpus: ${CORPUS_PATH}`);
	console.log(`✓ Dev user: ${DEV_USER.username}`);
	console.log("✓ Mock DevPad API enabled");
	console.log(`\n📡 Dev server running on http://localhost:${PORT}`);
	console.log("\nEndpoints:");
	console.log("  GET  /health        - Health check");
	console.log("  GET  /auth/user     - Current user");
	console.log("  GET  /posts         - List posts");
	console.log("  GET  /categories    - List categories");
	console.log("  GET  /tokens        - List API tokens");
	console.log("  GET  /projects      - List DevPad projects");
	console.log("\nMock DevPad:");
	console.log(`  Token: ${MOCK_DEVPAD_TOKEN}`);
	console.log(`  Projects: ${MOCK_DEVPAD_PROJECTS.length} available`);

	serve({
		port: PORT,
		fetch: app.fetch,
	});
};

main().catch(error => {
	console.error("❌ Server failed to start:", error);
	process.exit(1);
});

export default { port: PORT };
