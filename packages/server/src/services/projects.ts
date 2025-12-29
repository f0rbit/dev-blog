import {
	type DrizzleDB,
	type Project,
	type PostsCorpus,
	type Result,
	ProjectSchema,
	devpadTokens,
	err,
	ok,
} from "@blog/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { DevpadProvider } from "../providers/devpad";
import { create_store, type Backend, define_store, json_codec } from "@f0rbit/corpus";

const ProjectsCacheSchema = z.object({
	projects: z.array(ProjectSchema),
	fetched_at: z.string(),
});

type ProjectsCache = z.infer<typeof ProjectsCacheSchema>;

const projectsCacheStore = define_store("projects-cache", json_codec(ProjectsCacheSchema));

export type ProjectServiceError =
	| { type: "no_token" }
	| { type: "provider_error"; message: string }
	| { type: "db_error"; message: string }
	| { type: "corpus_error"; message: string };

type Deps = {
	db: DrizzleDB;
	corpus: PostsCorpus;
	devpadProvider: DevpadProvider;
};

const getBackend = (corpus: PostsCorpus): Backend => ({
	metadata: corpus.metadata,
	data: corpus.data,
});

export const createProjectService = ({ db, corpus, devpadProvider }: Deps) => {
	const cacheStoreId = (userId: number) => `projects/${userId}/cache`;

	const getCache = async (userId: number): Promise<ProjectsCache | null> => {
		const store = create_store(getBackend(corpus), { ...projectsCacheStore, id: cacheStoreId(userId) });
		const result = await store.get_latest();
		if (!result.ok) return null;
		return result.value.data;
	};

	const setCache = async (userId: number, projects: Project[]): Promise<Result<void, ProjectServiceError>> => {
		const store = create_store(getBackend(corpus), { ...projectsCacheStore, id: cacheStoreId(userId) });
		const cache: ProjectsCache = {
			projects,
			fetched_at: new Date().toISOString(),
		};
		const result = await store.put(cache);
		if (!result.ok) {
			return err({ type: "corpus_error", message: "Failed to cache projects" });
		}
		return ok(undefined);
	};

	const list = async (userId: number): Promise<Result<Project[], ProjectServiceError>> => {
		const cache = await getCache(userId);
		if (cache) {
			return ok(cache.projects);
		}
		return ok([]);
	};

	const refresh = async (userId: number): Promise<Result<Project[], ProjectServiceError>> => {
		const tokenRows = await db.select().from(devpadTokens).where(eq(devpadTokens.user_id, userId)).limit(1);
		const tokenRow = tokenRows[0];

		if (!tokenRow) {
			return err({ type: "no_token" });
		}

		const fetchResult = await devpadProvider.fetchProjects(tokenRow.token_encrypted);
		if (!fetchResult.ok) {
			return err({ type: "provider_error", message: fetchResult.error });
		}

		const cacheResult = await setCache(userId, fetchResult.value);
		if (!cacheResult.ok) {
			console.warn("Failed to cache projects:", cacheResult.error);
		}

		return ok(fetchResult.value);
	};

	const setToken = async (userId: number, token: string): Promise<Result<void, ProjectServiceError>> => {
		try {
			await db
				.insert(devpadTokens)
				.values({ user_id: userId, token_encrypted: token })
				.onConflictDoUpdate({
					target: devpadTokens.user_id,
					set: { token_encrypted: token, created_at: new Date() },
				});
			return ok(undefined);
		} catch (e) {
			return err({ type: "db_error", message: e instanceof Error ? e.message : "Unknown error" });
		}
	};

	const removeToken = async (userId: number): Promise<Result<void, ProjectServiceError>> => {
		try {
			await db.delete(devpadTokens).where(eq(devpadTokens.user_id, userId));
			return ok(undefined);
		} catch (e) {
			return err({ type: "db_error", message: e instanceof Error ? e.message : "Unknown error" });
		}
	};

	const hasToken = async (userId: number): Promise<boolean> => {
		const rows = await db
			.select({ id: devpadTokens.user_id })
			.from(devpadTokens)
			.where(eq(devpadTokens.user_id, userId))
			.limit(1);
		return rows.length > 0;
	};

	return { list, refresh, setToken, removeToken, hasToken };
};

export type ProjectService = ReturnType<typeof createProjectService>;
