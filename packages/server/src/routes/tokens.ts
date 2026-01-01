import { AccessKeyCreateSchema, AccessKeyUpdateSchema, type AppContext } from "@blog/schema";
import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { withAuth } from "../middleware/require-auth";
import { type CreatedToken, type SanitizedToken, createTokenService } from "../services/tokens";
import { mapServiceErrorToResponse } from "../utils/errors";

export type { CreatedToken, SanitizedToken };

type Variables = {
	user: { id: number };
	appContext: AppContext;
};

const TokenIdSchema = z.object({
	id: z.coerce.number().int().positive(),
});

type ValidTarget = "query" | "param" | "json";
const valid = <T>(c: Context, target: ValidTarget): T => (c.req.valid as (t: ValidTarget) => T)(target);

export const tokensRouter = new Hono<{ Variables: Variables }>();

tokensRouter.get(
	"/",
	withAuth(async (c, user, ctx) => {
		const service = createTokenService({ db: ctx.db });

		const result = await service.list(user.id);
		if (!result.ok) {
			const { status, body } = mapServiceErrorToResponse(result.error);
			return c.json(body, status);
		}

		return c.json({ tokens: result.value });
	})
);

tokensRouter.post(
	"/",
	zValidator("json", AccessKeyCreateSchema),
	withAuth(async (c, user, ctx) => {
		const data = valid<z.infer<typeof AccessKeyCreateSchema>>(c, "json");
		const service = createTokenService({ db: ctx.db });

		const result = await service.create(user.id, data);
		if (!result.ok) {
			const { status, body } = mapServiceErrorToResponse(result.error);
			return c.json(body, status);
		}

		return c.json(result.value, 201);
	})
);

tokensRouter.put(
	"/:id",
	zValidator("param", TokenIdSchema),
	zValidator("json", AccessKeyUpdateSchema),
	withAuth(async (c, user, ctx) => {
		const { id } = valid<z.infer<typeof TokenIdSchema>>(c, "param");
		const data = valid<z.infer<typeof AccessKeyUpdateSchema>>(c, "json");
		const service = createTokenService({ db: ctx.db });

		const result = await service.update(user.id, id, data);
		if (!result.ok) {
			const { status, body } = mapServiceErrorToResponse(result.error);
			return c.json(body, status);
		}

		return c.json(result.value);
	})
);

tokensRouter.delete(
	"/:id",
	zValidator("param", TokenIdSchema),
	withAuth(async (c, user, ctx) => {
		const { id } = valid<z.infer<typeof TokenIdSchema>>(c, "param");
		const service = createTokenService({ db: ctx.db });

		const result = await service.delete(user.id, id);
		if (!result.ok) {
			const { status, body } = mapServiceErrorToResponse(result.error);
			return c.json(body, status);
		}

		return c.body(null, 204);
	})
);
