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
		const store = create_store(getBackend(corpus), { ...projectsCacheStoreDefinition, id: storeId });
		const result = await store.get_latest();
		if (!result.ok) return null;
		return result.value.data;
	};

	const setCache = async (userId: number, projects: Project[]): Promise<Result<void, ProjectServiceError>> => {
		const storeId = projectsCacheStoreId(userId);
		const store = create_store(getBackend(corpus), { ...projectsCacheStoreDefinition, id: storeId });
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
		if (cache) return ok(cache.projects);
		return ok([]);
	};

	const refresh = async (userId: number, jwtToken: string): Promise<Result<Project[], ProjectServiceError>> => {
		const fetchResult = await devpadProvider.fetchProjects(jwtToken);
		if (!fetchResult.ok) {
			return err({ type: "provider_error", message: fetchResult.error });
		}

		await setCache(userId, fetchResult.value);
		return ok(fetchResult.value);
	};

	return { list, refresh };
};

export type ProjectService = ReturnType<typeof createProjectService>;
