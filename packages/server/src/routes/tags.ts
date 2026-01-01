import type { AppContext } from "@blog/schema";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { withAuth } from "../middleware/require-auth";
import { type TagWithCount, createTagService } from "../services/tags";
import { mapServiceErrorToResponse } from "../utils/errors";

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
			const { status, body } = mapServiceErrorToResponse(result.error);
			return c.json(body, status);
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
			const { status, body } = mapServiceErrorToResponse(postResult.error);
			return c.json(body, status);
		}

		const tagsResult = await service.getPostTags(postResult.value.id);
		if (!tagsResult.ok) {
			const { status, body } = mapServiceErrorToResponse(tagsResult.error);
			return c.json(body, status);
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
			const { status, body } = mapServiceErrorToResponse(postResult.error);
			return c.json(body, status);
		}

		const result = await service.setPostTags(postResult.value.id, newTags);
		if (!result.ok) {
			const { status, body } = mapServiceErrorToResponse(result.error);
			return c.json(body, status);
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
			const { status, body } = mapServiceErrorToResponse(postResult.error);
			return c.json(body, status);
		}

		const result = await service.addPostTags(postResult.value.id, tagsToAdd);
		if (!result.ok) {
			const { status, body } = mapServiceErrorToResponse(result.error);
			return c.json(body, status);
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
			const { status, body } = mapServiceErrorToResponse(postResult.error);
			return c.json(body, status);
		}

		const result = await service.removePostTag(postResult.value.id, tag);
		if (!result.ok) {
			const { status, body } = mapServiceErrorToResponse(result.error);
			return c.json(body, status);
		}

		return c.body(null, 204);
	})
);
