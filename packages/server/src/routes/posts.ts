import { type AppContext, PostCreateSchema, PostListParamsSchema, PostUpdateSchema } from "@blog/schema";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { withAuth } from "../middleware/require-auth";
import { createPostService } from "../services/posts";
import { mapServiceErrorToResponse } from "../utils/errors";

type Variables = {
	user: { id: number };
	appContext: AppContext;
};

export const postsRouter = new Hono<{ Variables: Variables }>();

const UuidParam = z.object({
	uuid: z.string().uuid(),
});

const SlugParam = z.object({
	slug: z.string().min(1),
});

const HashParam = z.object({
	hash: z.string().min(1),
});

postsRouter.get(
	"/",
	zValidator("query", PostListParamsSchema),
	withAuth(async (c, user, ctx) => {
		const params = PostListParamsSchema.parse(c.req.query());
		const service = createPostService({ db: ctx.db, corpus: ctx.corpus });

		const result = await service.list(user.id, params);

		if (!result.ok) {
			const { status, body } = mapServiceErrorToResponse(result.error);
			return c.json(body, status);
		}

		return c.json(result.value);
	})
);

postsRouter.get(
	"/:slug",
	zValidator("param", SlugParam),
	withAuth(async (c, user, ctx) => {
		const { slug } = SlugParam.parse(c.req.param());
		const service = createPostService({ db: ctx.db, corpus: ctx.corpus });

		const result = await service.getBySlug(user.id, slug);

		if (!result.ok) {
			const { status, body } = mapServiceErrorToResponse(result.error);
			return c.json(body, status);
		}

		return c.json(result.value);
	})
);

postsRouter.post(
	"/",
	zValidator("json", PostCreateSchema),
	withAuth(async (c, user, ctx) => {
		const input = PostCreateSchema.parse(await c.req.json());
		const service = createPostService({ db: ctx.db, corpus: ctx.corpus });

		const result = await service.create(user.id, input);

		if (!result.ok) {
			const { status, body } = mapServiceErrorToResponse(result.error);
			return c.json(body, status);
		}

		return c.json(result.value, 201);
	})
);

postsRouter.put(
	"/:uuid",
	zValidator("param", UuidParam),
	zValidator("json", PostUpdateSchema),
	withAuth(async (c, user, ctx) => {
		const { uuid } = UuidParam.parse(c.req.param());
		const input = PostUpdateSchema.parse(await c.req.json());
		const service = createPostService({ db: ctx.db, corpus: ctx.corpus });

		const result = await service.update(user.id, uuid, input);

		if (!result.ok) {
			const { status, body } = mapServiceErrorToResponse(result.error);
			return c.json(body, status);
		}

		return c.json(result.value);
	})
);

postsRouter.delete(
	"/:uuid",
	zValidator("param", UuidParam),
	withAuth(async (c, user, ctx) => {
		const { uuid } = UuidParam.parse(c.req.param());
		const service = createPostService({ db: ctx.db, corpus: ctx.corpus });

		const result = await service.delete(user.id, uuid);

		if (!result.ok) {
			const { status, body } = mapServiceErrorToResponse(result.error);
			return c.json(body, status);
		}

		return c.json({ success: true });
	})
);

postsRouter.get(
	"/:uuid/versions",
	zValidator("param", UuidParam),
	withAuth(async (c, user, ctx) => {
		const { uuid } = UuidParam.parse(c.req.param());
		const service = createPostService({ db: ctx.db, corpus: ctx.corpus });

		const result = await service.listVersions(user.id, uuid);

		if (!result.ok) {
			const { status, body } = mapServiceErrorToResponse(result.error);
			return c.json(body, status);
		}

		return c.json({ versions: result.value });
	})
);

postsRouter.get(
	"/:uuid/version/:hash",
	zValidator("param", UuidParam.merge(HashParam)),
	withAuth(async (c, user, ctx) => {
		const { uuid, hash } = UuidParam.merge(HashParam).parse(c.req.param());
		const service = createPostService({ db: ctx.db, corpus: ctx.corpus });

		const result = await service.getVersion(user.id, uuid, hash);

		if (!result.ok) {
			const { status, body } = mapServiceErrorToResponse(result.error);
			return c.json(body, status);
		}

		return c.json(result.value);
	})
);

postsRouter.post(
	"/:uuid/restore/:hash",
	zValidator("param", UuidParam.merge(HashParam)),
	withAuth(async (c, user, ctx) => {
		const { uuid, hash } = UuidParam.merge(HashParam).parse(c.req.param());
		const service = createPostService({ db: ctx.db, corpus: ctx.corpus });

		const result = await service.restoreVersion(user.id, uuid, hash);

		if (!result.ok) {
			const { status, body } = mapServiceErrorToResponse(result.error);
			return c.json(body, status);
		}

		return c.json(result.value);
	})
);
