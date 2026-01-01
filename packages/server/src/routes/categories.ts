import { type AppContext, CategoryCreateSchema } from "@blog/schema";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { withAuth } from "../middleware/require-auth";
import { type CategoryUpdate, createCategoryService } from "../services/categories";
import { mapServiceErrorToResponse } from "../utils/errors";

type Variables = {
	user: { id: number };
	appContext: AppContext;
};

const CategoryNameSchema = z.object({
	name: z.string().min(1),
});

const CategoryUpdateSchema = z.object({
	name: z.string().min(1),
});

export const categoriesRouter = new Hono<{ Variables: Variables }>();

categoriesRouter.get(
	"/",
	withAuth(async (c, user, ctx) => {
		const service = createCategoryService({ db: ctx.db });
		const result = await service.getTree(user.id);

		if (!result.ok) {
			const { status, body } = mapServiceErrorToResponse(result.error);
			return c.json(body, status);
		}

		return c.json({ categories: result.value });
	})
);

categoriesRouter.post(
	"/",
	zValidator("json", CategoryCreateSchema),
	withAuth(async (c, user, ctx) => {
		const data = CategoryCreateSchema.parse(await c.req.json());
		const service = createCategoryService({ db: ctx.db });

		const result = await service.create(user.id, data);
		if (!result.ok) {
			const error = result.error;
			if (error.type === "conflict" && error.message?.includes("Parent")) {
				return c.json({ code: "BAD_REQUEST", message: error.message }, 400);
			}
			const { status, body } = mapServiceErrorToResponse(error);
			return c.json(body, status);
		}

		return c.json(result.value, 201);
	})
);

categoriesRouter.put(
	"/:name",
	zValidator("param", CategoryNameSchema),
	zValidator("json", CategoryUpdateSchema),
	withAuth(async (c, user, ctx) => {
		const { name } = CategoryNameSchema.parse(c.req.param());
		const data = CategoryUpdateSchema.parse(await c.req.json()) as CategoryUpdate;
		const service = createCategoryService({ db: ctx.db });

		const result = await service.update(user.id, name, data);
		if (!result.ok) {
			const { status, body } = mapServiceErrorToResponse(result.error);
			return c.json(body, status);
		}

		return c.json(result.value);
	})
);

categoriesRouter.delete(
	"/:name",
	zValidator("param", CategoryNameSchema),
	withAuth(async (c, user, ctx) => {
		const { name } = CategoryNameSchema.parse(c.req.param());
		const service = createCategoryService({ db: ctx.db });

		const result = await service.delete(user.id, name);
		if (!result.ok) {
			const { status, body } = mapServiceErrorToResponse(result.error);
			return c.json(body, status);
		}

		return c.body(null, 204);
	})
);
