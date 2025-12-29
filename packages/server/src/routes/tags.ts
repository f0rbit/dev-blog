import { type ApiError, type DrizzleDB, type Env, type Result, err, ok } from "@blog/schema";
import * as schema from "@blog/schema/database";
import { zValidator } from "@hono/zod-validator";
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

type AuthEnv = {
	Bindings: Env;
	Variables: { user: { id: number } };
};

interface TagWithCount {
	tag: string;
	count: number;
}

const PostUuidSchema = z.object({
	uuid: z.string().uuid(),
});

const TagParamSchema = z.object({
	uuid: z.string().uuid(),
	tag: z.string().min(1),
});

const TagsBodySchema = z.object({
	tags: z.array(z.string().min(1)),
});

const findPostByUuid = async (db: DrizzleDB, authorId: number, uuid: string): Promise<Result<schema.PostRow, ApiError>> => {
	const [post] = await db
		.select()
		.from(schema.posts)
		.where(and(eq(schema.posts.author_id, authorId), eq(schema.posts.uuid, uuid)))
		.limit(1);

	if (!post) {
		return err({ code: "NOT_FOUND", message: "Post not found" });
	}

	return ok(post);
};

const getPostTags = async (db: DrizzleDB, postId: number): Promise<string[]> => {
	const tags = await db.select({ tag: schema.tags.tag }).from(schema.tags).where(eq(schema.tags.post_id, postId));

	return tags.map(t => t.tag);
};

export const tagsRouter = new Hono<AuthEnv>();

tagsRouter.get("/", async c => {
	const user = c.get("user");
	const db = c.env.db;

	const tagCounts = await db
		.select({
			tag: schema.tags.tag,
			count: sql<number>`count(*)`.as("count"),
		})
		.from(schema.tags)
		.innerJoin(schema.posts, eq(schema.tags.post_id, schema.posts.id))
		.where(eq(schema.posts.author_id, user.id))
		.groupBy(schema.tags.tag)
		.orderBy(schema.tags.tag);

	const tags: TagWithCount[] = tagCounts.map(row => ({
		tag: row.tag,
		count: Number(row.count),
	}));

	return c.json({ tags });
});

tagsRouter.get("/posts/:uuid/tags", zValidator("param", PostUuidSchema), async c => {
	const user = c.get("user");
	const { uuid } = c.req.valid("param");
	const db = c.env.db;

	const postResult = await findPostByUuid(db, user.id, uuid);
	if (!postResult.ok) {
		return c.json(postResult.error, 404);
	}

	const tags = await getPostTags(db, postResult.value.id);

	return c.json({ tags });
});

tagsRouter.put("/posts/:uuid/tags", zValidator("param", PostUuidSchema), zValidator("json", TagsBodySchema), async c => {
	const user = c.get("user");
	const { uuid } = c.req.valid("param");
	const { tags: newTags } = c.req.valid("json");
	const db = c.env.db;

	const postResult = await findPostByUuid(db, user.id, uuid);
	if (!postResult.ok) {
		return c.json(postResult.error, 404);
	}

	const postId = postResult.value.id;

	await db.delete(schema.tags).where(eq(schema.tags.post_id, postId));

	const uniqueTags = [...new Set(newTags)];

	if (uniqueTags.length > 0) {
		await db.insert(schema.tags).values(uniqueTags.map(tag => ({ post_id: postId, tag })));
	}

	return c.json({ tags: uniqueTags });
});

tagsRouter.post("/posts/:uuid/tags", zValidator("param", PostUuidSchema), zValidator("json", TagsBodySchema), async c => {
	const user = c.get("user");
	const { uuid } = c.req.valid("param");
	const { tags: tagsToAdd } = c.req.valid("json");
	const db = c.env.db;

	const postResult = await findPostByUuid(db, user.id, uuid);
	if (!postResult.ok) {
		return c.json(postResult.error, 404);
	}

	const postId = postResult.value.id;
	const existingTags = await getPostTags(db, postId);
	const existingSet = new Set(existingTags);

	const newTags = tagsToAdd.filter(tag => !existingSet.has(tag));

	if (newTags.length > 0) {
		await db.insert(schema.tags).values(newTags.map(tag => ({ post_id: postId, tag })));
	}

	const allTags = [...existingTags, ...newTags];

	return c.json({ tags: allTags }, 201);
});

tagsRouter.delete("/posts/:uuid/tags/:tag", zValidator("param", TagParamSchema), async c => {
	const user = c.get("user");
	const { uuid, tag } = c.req.valid("param");
	const db = c.env.db;

	const postResult = await findPostByUuid(db, user.id, uuid);
	if (!postResult.ok) {
		return c.json(postResult.error, 404);
	}

	const postId = postResult.value.id;

	const [existing] = await db
		.select()
		.from(schema.tags)
		.where(and(eq(schema.tags.post_id, postId), eq(schema.tags.tag, tag)))
		.limit(1);

	if (!existing) {
		return c.json({ code: "NOT_FOUND", message: "Tag not found on post" }, 404);
	}

	await db.delete(schema.tags).where(and(eq(schema.tags.post_id, postId), eq(schema.tags.tag, tag)));

	return c.body(null, 204);
});
