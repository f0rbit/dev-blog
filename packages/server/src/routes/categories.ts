import { type AppContext, CategoryCreateSchema } from "@blog/schema";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { withAuth } from "../middleware/require-auth";
import { type CategoryNode, type CategoryUpdate, buildCategoryTree, createCategoryService } from "../services/categories";

export { buildCategoryTree };
export type { CategoryNode };

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
			const error = result.error;
			return c.json({ code: "DB_ERROR", message: "message" in error ? error.message : "Unknown error" }, 500);
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
			if (error.type === "conflict") {
				const code = error.message.includes("Parent") ? "BAD_REQUEST" : "CONFLICT";
				const status = error.message.includes("Parent") ? 400 : 409;
				return c.json({ code, message: error.message }, status);
			}
			return c.json({ code: "DB_ERROR", message: "message" in error ? error.message : "Unknown error" }, 500);
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
			const error = result.error;
			if (error.type === "not_found") {
				return c.json({ code: "NOT_FOUND", message: "Category not found" }, 404);
			}
			if (error.type === "conflict") {
				return c.json({ code: "CONFLICT", message: error.message }, 409);
			}
			return c.json({ code: "DB_ERROR", message: "message" in error ? error.message : "Unknown error" }, 500);
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
			const error = result.error;
			if (error.type === "not_found") {
				return c.json({ code: "NOT_FOUND", message: "Category not found" }, 404);
			}
			if (error.type === "has_children") {
				return c.json({ code: "CONFLICT", message: "Cannot delete category with children" }, 409);
			}
			if (error.type === "has_posts") {
				return c.json({ code: "CONFLICT", message: "Cannot delete category with posts" }, 409);
			}
			return c.json({ code: "DB_ERROR", message: "message" in error ? error.message : "Unknown error" }, 500);
		}

		return c.body(null, 204);
	})
);
