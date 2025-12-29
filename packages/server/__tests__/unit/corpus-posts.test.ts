import { beforeEach, describe, expect, it } from "bun:test";
import type { PostContent } from "@blog/schema";

type R2ObjectBody = {
	text: () => Promise<string>;
	customMetadata?: Record<string, string>;
};

type R2Object = R2ObjectBody & {
	key: string;
	uploaded: Date;
	customMetadata?: Record<string, string>;
};

type R2ListResult = {
	objects: R2Object[];
};

type StoredItem = {
	body: string;
	metadata: Record<string, string>;
	uploaded: Date;
};

class MemoryR2Bucket {
	private store = new Map<string, StoredItem>();

	async put(key: string, body: string, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }): Promise<void> {
		this.store.set(key, {
			body,
			metadata: options?.customMetadata ?? {},
			uploaded: new Date(),
		});
	}

	async get(key: string): Promise<R2ObjectBody | null> {
		const stored = this.store.get(key);
		if (!stored) return null;

		return {
			text: async () => stored.body,
			customMetadata: stored.metadata,
		};
	}

	async list(options?: { prefix?: string }): Promise<R2ListResult> {
		const prefix = options?.prefix ?? "";
		const objects: R2Object[] = [];

		for (const [key, value] of this.store.entries()) {
			if (key.startsWith(prefix)) {
				objects.push({
					key,
					uploaded: value.uploaded,
					customMetadata: value.metadata,
					text: async () => value.body,
				});
			}
		}

		return { objects };
	}

	async delete(keys: string | string[]): Promise<void> {
		const keyList = Array.isArray(keys) ? keys : [keys];
		for (const key of keyList) {
			this.store.delete(key);
		}
	}

	clear(): void {
		this.store.clear();
	}
}

import { corpusPath, deleteContent, getContent, listVersions, putContent } from "../../src/corpus/posts";

