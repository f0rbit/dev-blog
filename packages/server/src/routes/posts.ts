import { type Env, PostCreateSchema, PostListParamsSchema, PostUpdateSchema, type User } from "@blog/schema";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { type PostService, createPostService } from "../services/posts";

type Variables = {
	user: User;
	postService: PostService;
};

export const postsRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

const UuidParam = z.object({
	uuid: z.string().uuid(),
});

const SlugParam = z.object({
	slug: z.string().min(1),
});

const HashParam = z.object({
	hash: z.string().min(1),
});

const serviceErrorToResponse = (error: {
	type: string;
	resource?: string;
	slug?: string;
	message?: string;
	inner?: { type: string; message?: string; path?: string };
}): { status: 400 | 404 | 409 | 500; body: { code: string; message: string } } => {
	switch (error.type) {
		case "not_found":
			return {
				status: 404,
				body: { code: "NOT_FOUND", message: `Resource not found: ${error.resource}` },
			};
		case "slug_conflict":
			return {
				status: 409,
				body: { code: "CONFLICT", message: `Slug already exists: ${error.slug}` },
			};
		case "corpus_error":
			return {
				status: 500,
				body: { code: "CORPUS_ERROR", message: error.inner?.message ?? "Corpus operation failed" },
			};
		case "db_error":
			return {
				status: 500,
				body: { code: "DB_ERROR", message: error.message ?? "Database operation failed" },
			};
		default:
			return {
				status: 500,
				body: { code: "UNKNOWN_ERROR", message: "An unexpected error occurred" },
			};
	}
};

postsRouter.use("*", async (c, next) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ code: "UNAUTHORIZED", message: "Authentication required" }, 401);
	}

	const service = createPostService({
		db: c.env.db,
		corpus: c.env.corpus,
	});
	c.set("postService", service);

	return next();
});

postsRouter.get("/", zValidator("query", PostListParamsSchema), async c => {
	const params = c.req.valid("query");
	const user = c.get("user");
	const service = c.get("postService");

	const result = await service.list(user.id, params);

	if (!result.ok) {
		const { status, body } = serviceErrorToResponse(result.error);
		return c.json(body, status);
	}

	return c.json(result.value);
});

postsRouter.get("/:slug", zValidator("param", SlugParam), async c => {
	const { slug } = c.req.valid("param");
	const user = c.get("user");
	const service = c.get("postService");

	const result = await service.getBySlug(user.id, slug);

	if (!result.ok) {
		const { status, body } = serviceErrorToResponse(result.error);
		return c.json(body, status);
	}

	return c.json(result.value);
});

postsRouter.post("/", zValidator("json", PostCreateSchema), async c => {
	const input = c.req.valid("json");
	const user = c.get("user");
	const service = c.get("postService");

	const result = await service.create(user.id, input);

	if (!result.ok) {
		const { status, body } = serviceErrorToResponse(result.error);
		return c.json(body, status);
	}

	return c.json(result.value, 201);
});

postsRouter.put("/:uuid", zValidator("param", UuidParam), zValidator("json", PostUpdateSchema), async c => {
	const { uuid } = c.req.valid("param");
	const input = c.req.valid("json");
	const user = c.get("user");
	const service = c.get("postService");

	const result = await service.update(user.id, uuid, input);

	if (!result.ok) {
		const { status, body } = serviceErrorToResponse(result.error);
		return c.json(body, status);
	}

	return c.json(result.value);
});

postsRouter.delete("/:uuid", zValidator("param", UuidParam), async c => {
	const { uuid } = c.req.valid("param");
	const user = c.get("user");
	const service = c.get("postService");

	const result = await service.delete(user.id, uuid);

	if (!result.ok) {
		const { status, body } = serviceErrorToResponse(result.error);
		return c.json(body, status);
	}

	return c.json({ success: true });
});

postsRouter.get("/:uuid/versions", zValidator("param", UuidParam), async c => {
	const { uuid } = c.req.valid("param");
	const user = c.get("user");
	const service = c.get("postService");

	const result = await service.listVersions(user.id, uuid);

	if (!result.ok) {
		const { status, body } = serviceErrorToResponse(result.error);
		return c.json(body, status);
	}

	return c.json({ versions: result.value });
});

postsRouter.get("/:uuid/version/:hash", zValidator("param", UuidParam.merge(HashParam)), async c => {
	const { uuid, hash } = c.req.valid("param");
	const user = c.get("user");
	const service = c.get("postService");

	const result = await service.getVersion(user.id, uuid, hash);

	if (!result.ok) {
		const { status, body } = serviceErrorToResponse(result.error);
		return c.json(body, status);
	}

	return c.json(result.value);
});

postsRouter.post("/:uuid/restore/:hash", zValidator("param", UuidParam.merge(HashParam)), async c => {
	const { uuid, hash } = c.req.valid("param");
	const user = c.get("user");
	const service = c.get("postService");

	const result = await service.restoreVersion(user.id, uuid, hash);

	if (!result.ok) {
		const { status, body } = serviceErrorToResponse(result.error);
		return c.json(body, status);
	}

	return c.json(result.value);
});
