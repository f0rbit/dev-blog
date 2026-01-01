import { AccessKeyCreateSchema, AccessKeyUpdateSchema, type AppContext } from "@blog/schema";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { withAuth } from "../middleware/require-auth";
import { type CreatedToken, type SanitizedToken, createTokenService, generateToken, hashToken, sanitizeToken } from "../services/tokens";

export { generateToken, hashToken, sanitizeToken };
export type { CreatedToken, SanitizedToken };

type Variables = {
	user: { id: number };
	appContext: AppContext;
};

const TokenIdSchema = z.object({
	id: z.coerce.number().int().positive(),
});

export const tokensRouter = new Hono<{ Variables: Variables }>();

tokensRouter.get(
	"/",
	withAuth(async (c, user, ctx) => {
		const service = createTokenService({ db: ctx.db });

		const result = await service.list(user.id);
		if (!result.ok) {
			const error = result.error;
			const message = error.type === "db_error" ? error.message : "Unknown error";
			return c.json({ code: "DB_ERROR", message }, 500);
		}

		return c.json({ tokens: result.value });
	})
);

tokensRouter.post(
	"/",
	zValidator("json", AccessKeyCreateSchema),
	withAuth(async (c, user, ctx) => {
		const data = AccessKeyCreateSchema.parse(await c.req.json());
		const service = createTokenService({ db: ctx.db });

		const result = await service.create(user.id, data);
		if (!result.ok) {
			const error = result.error;
			const message = error.type === "db_error" ? error.message : "Unknown error";
			return c.json({ code: "DB_ERROR", message }, 500);
		}

		return c.json(result.value, 201);
	})
);

tokensRouter.put(
	"/:id",
	zValidator("param", TokenIdSchema),
	zValidator("json", AccessKeyUpdateSchema),
	withAuth(async (c, user, ctx) => {
		const { id } = TokenIdSchema.parse(c.req.param());
		const data = AccessKeyUpdateSchema.parse(await c.req.json());
		const service = createTokenService({ db: ctx.db });

		const result = await service.update(user.id, id, data);
		if (!result.ok) {
			const error = result.error;
			if (error.type === "not_found") {
				return c.json({ code: "NOT_FOUND", message: "Token not found" }, 404);
			}
			return c.json({ code: "DB_ERROR", message: error.message }, 500);
		}

		return c.json(result.value);
	})
);

tokensRouter.delete(
	"/:id",
	zValidator("param", TokenIdSchema),
	withAuth(async (c, user, ctx) => {
		const { id } = TokenIdSchema.parse(c.req.param());
		const service = createTokenService({ db: ctx.db });

		const result = await service.delete(user.id, id);
		if (!result.ok) {
			const error = result.error;
			if (error.type === "not_found") {
				return c.json({ code: "NOT_FOUND", message: "Token not found" }, 404);
			}
			return c.json({ code: "DB_ERROR", message: error.message }, 500);
		}

		return c.body(null, 204);
	})
);
