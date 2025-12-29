import { Database } from "bun:sqlite";
import { existsSync, readdirSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { type Result, err, ok } from "@f0rbit/corpus";
import { serve } from "bun";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { type CorpusBackend, type CorpusError, type PostContent, PostContentSchema, type PutOptions, type PutResult, type VersionInfo } from "../packages/schema/src/corpus";
import type { DrizzleDB } from "../packages/schema/src/database";
import type { AppContext, User } from "../packages/schema/src/types";
import { assetsRouter } from "../packages/server/src/routes/assets";
import { categoriesRouter } from "../packages/server/src/routes/categories";
import { postsRouter } from "../packages/server/src/routes/posts";
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

// -----------------------------------------------------------------------------
// File-based Corpus Backend (simulates R2 for local dev)
// -----------------------------------------------------------------------------

type FileCorpusEntry = {
	content: PostContent;
	parent: string | null;
	created_at: string;
};

const parseCorpusEntry = (raw: string): FileCorpusEntry | null => {
	try {
		const parsed = JSON.parse(raw);
		if (parsed.content && parsed.created_at) {
			return parsed as FileCorpusEntry;
		}
		return null;
	} catch {
		return null;
	}
};

class FileCorpusBackend implements CorpusBackend {
	constructor(private basePath: string) {}

	private versionDir(path: string): string {
		return `${this.basePath}/${path}/v`;
	}

	private versionFile(path: string, hash: string): string {
		return `${this.versionDir(path)}/${hash}.json`;
	}

	private hashContent(content: string): string {
		const hash = Bun.hash(content);
		return hash.toString(16).padStart(16, "0");
	}

	async put(path: string, content: string, options?: PutOptions): Promise<Result<PutResult, CorpusError>> {
		const parsed = PostContentSchema.safeParse(JSON.parse(content));
		if (!parsed.success) {
			return err({ type: "invalid_content", message: parsed.error.message });
		}

		const hash = this.hashContent(content);
		const dir = this.versionDir(path);
		const filePath = this.versionFile(path, hash);

		await mkdir(dir, { recursive: true });

		const entry: FileCorpusEntry = {
			content: parsed.data,
			parent: options?.parent ?? null,
			created_at: new Date().toISOString(),
		};

		await Bun.write(filePath, JSON.stringify(entry, null, 2));

		return ok({ hash });
	}

	async get(path: string, version?: string): Promise<Result<string, CorpusError>> {
		let resolvedVersion = version;
		if (!resolvedVersion) {
			const versionsResult = await this.listVersions(path);
			if (!versionsResult.ok) return versionsResult;
			if (versionsResult.value.length === 0) {
				return err({ type: "not_found", path });
			}
			resolvedVersion = versionsResult.value[0].hash;
		}

		const filePath = this.versionFile(path, resolvedVersion);
		const file = Bun.file(filePath);

		if (!(await file.exists())) {
			return err({ type: "not_found", path, version: resolvedVersion });
		}

		const raw = await file.text();
		const entry = parseCorpusEntry(raw);

		if (!entry) {
			return err({ type: "invalid_content", message: "Failed to parse corpus entry" });
		}

		return ok(JSON.stringify(entry.content));
	}

	async listVersions(path: string): Promise<Result<VersionInfo[], CorpusError>> {
		const dir = this.versionDir(path);

		if (!existsSync(dir)) {
			return ok([]);
		}

		const glob = new Bun.Glob("*.json");
		const files = Array.from(glob.scanSync({ cwd: dir }));

		const versions: VersionInfo[] = [];

		for (const filename of files) {
			const hash = filename.replace(".json", "");
			const filePath = `${dir}/${filename}`;
			const file = Bun.file(filePath);

			if (await file.exists()) {
				const raw = await file.text();
				const entry = parseCorpusEntry(raw);

				if (entry) {
					versions.push({
						hash,
						parent: entry.parent,
						created_at: new Date(entry.created_at),
					});
				}
			}
		}

		versions.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

		return ok(versions);
	}

	async delete(path: string): Promise<Result<void, CorpusError>> {
		const dir = this.versionDir(path);

		if (!existsSync(dir)) {
			return ok(undefined);
		}

		const { rm } = await import("node:fs/promises");
		await rm(dir, { recursive: true, force: true });

		return ok(undefined);
	}
}

// -----------------------------------------------------------------------------
// R2 Shim (wraps FileCorpusBackend to look like R2Bucket)
// -----------------------------------------------------------------------------

type R2ObjectBody = {
	body: ReadableStream<Uint8Array>;
	text: () => Promise<string>;
	json: <T = unknown>() => Promise<T>;
	arrayBuffer: () => Promise<ArrayBuffer>;
	customMetadata?: Record<string, string>;
};

type R2Objects = {
	objects: Array<{
		key: string;
		uploaded: Date;
		customMetadata?: Record<string, string>;
	}>;
	truncated: boolean;
	cursor?: string;
};

const createR2Shim = (corpus: FileCorpusBackend, corpusPath: string): R2Bucket =>
	({
		get: async (key: string): Promise<R2ObjectBody | null> => {
			// Parse key like "posts/1/uuid/v/hash.json" into path and version
			const versionMatch = key.match(/^(.+)\/v\/([^/]+)\.json$/);
			if (!versionMatch) return null;
			
			const [, path, version] = versionMatch;
			const result = await corpus.get(path, version);
			if (!result.ok) return null;

			const content = result.value;
			const buffer = new TextEncoder().encode(content);

			return {
				body: new ReadableStream({
					start(controller) {
						controller.enqueue(buffer);
						controller.close();
					},
				}),
				text: async () => content,
				json: async <T>() => JSON.parse(content) as T,
				arrayBuffer: async () => buffer.buffer as ArrayBuffer,
				customMetadata: {},
			};
		},

		put: async (key: string, body: ArrayBuffer | ReadableStream | string | Blob, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }) => {
			let content: string;
			if (typeof body === "string") {
				content = body;
			} else if (body instanceof ArrayBuffer) {
				content = new TextDecoder().decode(body);
			} else if (body instanceof Blob) {
				content = await body.text();
			} else {
				const reader = body.getReader();
				const chunks: Uint8Array[] = [];
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					chunks.push(value);
				}
				const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
				const merged = new Uint8Array(totalLength);
				let offset = 0;
				for (const chunk of chunks) {
					merged.set(chunk, offset);
					offset += chunk.length;
				}
				content = new TextDecoder().decode(merged);
			}

			const parent = options?.customMetadata?.parent;
			await corpus.put(key, content, parent ? { parent } : undefined);

			return { key } as R2Object;
		},

		delete: async (keys: string | string[]) => {
			const keyList = Array.isArray(keys) ? keys : [keys];
			for (const key of keyList) {
				await corpus.delete(key);
			}
		},

		list: async (options?: { prefix?: string }): Promise<R2Objects> => {
			const prefix = options?.prefix ?? "";
			const basePath = `${corpusPath}/${prefix}`;

			if (!existsSync(basePath)) {
				return { objects: [], truncated: false, cursor: undefined };
			}

			const objects: R2Objects["objects"] = [];

			const scanDir = async (dir: string, keyPrefix: string) => {
				if (!existsSync(dir)) return;

				const entries = readdirSync(dir, { withFileTypes: true });

				for (const entry of entries) {
					const fullPath = `${dir}/${entry.name}`;
					const key = `${keyPrefix}${entry.name}`;

					if (entry.isDirectory()) {
						await scanDir(fullPath, `${key}/`);
					} else if (entry.name.endsWith(".json")) {
						const file = Bun.file(fullPath);
						const raw = await file.text();
						const parsed = parseCorpusEntry(raw);

						objects.push({
							key: `${prefix}${key}`,
							uploaded: new Date(),
							customMetadata: parsed
								? {
										parent: parsed.parent ?? "",
										created_at: parsed.created_at,
									}
								: undefined,
						});
					}
				}
			};

			await scanDir(basePath, "");

			return { objects, truncated: false, cursor: undefined };
		},

		head: async () => null,
		createMultipartUpload: async () => {
			throw new Error("Not implemented");
		},
		resumeMultipartUpload: () => {
			throw new Error("Not implemented");
		},
	}) as unknown as R2Bucket;

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

	// Mount API routes
	app.route("/posts", postsRouter);
	app.route("/post", postsRouter);
	app.route("/tags", tagsRouter);
	app.route("/categories", categoriesRouter);
	app.route("/category", categoriesRouter);
	app.route("/tokens", tokensRouter);
	app.route("/token", tokensRouter);
	app.route("/assets", assetsRouter);

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

	// Create file-based corpus backend
	const corpusBackend = new FileCorpusBackend(CORPUS_PATH);
	const corpus = createR2Shim(corpusBackend, CORPUS_PATH);

	const appContext: AppContext = {
		db,
		corpus,
		devpadApi: "http://localhost:3000",
		environment: "development",
	};

	const app = createDevApp(appContext);

	console.log(`✓ Database: ${DB_PATH}`);
	console.log(`✓ Corpus: ${CORPUS_PATH}`);
	console.log(`✓ Dev user: ${DEV_USER.username}`);
	console.log(`\n📡 Dev server running on http://localhost:${PORT}`);
	console.log("\nEndpoints:");
	console.log("  GET  /health        - Health check");
	console.log("  GET  /auth/user     - Current user");
	console.log("  GET  /posts         - List posts");
	console.log("  GET  /categories    - List categories");
	console.log("  GET  /tokens        - List API tokens");

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