describe("corpus/posts", () => {
	let bucket: MemoryR2Bucket;

	beforeEach(() => {
		bucket = new MemoryR2Bucket();
	});

	describe("corpusPath", () => {
		it("generates correct path for user and post", () => {
			expect(corpusPath(1, "abc-123")).toBe("posts/1/abc-123");
			expect(corpusPath(42, "xyz-789")).toBe("posts/42/xyz-789");
		});

		it("handles various user ids", () => {
			expect(corpusPath(0, "uuid")).toBe("posts/0/uuid");
			expect(corpusPath(999999, "uuid")).toBe("posts/999999/uuid");
		});

		it("preserves uuid format", () => {
			const uuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
			expect(corpusPath(1, uuid)).toBe(`posts/1/${uuid}`);
		});
	});

	describe("putContent", () => {
		it("stores content and returns 64-char sha256 hash", async () => {
			const content: PostContent = {
				title: "Test Post",
				content: "Hello world",
				format: "md",
			};

			const result = await putContent(bucket as unknown as R2Bucket, "posts/1/test-uuid", content);

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value.hash).toMatch(/^[a-f0-9]{64}$/);
			}
		});

		it("generates consistent hashes for same content", async () => {
			const content: PostContent = {
				title: "Test Post",
				content: "Hello world",
				format: "md",
			};

			const result1 = await putContent(bucket as unknown as R2Bucket, "posts/1/test-1", content);
			const result2 = await putContent(bucket as unknown as R2Bucket, "posts/1/test-2", content);

			expect(result1.ok).toBe(true);
			expect(result2.ok).toBe(true);
			if (result1.ok && result2.ok) {
				expect(result1.value.hash).toBe(result2.value.hash);
			}
		});

		it("generates different hashes for different content", async () => {
			const content1: PostContent = { title: "Post 1", content: "A", format: "md" };
			const content2: PostContent = { title: "Post 2", content: "B", format: "md" };

			const result1 = await putContent(bucket as unknown as R2Bucket, "posts/1/test", content1);
			const result2 = await putContent(bucket as unknown as R2Bucket, "posts/1/test", content2);

			expect(result1.ok).toBe(true);
			expect(result2.ok).toBe(true);
			if (result1.ok && result2.ok) {
				expect(result1.value.hash).not.toBe(result2.value.hash);
			}
		});

		it("stores content with optional description", async () => {
			const content: PostContent = {
				title: "Test",
				content: "Body",
				description: "A description",
				format: "md",
			};

			const putResult = await putContent(bucket as unknown as R2Bucket, "posts/1/test", content);
			expect(putResult.ok).toBe(true);
			if (!putResult.ok) return;

			const getResult = await getContent(bucket as unknown as R2Bucket, "posts/1/test", putResult.value.hash);
			expect(getResult.ok).toBe(true);
			if (getResult.ok) {
				expect(getResult.value.description).toBe("A description");
			}
		});

		it("stores content with adoc format", async () => {
			const content: PostContent = {
				title: "Asciidoc Post",
				content: "= Title\n\nBody",
				format: "adoc",
			};

			const putResult = await putContent(bucket as unknown as R2Bucket, "posts/1/test", content);
			expect(putResult.ok).toBe(true);
			if (!putResult.ok) return;

			const getResult = await getContent(bucket as unknown as R2Bucket, "posts/1/test", putResult.value.hash);
			expect(getResult.ok).toBe(true);
			if (getResult.ok) {
				expect(getResult.value.format).toBe("adoc");
			}
		});
	});

	describe("getContent", () => {
		it("retrieves stored content", async () => {
			const content: PostContent = {
				title: "Test Post",
				content: "Hello world",
				description: "A test",
				format: "md",
			};

			const putResult = await putContent(bucket as unknown as R2Bucket, "posts/1/test", content);
			expect(putResult.ok).toBe(true);
			if (!putResult.ok) return;

			const getResult = await getContent(bucket as unknown as R2Bucket, "posts/1/test", putResult.value.hash);

			expect(getResult.ok).toBe(true);
			if (getResult.ok) {
				expect(getResult.value).toEqual(content);
			}
		});

		it("returns not_found for missing content", async () => {
			const result = await getContent(bucket as unknown as R2Bucket, "posts/1/missing", "nonexistent");

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.type).toBe("not_found");
			}
		});

		it("returns not_found for wrong hash", async () => {
			const content: PostContent = { title: "Test", content: "Body", format: "md" };
			await putContent(bucket as unknown as R2Bucket, "posts/1/test", content);

			const result = await getContent(bucket as unknown as R2Bucket, "posts/1/test", "wronghash");

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.type).toBe("not_found");
			}
		});

		it("retrieves specific version by hash", async () => {
			const content1: PostContent = { title: "V1", content: "First", format: "md" };
			const content2: PostContent = { title: "V2", content: "Second", format: "md" };

			const put1 = await putContent(bucket as unknown as R2Bucket, "posts/1/test", content1);
			const put2 = await putContent(bucket as unknown as R2Bucket, "posts/1/test", content2);

			expect(put1.ok && put2.ok).toBe(true);
			if (!put1.ok || !put2.ok) return;

			const get1 = await getContent(bucket as unknown as R2Bucket, "posts/1/test", put1.value.hash);
			const get2 = await getContent(bucket as unknown as R2Bucket, "posts/1/test", put2.value.hash);

			expect(get1.ok && get2.ok).toBe(true);
			if (get1.ok) expect(get1.value.title).toBe("V1");
			if (get2.ok) expect(get2.value.title).toBe("V2");
		});
	});

	describe("listVersions", () => {
		it("lists all versions for a path", async () => {
			const content1: PostContent = { title: "V1", content: "First", format: "md" };
			const content2: PostContent = { title: "V2", content: "Second", format: "md" };

			const put1 = await putContent(bucket as unknown as R2Bucket, "posts/1/test", content1);
			const put2 = await putContent(bucket as unknown as R2Bucket, "posts/1/test", content2, put1.ok ? put1.value.hash : undefined);

			expect(put1.ok).toBe(true);
			expect(put2.ok).toBe(true);

			const result = await listVersions(bucket as unknown as R2Bucket, "posts/1/test");

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value.length).toBe(2);
				expect(result.value.map(v => v.hash).sort()).toEqual([put1.ok ? put1.value.hash : "", put2.ok ? put2.value.hash : ""].sort());
			}
		});

		it("returns empty array for path with no versions", async () => {
			const result = await listVersions(bucket as unknown as R2Bucket, "posts/1/empty");

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toEqual([]);
			}
		});

		it("returns versions sorted by created_at descending (newest first)", async () => {
			const content1: PostContent = { title: "V1", content: "First", format: "md" };
			const content2: PostContent = { title: "V2", content: "Second", format: "md" };
			const content3: PostContent = { title: "V3", content: "Third", format: "md" };

			const put1 = await putContent(bucket as unknown as R2Bucket, "posts/1/test", content1);
			await new Promise(r => setTimeout(r, 10));
			const put2 = await putContent(bucket as unknown as R2Bucket, "posts/1/test", content2);
			await new Promise(r => setTimeout(r, 10));
			const put3 = await putContent(bucket as unknown as R2Bucket, "posts/1/test", content3);

			expect(put1.ok && put2.ok && put3.ok).toBe(true);
			if (!put1.ok || !put2.ok || !put3.ok) return;

			const result = await listVersions(bucket as unknown as R2Bucket, "posts/1/test");
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.length).toBe(3);
			expect(result.value[0].hash).toBe(put3.value.hash);
			expect(result.value[1].hash).toBe(put2.value.hash);
			expect(result.value[2].hash).toBe(put1.value.hash);
		});

		it("includes created_at timestamp for each version", async () => {
			const content: PostContent = { title: "Test", content: "Body", format: "md" };
			await putContent(bucket as unknown as R2Bucket, "posts/1/test", content);

			const result = await listVersions(bucket as unknown as R2Bucket, "posts/1/test");
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value[0].created_at).toBeInstanceOf(Date);
		});
	});

	describe("parent versioning", () => {
		it("stores parent reference when provided", async () => {
			const content1: PostContent = { title: "V1", content: "First", format: "md" };
			const content2: PostContent = { title: "V2", content: "Second", format: "md" };

			const put1 = await putContent(bucket as unknown as R2Bucket, "posts/1/test", content1);
			expect(put1.ok).toBe(true);
			if (!put1.ok) return;

			const put2 = await putContent(bucket as unknown as R2Bucket, "posts/1/test", content2, put1.value.hash);
			expect(put2.ok).toBe(true);

			const result = await listVersions(bucket as unknown as R2Bucket, "posts/1/test");
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			const v2 = result.value.find(v => v.hash === (put2.ok ? put2.value.hash : ""));
			expect(v2?.parent).toBe(put1.value.hash);
		});

		it("first version has null parent", async () => {
			const content: PostContent = { title: "Initial", content: "First version", format: "md" };
			await putContent(bucket as unknown as R2Bucket, "posts/1/test", content);

			const result = await listVersions(bucket as unknown as R2Bucket, "posts/1/test");
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value[0].parent).toBeNull();
		});

		it("maintains parent chain across multiple versions", async () => {
			const v1: PostContent = { title: "V1", content: "First", format: "md" };
			const v2: PostContent = { title: "V2", content: "Second", format: "md" };
			const v3: PostContent = { title: "V3", content: "Third", format: "md" };

			const put1 = await putContent(bucket as unknown as R2Bucket, "posts/1/test", v1);
			expect(put1.ok).toBe(true);
			if (!put1.ok) return;

			const put2 = await putContent(bucket as unknown as R2Bucket, "posts/1/test", v2, put1.value.hash);
			expect(put2.ok).toBe(true);
			if (!put2.ok) return;

			const put3 = await putContent(bucket as unknown as R2Bucket, "posts/1/test", v3, put2.value.hash);
			expect(put3.ok).toBe(true);
			if (!put3.ok) return;

			const result = await listVersions(bucket as unknown as R2Bucket, "posts/1/test");
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			const versions = result.value;
			const versionMap = new Map(versions.map(v => [v.hash, v]));

			const ver3 = versionMap.get(put3.value.hash);
			const ver2 = versionMap.get(put2.value.hash);
			const ver1 = versionMap.get(put1.value.hash);

			expect(ver1?.parent).toBeNull();
			expect(ver2?.parent).toBe(put1.value.hash);
			expect(ver3?.parent).toBe(put2.value.hash);
		});

		it("allows branching (same parent for multiple versions)", async () => {
			const base: PostContent = { title: "Base", content: "Original", format: "md" };
			const branch1: PostContent = { title: "Branch 1", content: "Change A", format: "md" };
			const branch2: PostContent = { title: "Branch 2", content: "Change B", format: "md" };

			const putBase = await putContent(bucket as unknown as R2Bucket, "posts/1/test", base);
			expect(putBase.ok).toBe(true);
			if (!putBase.ok) return;

			const putBranch1 = await putContent(bucket as unknown as R2Bucket, "posts/1/test", branch1, putBase.value.hash);
			const putBranch2 = await putContent(bucket as unknown as R2Bucket, "posts/1/test", branch2, putBase.value.hash);

			expect(putBranch1.ok && putBranch2.ok).toBe(true);
			if (!putBranch1.ok || !putBranch2.ok) return;

			const result = await listVersions(bucket as unknown as R2Bucket, "posts/1/test");
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			const versionMap = new Map(result.value.map(v => [v.hash, v]));

			expect(versionMap.get(putBranch1.value.hash)?.parent).toBe(putBase.value.hash);
			expect(versionMap.get(putBranch2.value.hash)?.parent).toBe(putBase.value.hash);
		});
	});

	describe("deleteContent", () => {
		it("removes all versions for a path", async () => {
			const content1: PostContent = { title: "V1", content: "First", format: "md" };
			const content2: PostContent = { title: "V2", content: "Second", format: "md" };

			await putContent(bucket as unknown as R2Bucket, "posts/1/test", content1);
			await putContent(bucket as unknown as R2Bucket, "posts/1/test", content2);

			const deleteResult = await deleteContent(bucket as unknown as R2Bucket, "posts/1/test");
			expect(deleteResult.ok).toBe(true);

			const listResult = await listVersions(bucket as unknown as R2Bucket, "posts/1/test");
			expect(listResult.ok).toBe(true);
			if (listResult.ok) {
				expect(listResult.value).toEqual([]);
			}
		});

		it("succeeds for non-existent path", async () => {
			const result = await deleteContent(bucket as unknown as R2Bucket, "posts/1/nonexistent");
			expect(result.ok).toBe(true);
		});

		it("does not affect other paths", async () => {
			const content: PostContent = { title: "Keep", content: "Me", format: "md" };

			await putContent(bucket as unknown as R2Bucket, "posts/1/keep", content);
			await putContent(bucket as unknown as R2Bucket, "posts/1/delete", content);

			await deleteContent(bucket as unknown as R2Bucket, "posts/1/delete");

			const keepResult = await listVersions(bucket as unknown as R2Bucket, "posts/1/keep");
			const deleteResult = await listVersions(bucket as unknown as R2Bucket, "posts/1/delete");

			expect(keepResult.ok && deleteResult.ok).toBe(true);
			if (keepResult.ok) expect(keepResult.value.length).toBe(1);
			if (deleteResult.ok) expect(deleteResult.value.length).toBe(0);
		});
	});
});
