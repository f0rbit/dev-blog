import { CategoryCreateSchema } from "@blog/schema";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { withAuth } from "../middleware/require-auth";
import { type CategoryUpdate, createCategoryService } from "../services/categories";
import { mapServiceErrorToResponse } from "../utils/errors";
import { type Variables, handleResult, valid } from "../utils/route-helpers";

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
		const data = valid<z.infer<typeof CategoryCreateSchema>>(c, "json");
		const service = createCategoryService({ db: ctx.db });
		const result = await service.create(user.id, data);
		return handleResult(c, result, 201);
	})
);

categoriesRouter.put(
	"/:name",
	zValidator("param", CategoryNameSchema),
	zValidator("json", CategoryUpdateSchema),
	withAuth(async (c, user, ctx) => {
		const { name } = valid<z.infer<typeof CategoryNameSchema>>(c, "param");
		const data = valid<z.infer<typeof CategoryUpdateSchema>>(c, "json") as CategoryUpdate;
		const service = createCategoryService({ db: ctx.db });
		const result = await service.update(user.id, name, data);
		return handleResult(c, result);
	})
);

categoriesRouter.delete(
	"/:name",
	zValidator("param", CategoryNameSchema),
	withAuth(async (c, user, ctx) => {
		const { name } = valid<z.infer<typeof CategoryNameSchema>>(c, "param");
		const service = createCategoryService({ db: ctx.db });

		const result = await service.delete(user.id, name);
		if (!result.ok) {
			const { status, body } = mapServiceErrorToResponse(result.error);
			return c.json(body, status);
		}

		return c.body(null, 204);
	})
);
