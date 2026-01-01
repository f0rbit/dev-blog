import { sql } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { integer, primaryKey, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

// Generic Drizzle SQLite database type - works with both D1 and bun-sqlite
// biome-ignore lint/suspicious/noExplicitAny: Drizzle uses 'any' for flexible query/result types
export type DrizzleDB = BaseSQLiteDatabase<"async", any, Record<string, never>>;

export const users = sqliteTable("users", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	github_id: integer("github_id").notNull().unique(),
	username: text("username").notNull(),
	email: text("email"),
	avatar_url: text("avatar_url"),
	created_at: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
	updated_at: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const posts = sqliteTable(
	"blog_posts",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		uuid: text("uuid").notNull().unique(),
		author_id: integer("author_id")
			.notNull()
			.references(() => users.id),
		slug: text("slug").notNull(),
		corpus_version: text("corpus_version"),
		category: text("category").notNull().default("root"),
		archived: integer("archived", { mode: "boolean" }).notNull().default(false),
		publish_at: integer("publish_at", { mode: "timestamp" }),
		created_at: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
		updated_at: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
	},
	table => [unique("posts_author_slug_unique").on(table.author_id, table.slug)]
);

export const categories = sqliteTable(
	"blog_categories",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		owner_id: integer("owner_id")
			.notNull()
			.references(() => users.id),
		name: text("name").notNull(),
		parent: text("parent").default("root"),
	},
	table => [unique("categories_owner_name_unique").on(table.owner_id, table.name)]
);

export const tags = sqliteTable(
	"blog_tags",
	{
		post_id: integer("post_id")
			.notNull()
			.references(() => posts.id, { onDelete: "cascade" }),
		tag: text("tag").notNull(),
	},
	table => [primaryKey({ columns: [table.post_id, table.tag] })]
);

export const accessKeys = sqliteTable("access_keys", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	user_id: integer("user_id")
		.notNull()
		.references(() => users.id),
	key_hash: text("key_hash").notNull().unique(),
	name: text("name").notNull(),
	note: text("note"),
	enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
	created_at: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const integrations = sqliteTable("blog_integrations", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	user_id: integer("user_id")
		.notNull()
		.references(() => users.id),
	source: text("source").notNull(),
	location: text("location").notNull(),
	data: text("data", { mode: "json" }).$type<Record<string, unknown>>(),
	last_fetch: integer("last_fetch", { mode: "timestamp" }),
	status: text("status").default("pending"),
	created_at: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const fetchLinks = sqliteTable(
	"blog_fetch_links",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		post_id: integer("post_id")
			.notNull()
			.references(() => posts.id, { onDelete: "cascade" }),
		integration_id: integer("integration_id")
			.notNull()
			.references(() => integrations.id, { onDelete: "cascade" }),
		identifier: text("identifier").notNull(),
	},
	table => [unique("fetch_links_integration_identifier_unique").on(table.integration_id, table.identifier)]
);

export const projectsCache = sqliteTable("blog_projects_cache", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	user_id: integer("user_id")
		.notNull()
		.references(() => users.id),
	status: text("status").notNull().default("pending"),
	data: text("data", { mode: "json" }).$type<Record<string, unknown>>(),
	fetched_at: integer("fetched_at", { mode: "timestamp" }),
});

export const postProjects = sqliteTable(
	"blog_post_projects",
	{
		post_id: integer("post_id")
			.notNull()
			.references(() => posts.id, { onDelete: "cascade" }),
		project_id: text("project_id").notNull(),
		created_at: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
	},
	table => [primaryKey({ columns: [table.post_id, table.project_id] })]
);

export type PostProject = typeof postProjects.$inferSelect;
export type PostProjectInsert = typeof postProjects.$inferInsert;

export type User = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;

export type PostRow = typeof posts.$inferSelect;
export type PostRowInsert = typeof posts.$inferInsert;

export type Category = typeof categories.$inferSelect;
export type CategoryInsert = typeof categories.$inferInsert;

export type Tag = typeof tags.$inferSelect;
export type TagInsert = typeof tags.$inferInsert;

export type AccessKey = typeof accessKeys.$inferSelect;
export type AccessKeyInsert = typeof accessKeys.$inferInsert;

export type Integration = typeof integrations.$inferSelect;
export type IntegrationInsert = typeof integrations.$inferInsert;

export type FetchLink = typeof fetchLinks.$inferSelect;
export type FetchLinkInsert = typeof fetchLinks.$inferInsert;

export type ProjectCache = typeof projectsCache.$inferSelect;
export type ProjectCacheInsert = typeof projectsCache.$inferInsert;
