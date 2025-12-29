import { type CorpusError, type PostContent, PostContentSchema, type Result, type VersionInfo, err, format_error, ok, pipe, try_catch_async } from "@blog/schema";

export const corpusPath = (userId: number, postUuid: string): string => `posts/${userId}/${postUuid}`;

const versionKey = (basePath: string, hash: string): string => `${basePath}/v/${hash}.json`;

const sha256 = async (content: string): Promise<string> => {
	const encoder = new TextEncoder();
	const data = encoder.encode(content);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
};

type R2Metadata = {
	parent?: string;
	created_at: string;
};

const ioError = (e: unknown): CorpusError => ({
	type: "io_error",
	message: format_error(e),
});

export const putContent = async (corpus: R2Bucket, path: string, content: PostContent, parent?: string): Promise<Result<{ hash: string }, CorpusError>> => {
	const serialized = JSON.stringify(content);
	const hash = await sha256(serialized);
	const key = versionKey(path, hash);
	const now = new Date().toISOString();

	const metadata: R2Metadata = {
		created_at: now,
		...(parent && { parent }),
	};

	return pipe(
		try_catch_async(
			() =>
				corpus.put(key, serialized, {
					httpMetadata: { contentType: "application/json" },
					customMetadata: metadata,
				}),
			ioError
		)
	)
		.map(() => ({ hash }))
		.result();
};

export const getContent = async (corpus: R2Bucket, path: string, hash: string): Promise<Result<PostContent, CorpusError>> => {
	const key = versionKey(path, hash);

	return pipe(try_catch_async(() => corpus.get(key), ioError))
		.flat_map(object => {
			if (!object) return err({ type: "not_found", path, version: hash });
			return ok(object);
		})
		.flat_map(object =>
			pipe(try_catch_async(() => object.text(), ioError))
				.map(raw => JSON.parse(raw))
				.flat_map(json => {
					const parsed = PostContentSchema.safeParse(json);
					if (!parsed.success) return err({ type: "invalid_content", message: parsed.error.message });
					return ok(parsed.data);
				})
				.result()
		)
		.result();
};

export const listVersions = async (corpus: R2Bucket, path: string): Promise<Result<VersionInfo[], CorpusError>> => {
	const prefix = `${path}/v/`;

	return pipe(try_catch_async(() => corpus.list({ prefix }), ioError))
		.map(listed =>
			listed.objects
				.map(obj => {
					const hash = obj.key.replace(prefix, "").replace(".json", "");
					const meta = obj.customMetadata ?? {};
					const parent = meta.parent ?? null;
					const createdAtStr = meta.created_at;
					const created_at = createdAtStr ? new Date(createdAtStr) : obj.uploaded;
					return { hash, parent, created_at };
				})
				.sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
		)
		.result();
};

export const deleteContent = async (corpus: R2Bucket, path: string): Promise<Result<void, CorpusError>> => {
	const prefix = `${path}/v/`;

	return pipe(try_catch_async(() => corpus.list({ prefix }), ioError))
		.flat_map(listed => {
			const keys = listed.objects.map(obj => obj.key);
			if (keys.length === 0) return ok(undefined);
			return try_catch_async(() => corpus.delete(keys), ioError);
		})
		.map(() => undefined)
		.result();
};
