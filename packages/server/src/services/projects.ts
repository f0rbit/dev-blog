import { type PostsCorpus, type Project, type ProjectsCache, type Result, err, ok, projectsCacheStoreDefinition, projectsCacheStoreId } from "@blog/schema";
import { type Backend, create_store } from "@f0rbit/corpus";
import type { DevpadProvider } from "../providers/devpad";

export type ProjectServiceError = { type: "provider_error"; message: string } | { type: "corpus_error"; message: string };

type Deps = {
	corpus: PostsCorpus;
	devpadProvider: DevpadProvider;
};

const getBackend = (corpus: PostsCorpus): Backend => ({
	metadata: corpus.metadata,
	data: corpus.data,
});

export const createProjectService = ({ corpus, devpadProvider }: Deps) => {
	const getCache = async (userId: number): Promise<ProjectsCache | null> => {
		const storeId = projectsCacheStoreId(userId);
		console.log("[projects] getCache:", { userId, storeId });
		const store = create_store(getBackend(corpus), { ...projectsCacheStoreDefinition, id: storeId });
		const result = await store.get_latest();
		console.log("[projects] getCache result:", { ok: result.ok });
		if (!result.ok) {
			console.log("[projects] getCache error:", result.error);
			return null;
		}
		console.log("[projects] getCache data:", { projectCount: result.value.data.projects.length, fetchedAt: result.value.data.fetched_at });
		return result.value.data;
	};

	const setCache = async (userId: number, projects: Project[]): Promise<Result<void, ProjectServiceError>> => {
		const storeId = projectsCacheStoreId(userId);
		console.log("[projects] setCache:", { userId, storeId, projectCount: projects.length });
		const store = create_store(getBackend(corpus), { ...projectsCacheStoreDefinition, id: storeId });
		const cache: ProjectsCache = {
			projects,
			fetched_at: new Date().toISOString(),
		};
		const result = await store.put(cache);
		console.log("[projects] setCache result:", { ok: result.ok });
		if (!result.ok) {
			console.log("[projects] setCache error:", result.error);
			return err({ type: "corpus_error", message: "Failed to cache projects" });
		}
		return ok(undefined);
	};

	const list = async (userId: number): Promise<Result<Project[], ProjectServiceError>> => {
		console.log("[projects] list:", { userId });
		const cache = await getCache(userId);
		if (cache) {
			console.log("[projects] list: returning cached projects", { count: cache.projects.length });
			return ok(cache.projects);
		}
		console.log("[projects] list: no cache, returning empty array");
		return ok([]);
	};

	const refresh = async (userId: number, jwtToken: string): Promise<Result<Project[], ProjectServiceError>> => {
		console.log("[projects] refresh:", { userId, hasToken: !!jwtToken, tokenLength: jwtToken?.length });
		const fetchResult = await devpadProvider.fetchProjects(jwtToken);
		console.log("[projects] refresh fetchResult:", { ok: fetchResult.ok });
		if (!fetchResult.ok) {
			console.log("[projects] refresh fetchError:", fetchResult.error);
			return err({ type: "provider_error", message: fetchResult.error });
		}
		console.log("[projects] refresh: fetched projects from devpad", { count: fetchResult.value.length });

		const cacheResult = await setCache(userId, fetchResult.value);
		if (!cacheResult.ok) {
			console.warn("[projects] Failed to cache projects:", cacheResult.error);
		}

		return ok(fetchResult.value);
	};

	return { list, refresh };
};

export type ProjectService = ReturnType<typeof createProjectService>;
