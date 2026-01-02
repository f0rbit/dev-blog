/// <reference types="@cloudflare/workers-types" />
import type { Corpus, Store } from "@f0rbit/corpus";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import type { PostContent } from "./corpus";
import { type DrizzleDB, accessKeys, categories, fetchLinks, integrations, postProjects, posts, projectsCache, tags, users } from "./tables";

export {
	ok,
	err,
	pipe,
	try_catch_async,
	unwrap_or,
	match,
	format_error,
	try_catch,
	fetch_result,
	first,
	last,
	at,
	to_nullable,
	to_fallback,
	type Result,
	type Pipe,
	type FetchError,
} from "@f0rbit/corpus";
export { PostContentSchema, type PostContent } from "./corpus";

// Drizzle-generated schemas
export const UserSchema = createSelectSchema(users);
export type User = z.infer<typeof UserSchema>;

export const UserInsertSchema = createInsertSchema(users);
export type UserInsert = z.infer<typeof UserInsertSchema>;

export const PostRowSchema = createSelectSchema(posts);
export type PostRow = z.infer<typeof PostRowSchema>;

export const PostRowInsertSchema = createInsertSchema(posts);
export type PostRowInsert = z.infer<typeof PostRowInsertSchema>;

export const CategorySchema = createSelectSchema(categories);
export type Category = z.infer<typeof CategorySchema>;

export const CategoryInsertSchema = createInsertSchema(categories);
export type CategoryInsert = z.infer<typeof CategoryInsertSchema>;

export const TagSchema = createSelectSchema(tags);
export type Tag = z.infer<typeof TagSchema>;

export const TagInsertSchema = createInsertSchema(tags);
export type TagInsert = z.infer<typeof TagInsertSchema>;

export const AccessKeyRowSchema = createSelectSchema(accessKeys);
export type AccessKeyRow = z.infer<typeof AccessKeyRowSchema>;

export const AccessKeySchema = AccessKeyRowSchema.omit({ key_hash: true });
export type AccessKey = z.infer<typeof AccessKeySchema>;

export const AccessKeyInsertSchema = createInsertSchema(accessKeys);
export type AccessKeyInsert = z.infer<typeof AccessKeyInsertSchema>;

export const IntegrationSchema = createSelectSchema(integrations);
export type Integration = z.infer<typeof IntegrationSchema>;

export const IntegrationInsertSchema = createInsertSchema(integrations);
export type IntegrationInsert = z.infer<typeof IntegrationInsertSchema>;

export const FetchLinkSchema = createSelectSchema(fetchLinks);
export type FetchLink = z.infer<typeof FetchLinkSchema>;

export const FetchLinkInsertSchema = createInsertSchema(fetchLinks);
export type FetchLinkInsert = z.infer<typeof FetchLinkInsertSchema>;

export const ProjectCacheSchema = createSelectSchema(projectsCache);
export type ProjectCache = z.infer<typeof ProjectCacheSchema>;

export const ProjectCacheInsertSchema = createInsertSchema(projectsCache);
export type ProjectCacheInsert = z.infer<typeof ProjectCacheInsertSchema>;

export const PostProjectSchema = createSelectSchema(postProjects);
export type PostProject = z.infer<typeof PostProjectSchema>;

export const PostProjectInsertSchema = createInsertSchema(postProjects);
export type PostProjectInsert = z.infer<typeof PostProjectInsertSchema>;

// Enriched Post schema (DB row + corpus content)
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
	project_ids: z.array(z.string()),
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
	project_ids: z.array(z.string()).optional(),
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
	project_ids: z.array(z.string()).optional(),
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

// Post status utilities
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

// Category API schema
export const CategoryCreateSchema = z.object({
	name: z.string().min(1),
	parent: z.string().default("root"),
});

export type CategoryCreate = z.infer<typeof CategoryCreateSchema>;

// AccessKey API schemas
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

// Integration API schema
export const IntegrationUpsertSchema = z.object({
	source: z.string().min(1),
	location: z.string().min(1),
	data: z.record(z.unknown()).optional(),
});

export type IntegrationUpsert = z.infer<typeof IntegrationUpsertSchema>;

// Generic API types
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

// App context types
export type Bindings = {
	DB: D1Database;
	CORPUS_BUCKET: R2Bucket;
	DEVPAD_API: string;
	ENVIRONMENT: string;
};

export type PostsCorpus = Corpus<{ posts: Store<PostContent> }>;

export type AppContext = {
	db: DrizzleDB;
	corpus: PostsCorpus;
	devpadApi: string;
	environment: string;
};

export type { DrizzleDB } from "./tables";
