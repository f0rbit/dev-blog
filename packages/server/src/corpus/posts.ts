import {
	type PostContent,
	type PostCorpusError,
	type PostsCorpus,
	type Result,
	type VersionInfo,
	corpusPath,
	err,
	mapCorpusError,
	ok,
	postsStoreDefinition,
} from "@blog/schema";
import { create_store, type Backend } from "@f0rbit/corpus";

export { corpusPath };

const corpusToBackend = (corpus: PostsCorpus): Backend => {
	const backend: Backend = {
		metadata: corpus.metadata,
		data: corpus.data,
	};
	if (corpus.observations) {
		backend.observations = corpus.observations;
	}
	return backend;
};

const createDynamicStore = (corpus: PostsCorpus, storeId: string) =>
	create_store(corpusToBackend(corpus), { ...postsStoreDefinition, id: storeId });

export const putContent = async (
	corpus: PostsCorpus,
	path: string,
	content: PostContent,
	parent?: string
): Promise<Result<{ hash: string }, PostCorpusError>> => {
	const store = createDynamicStore(corpus, path);

	const opts = parent ? { parents: [{ store_id: path, version: parent }] } : {};
	const result = await store.put(content, opts);

	if (!result.ok) return err(mapCorpusError(result.error));

	return ok({ hash: result.value.version });
};

export const getContent = async (
	corpus: PostsCorpus,
	path: string,
	hash: string
): Promise<Result<PostContent, PostCorpusError>> => {
	const store = createDynamicStore(corpus, path);

	const result = await store.get(hash);

	if (!result.ok) return err(mapCorpusError(result.error));

	return ok(result.value.data);
};

export const listVersions = async (
	corpus: PostsCorpus,
	path: string
): Promise<Result<VersionInfo[], PostCorpusError>> => {
	const store = createDynamicStore(corpus, path);

	const versions: VersionInfo[] = [];

	for await (const meta of store.list()) {
		const firstParent = meta.parents[0];
		versions.push({
			hash: meta.version,
			parent: firstParent?.version ?? null,
			created_at: meta.created_at,
		});
	}

	versions.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

	return ok(versions);
};

export const deleteContent = async (
	corpus: PostsCorpus,
	path: string
): Promise<Result<void, PostCorpusError>> => {
	const store = createDynamicStore(corpus, path);

	for await (const meta of store.list()) {
		const result = await store.delete(meta.version);
		if (!result.ok) return err(mapCorpusError(result.error));
	}

	return ok(undefined);
};
