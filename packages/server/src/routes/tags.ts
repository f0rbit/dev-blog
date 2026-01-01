import type { AppContext } from "@blog/schema";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { withAuth } from "../middleware/require-auth";
import { type TagWithCount, createTagService } from "../services/tags";

export type { TagWithCount };

type Variables = {
	user: { id: number };
	appContext: AppContext;
};

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

export const tagsRouter = new Hono<{ Variables: Variables }>();

tagsRouter.get(
	"/",
	withAuth(async (c, user, ctx) => {
		const service = createTagService({ db: ctx.db });

		const result = await service.list(user.id);
		if (!result.ok) {
			const error = result.error;
			const message = error.type === "db_error" ? error.message : "Unknown error";
			return c.json({ code: "DB_ERROR", message }, 500);
		}

		return c.json({ tags: result.value });
	})
);

tagsRouter.get(
	"/posts/:uuid/tags",
	zValidator("param", PostUuidSchema),
	withAuth(async (c, user, ctx) => {
		const { uuid } = PostUuidSchema.parse(c.req.param());
		const service = createTagService({ db: ctx.db });

		const postResult = await service.findPost(user.id, uuid);
		if (!postResult.ok) {
			return c.json({ code: "NOT_FOUND", message: "Post not found" }, 404);
		}

		const tagsResult = await service.getPostTags(postResult.value.id);
		if (!tagsResult.ok) {
			const error = tagsResult.error;
			const message = error.type === "db_error" ? error.message : "Unknown error";
			return c.json({ code: "DB_ERROR", message }, 500);
		}

		return c.json({ tags: tagsResult.value });
	})
);

tagsRouter.put(
	"/posts/:uuid/tags",
	zValidator("param", PostUuidSchema),
	zValidator("json", TagsBodySchema),
	withAuth(async (c, user, ctx) => {
		const { uuid } = PostUuidSchema.parse(c.req.param());
		const { tags: newTags } = TagsBodySchema.parse(await c.req.json());
		const service = createTagService({ db: ctx.db });

		const postResult = await service.findPost(user.id, uuid);
		if (!postResult.ok) {
			return c.json({ code: "NOT_FOUND", message: "Post not found" }, 404);
		}

		const result = await service.setPostTags(postResult.value.id, newTags);
		if (!result.ok) {
			const error = result.error;
			const message = error.type === "db_error" ? error.message : "Unknown error";
			return c.json({ code: "DB_ERROR", message }, 500);
		}

		return c.json({ tags: result.value });
	})
);

tagsRouter.post(
	"/posts/:uuid/tags",
	zValidator("param", PostUuidSchema),
	zValidator("json", TagsBodySchema),
	withAuth(async (c, user, ctx) => {
		const { uuid } = PostUuidSchema.parse(c.req.param());
		const { tags: tagsToAdd } = TagsBodySchema.parse(await c.req.json());
		const service = createTagService({ db: ctx.db });

		const postResult = await service.findPost(user.id, uuid);
		if (!postResult.ok) {
			return c.json({ code: "NOT_FOUND", message: "Post not found" }, 404);
		}

		const result = await service.addPostTags(postResult.value.id, tagsToAdd);
		if (!result.ok) {
			const error = result.error;
			const message = error.type === "db_error" ? error.message : "Unknown error";
			return c.json({ code: "DB_ERROR", message }, 500);
		}

		return c.json({ tags: result.value }, 201);
	})
);

tagsRouter.delete(
	"/posts/:uuid/tags/:tag",
	zValidator("param", TagParamSchema),
	withAuth(async (c, user, ctx) => {
		const { uuid, tag } = TagParamSchema.parse(c.req.param());
		const service = createTagService({ db: ctx.db });

		const postResult = await service.findPost(user.id, uuid);
		if (!postResult.ok) {
			return c.json({ code: "NOT_FOUND", message: "Post not found" }, 404);
		}

		const result = await service.removePostTag(postResult.value.id, tag);
		if (!result.ok) {
			const error = result.error;
			if (error.type === "not_found") {
				return c.json({ code: "NOT_FOUND", message: "Tag not found on post" }, 404);
			}
			return c.json({ code: "DB_ERROR", message: error.message }, 500);
		}

		return c.body(null, 204);
	})
);
