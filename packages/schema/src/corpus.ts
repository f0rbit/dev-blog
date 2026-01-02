import { type CorpusError as LibCorpusError, define_store, json_codec } from "@f0rbit/corpus";
import { z } from "zod";

export const PostContentSchema = z.object({
	title: z.string().min(1),
	content: z.string(),
	description: z.string().optional(),
	format: z.enum(["md", "adoc"]),
});

export type PostContent = z.infer<typeof PostContentSchema>;

export const postsStoreDefinition = define_store("posts", json_codec(PostContentSchema));

export const postStoreId = (userId: number, postUuid: string): string => `posts/${userId}/${postUuid}`;

export const ProjectSchema = z.object({
	id: z.string(),
	owner_id: z.string(),
	project_id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	specification: z.string().nullable(),
	repo_url: z.string().nullable(),
	repo_id: z.number().nullable(),
	icon_url: z.string().nullable(),
	status: z.enum(["DEVELOPMENT", "PAUSED", "RELEASED", "LIVE", "FINISHED", "ABANDONED", "STOPPED"]),
	link_url: z.string().nullable(),
	link_text: z.string().nullable(),
	visibility: z.enum(["PUBLIC", "PRIVATE", "HIDDEN", "ARCHIVED", "DRAFT", "DELETED"]),
	current_version: z.string().nullable(),
	scan_branch: z.string().nullable(),
	created_at: z.string(),
	updated_at: z.string(),
	deleted: z.boolean(),
});

export type Project = z.infer<typeof ProjectSchema>;

export const ProjectsCacheSchema = z.object({
	projects: z.array(ProjectSchema),
	fetched_at: z.string(),
});

export type ProjectsCache = z.infer<typeof ProjectsCacheSchema>;

export const projectsCacheStoreDefinition = define_store("projects-cache", json_codec(ProjectsCacheSchema));

export const projectsCacheStoreId = (userId: number): string => `projects/${userId}/cache`;

export const corpusPath = postStoreId;

export const VersionInfoSchema = z.object({
	hash: z.string(),
	parent: z.string().nullable(),
	created_at: z.date(),
});

export type VersionInfo = z.infer<typeof VersionInfoSchema>;

export type PostCorpusError = { type: "not_found"; path: string; version?: string } | { type: "invalid_content"; message: string } | { type: "io_error"; message: string };

export const mapCorpusError = (e: LibCorpusError): PostCorpusError => {
	if (e.kind === "not_found") {
		return { type: "not_found", path: e.store_id, version: e.version };
	}
	if (e.kind === "decode_error" || e.kind === "validation_error") {
		return { type: "invalid_content", message: e.cause?.message ?? "Decode error" };
	}
	if (e.kind === "storage_error") {
		return { type: "io_error", message: e.cause?.message ?? "Storage error" };
	}
	return { type: "io_error", message: "Unknown corpus error" };
};

export const parsePostContent = PostContentSchema.parse.bind(PostContentSchema);
export const serializePostContent = (content: PostContent): string => JSON.stringify(content);
