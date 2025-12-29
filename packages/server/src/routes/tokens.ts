import { AccessKeyCreateSchema, AccessKeyUpdateSchema, type ApiError, type Env, type Result, err, ok } from "@blog/schema";
import * as schema from "@blog/schema/database";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { z } from "zod";

type AuthEnv = {
	Bindings: Env;
	Variables: { user: { id: number } };
};

const TokenIdSchema = z.object({
	id: z.coerce.number().int().positive(),
});

const generateToken = (): string => crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");

const hashToken = async (token: string): Promise<string> => {
	const encoder = new TextEncoder();
	const data = encoder.encode(token);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
};

const findToken = async (db: ReturnType<typeof drizzle>, userId: number, tokenId: number): Promise<Result<schema.AccessKey, ApiError>> => {
	const [token] = await db
		.select()
		.from(schema.accessKeys)
		.where(and(eq(schema.accessKeys.user_id, userId), eq(schema.accessKeys.id, tokenId)))
		.limit(1);

	if (!token) {
		return err({ code: "NOT_FOUND", message: "Token not found" });
	}

	return ok(token);
};

const sanitizeToken = (token: schema.AccessKey) => ({
	id: token.id,
	name: token.name,
	note: token.note,
	enabled: token.enabled,
	created_at: token.created_at,
});

export const tokensRouter = new Hono<AuthEnv>();

tokensRouter.get("/", async c => {
	const user = c.get("user");
	const db = drizzle(c.env.DB);

	const tokens = await db.select().from(schema.accessKeys).where(eq(schema.accessKeys.user_id, user.id));

	return c.json({ tokens: tokens.map(sanitizeToken) });
});

tokensRouter.post("/", zValidator("json", AccessKeyCreateSchema), async c => {
	const user = c.get("user");
	const data = c.req.valid("json");
	const db = drizzle(c.env.DB);

	const plainToken = generateToken();
	const keyHash = await hashToken(plainToken);

	const inserted = await db
		.insert(schema.accessKeys)
		.values({
			user_id: user.id,
			key_hash: keyHash,
			name: data.name,
			note: data.note ?? null,
			enabled: true,
		})
		.returning();

	const created = inserted[0];
	if (!created) {
		return c.json({ code: "DB_ERROR", message: "Failed to create token" }, 500);
	}

	return c.json(
		{
			...sanitizeToken(created),
			token: plainToken,
		},
		201
	);
});

tokensRouter.put("/:id", zValidator("param", TokenIdSchema), zValidator("json", AccessKeyUpdateSchema), async c => {
	const user = c.get("user");
	const { id } = c.req.valid("param");
	const data = c.req.valid("json");
	const db = drizzle(c.env.DB);

	const tokenResult = await findToken(db, user.id, id);
	if (!tokenResult.ok) {
		return c.json(tokenResult.error, 404);
	}

	const updates: Partial<schema.AccessKeyInsert> = {};
	if (data.name !== undefined) updates.name = data.name;
	if (data.note !== undefined) updates.note = data.note;
	if (data.enabled !== undefined) updates.enabled = data.enabled;

	if (Object.keys(updates).length === 0) {
		return c.json(sanitizeToken(tokenResult.value));
	}

	const updatedRows = await db
		.update(schema.accessKeys)
		.set(updates)
		.where(and(eq(schema.accessKeys.user_id, user.id), eq(schema.accessKeys.id, id)))
		.returning();

	const updated = updatedRows[0];
	if (!updated) {
		return c.json({ code: "DB_ERROR", message: "Failed to update token" }, 500);
	}

	return c.json(sanitizeToken(updated));
});

tokensRouter.delete("/:id", zValidator("param", TokenIdSchema), async c => {
	const user = c.get("user");
	const { id } = c.req.valid("param");
	const db = drizzle(c.env.DB);

	const tokenResult = await findToken(db, user.id, id);
	if (!tokenResult.ok) {
		return c.json(tokenResult.error, 404);
	}

	await db.delete(schema.accessKeys).where(and(eq(schema.accessKeys.user_id, user.id), eq(schema.accessKeys.id, id)));

	return c.body(null, 204);
});
