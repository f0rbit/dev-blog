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
		console.log(`[PROJECTS:READ] storeId=${storeId} userId=${userId} userIdType=${typeof userId}`);
		console.log(`[PROJECTS:READ] corpus.metadata=${typeof corpus.metadata} corpus.data=${typeof corpus.data}`);

		const store = create_store(getBackend(corpus), { ...projectsCacheStoreDefinition, id: storeId });
		const result = await store.get_latest();

		if (!result.ok) {
			console.log(`[PROJECTS:READ:FAIL] error=${JSON.stringify(result.error)}`);
			return null;
		}
		console.log(`[PROJECTS:READ:OK] fetched_at=${result.value.data.fetched_at} projectCount=${result.value.data.projects.length}`);
		return result.value.data;
	};

	const setCache = async (userId: number, projects: Project[]): Promise<Result<void, ProjectServiceError>> => {
		const storeId = projectsCacheStoreId(userId);
		console.log(`[PROJECTS:WRITE] storeId=${storeId} userId=${userId} projectCount=${projects.length}`);
		console.log(`[PROJECTS:WRITE] corpus.metadata=${typeof corpus.metadata} corpus.data=${typeof corpus.data}`);

		const store = create_store(getBackend(corpus), { ...projectsCacheStoreDefinition, id: storeId });
		const cache: ProjectsCache = {
			projects,
			fetched_at: new Date().toISOString(),
		};
		const result = await store.put(cache);

		if (!result.ok) {
			console.log(`[PROJECTS:WRITE:FAIL] error=${JSON.stringify(result.error)}`);
			return err({ type: "corpus_error", message: "Failed to cache projects" });
		}
		console.log(`[PROJECTS:WRITE:OK] version=${result.value.version}`);
		return ok(undefined);
	};

	const list = async (userId: number): Promise<Result<Project[], ProjectServiceError>> => {
		console.log(`[PROJECTS:LIST] userId=${userId}`);
		const cache = await getCache(userId);
		if (cache) {
			console.log(`[PROJECTS:LIST:OK] returning ${cache.projects.length} cached projects`);
			return ok(cache.projects);
		}
		console.log("[PROJECTS:LIST:EMPTY] no cache found, returning empty array");
		return ok([]);
	};

	const refresh = async (userId: number, jwtToken: string): Promise<Result<Project[], ProjectServiceError>> => {
		console.log(`[PROJECTS:REFRESH] userId=${userId} hasToken=${!!jwtToken} tokenLength=${jwtToken?.length}`);
		const fetchResult = await devpadProvider.fetchProjects(jwtToken);
		if (!fetchResult.ok) {
			console.log(`[PROJECTS:REFRESH:FETCH_FAIL] error=${fetchResult.error}`);
			return err({ type: "provider_error", message: fetchResult.error });
		}
		console.log(`[PROJECTS:REFRESH:FETCH_OK] projectCount=${fetchResult.value.length}`);

		const cacheResult = await setCache(userId, fetchResult.value);
		if (!cacheResult.ok) {
			console.log(`[PROJECTS:REFRESH:CACHE_FAIL] error=${JSON.stringify(cacheResult.error)}`);
		}
		return ok(fetchResult.value);
	};

	return { list, refresh };
};

export type ProjectService = ReturnType<typeof createProjectService>;
