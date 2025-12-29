/// <reference types="@cloudflare/workers-types" />
import { z } from "zod";
export { ok, err, pipe, try_catch_async, unwrap_or, match, format_error, type Result, type Pipe } from "@f0rbit/corpus";

export const PostContentSchema = z.object({
	title: z.string().min(1),
	content: z.string(),
	description: z.string().optional(),
	format: z.enum(["md", "adoc"]),
});

export type PostContent = z.infer<typeof PostContentSchema>;

export const PostSchema = z.object({
	id: z.number(),
	uuid: z.string().uuid(),
	author_id: z.number(),
	slug: z.string(),
	title: z.string(),
	content: z.string(),
	description: z.string().optional(),
	format: z.enum(["md", "adoc"]),
	category: z.string(),
	tags: z.array(z.string()),
	archived: z.boolean(),
	publish_at: z.coerce.date().nullable(),
	created_at: z.coerce.date(),
	updated_at: z.coerce.date(),
	project_id: z.string().nullable(),
	corpus_version: z.string().nullable(),
});

export type Post = z.infer<typeof PostSchema>;

const SlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const PostCreateSchema = z.object({
	slug: z.string().regex(SlugPattern, "Slug must be lowercase alphanumeric with hyphens"),
	title: z.string().min(1),
	content: z.string(),
	description: z.string().optional(),
	format: z.enum(["md", "adoc"]).default("md"),
	category: z.string().default("root"),
	tags: z.array(z.string()).default([]),
	publish_at: z.coerce.date().nullable().optional(),
	project_id: z.string().nullable().optional(),
});

export type PostCreate = z.infer<typeof PostCreateSchema>;

export const PostUpdateSchema = z.object({
	slug: z.string().regex(SlugPattern, "Slug must be lowercase alphanumeric with hyphens").optional(),
	title: z.string().min(1).optional(),
	content: z.string().optional(),
	description: z.string().optional(),
	format: z.enum(["md", "adoc"]).optional(),
	category: z.string().optional(),
	tags: z.array(z.string()).optional(),
	archived: z.boolean().optional(),
	publish_at: z.coerce.date().nullable().optional(),
	project_id: z.string().nullable().optional(),
});

export type PostUpdate = z.infer<typeof PostUpdateSchema>;

export const PostListParamsSchema = z.object({
	category: z.string().optional(),
	tag: z.string().optional(),
	project: z.string().optional(),
	status: z.enum(["published", "scheduled", "draft", "all"]).default("all"),
	archived: z.boolean().default(false),
	limit: z.coerce.number().min(1).max(100).default(10),
	offset: z.coerce.number().min(0).default(0),
	sort: z.enum(["created", "updated", "published"]).default("updated"),
});

export type PostListParams = z.infer<typeof PostListParamsSchema>;

export const PostsResponseSchema = z.object({
	posts: z.array(PostSchema),
	total_posts: z.number(),
	total_pages: z.number(),
	per_page: z.number(),
	current_page: z.number(),
});

export type PostsResponse = z.infer<typeof PostsResponseSchema>;

type PublishAtField = Pick<Post, "publish_at">;

export const isPublished = (post: PublishAtField): boolean => post.publish_at !== null && post.publish_at <= new Date();

export const isScheduled = (post: PublishAtField): boolean => post.publish_at !== null && post.publish_at > new Date();

export const isDraft = (post: PublishAtField): boolean => post.publish_at === null;

export type PostStatus = "published" | "scheduled" | "draft";

export const postStatus = (post: PublishAtField): PostStatus => {
	if (isDraft(post)) return "draft";
	if (isScheduled(post)) return "scheduled";
	return "published";
};

export const UserSchema = z.object({
	id: z.number(),
	github_id: z.number(),
	username: z.string(),
	email: z.string().nullable(),
	avatar_url: z.string().nullable(),
	created_at: z.coerce.date(),
	updated_at: z.coerce.date(),
});

export type User = z.infer<typeof UserSchema>;

export const CategorySchema = z.object({
	id: z.number(),
	owner_id: z.number(),
	name: z.string(),
	parent: z.string().nullable(),
});

export type Category = z.infer<typeof CategorySchema>;

export const CategoryCreateSchema = z.object({
	name: z.string().min(1),
	parent: z.string().default("root"),
});

export type CategoryCreate = z.infer<typeof CategoryCreateSchema>;

export const TagSchema = z.object({
	post_id: z.number(),
	tag: z.string(),
});

export type Tag = z.infer<typeof TagSchema>;

export const AccessKeySchema = z.object({
	id: z.number(),
	user_id: z.number(),
	name: z.string(),
	note: z.string().nullable(),
	enabled: z.boolean(),
	created_at: z.coerce.date(),
});

export type AccessKey = z.infer<typeof AccessKeySchema>;

export const AccessKeyCreateSchema = z.object({
	name: z.string().min(1),
	note: z.string().optional(),
});

export type AccessKeyCreate = z.infer<typeof AccessKeyCreateSchema>;

export const AccessKeyUpdateSchema = z.object({
	name: z.string().min(1).optional(),
	note: z.string().optional(),
	enabled: z.boolean().optional(),
});

export type AccessKeyUpdate = z.infer<typeof AccessKeyUpdateSchema>;

export const IntegrationSchema = z.object({
	id: z.number(),
	user_id: z.number(),
	source: z.string(),
	location: z.string(),
	data: z.record(z.unknown()).nullable(),
	last_fetch: z.coerce.date().nullable(),
	status: z.string().nullable(),
	created_at: z.coerce.date(),
});

export type Integration = z.infer<typeof IntegrationSchema>;

export const IntegrationUpsertSchema = z.object({
	source: z.string().min(1),
	location: z.string().min(1),
	data: z.record(z.unknown()).optional(),
});

export type IntegrationUpsert = z.infer<typeof IntegrationUpsertSchema>;

export const FetchLinkSchema = z.object({
	id: z.number(),
	post_id: z.number(),
	integration_id: z.number(),
	identifier: z.string(),
});

export type FetchLink = z.infer<typeof FetchLinkSchema>;

export const ProjectCacheSchema = z.object({
	id: z.number(),
	user_id: z.number(),
	status: z.string(),
	data: z.record(z.unknown()).nullable(),
	fetched_at: z.coerce.date().nullable(),
});

export type ProjectCache = z.infer<typeof ProjectCacheSchema>;

export type ApiError = {
	code: string;
	message: string;
	details?: Record<string, unknown>;
};

export type PaginatedResponse<T> = {
	items: T[];
	total: number;
	limit: number;
	offset: number;
	hasMore: boolean;
};

export interface Env {
	DB: D1Database;
	CORPUS: R2Bucket;
	DEVPAD_API: string;
	ENVIRONMENT: string;
}
