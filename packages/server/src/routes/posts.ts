import { type AppContext, PostCreateSchema, PostListParamsSchema, PostUpdateSchema } from "@blog/schema";
import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
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

const UuidParamSchema = z.object({
	uuid: z.string().uuid(),
});

const SlugParamSchema = z.object({
	slug: z.string().min(1),
});

const HashParamSchema = z.object({
	hash: z.string().min(1),
});

const UuidHashParamSchema = UuidParamSchema.merge(HashParamSchema);

type ValidTarget = "query" | "param" | "json";
const valid = <T>(c: Context, target: ValidTarget): T => (c.req.valid as (t: ValidTarget) => T)(target);

postsRouter.get(
	"/",
	zValidator("query", PostListParamsSchema),
	withAuth(async (c, user, ctx) => {
		const params = valid<z.infer<typeof PostListParamsSchema>>(c, "query");
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
	zValidator("param", SlugParamSchema),
	withAuth(async (c, user, ctx) => {
		const { slug } = valid<z.infer<typeof SlugParamSchema>>(c, "param");
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
		const input = valid<z.infer<typeof PostCreateSchema>>(c, "json");
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
	zValidator("param", UuidParamSchema),
	zValidator("json", PostUpdateSchema),
	withAuth(async (c, user, ctx) => {
		const { uuid } = valid<z.infer<typeof UuidParamSchema>>(c, "param");
		const input = valid<z.infer<typeof PostUpdateSchema>>(c, "json");
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
	zValidator("param", UuidParamSchema),
	withAuth(async (c, user, ctx) => {
		const { uuid } = valid<z.infer<typeof UuidParamSchema>>(c, "param");
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
	zValidator("param", UuidParamSchema),
	withAuth(async (c, user, ctx) => {
		const { uuid } = valid<z.infer<typeof UuidParamSchema>>(c, "param");
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
	zValidator("param", UuidHashParamSchema),
	withAuth(async (c, user, ctx) => {
		const { uuid, hash } = valid<z.infer<typeof UuidHashParamSchema>>(c, "param");
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
	zValidator("param", UuidHashParamSchema),
	withAuth(async (c, user, ctx) => {
		const { uuid, hash } = valid<z.infer<typeof UuidHashParamSchema>>(c, "param");
		const service = createPostService({ db: ctx.db, corpus: ctx.corpus });

		const result = await service.restoreVersion(user.id, uuid, hash);

		if (!result.ok) {
			const { status, body } = mapServiceErrorToResponse(result.error);
			return c.json(body, status);
		}

		return c.json(result.value);
	})
);
