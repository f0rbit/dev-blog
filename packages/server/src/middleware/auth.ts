import { type DrizzleDB, type Env, type Result, type User, accessKeys, err, ok, pipe, users } from "@blog/schema";
import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { z } from "zod";

export interface AuthContext {
	user: User;
}

const EXEMPT_PATHS = ["/health", "/auth/user", "/auth/login", "/auth/logout"];

const DevpadUserSchema = z.object({
	id: z.number(),
	github_id: z.number(),
	username: z.string(),
	email: z.string().nullable(),
	avatar_url: z.string().nullable(),
});

type DevpadUser = z.infer<typeof DevpadUserSchema>;

const hexEncode = (buffer: ArrayBuffer): string =>
	Array.from(new Uint8Array(buffer))
		.map(b => b.toString(16).padStart(2, "0"))
		.join("");

const hashToken = async (token: string): Promise<string> => {
	const encoder = new TextEncoder();
	const data = encoder.encode(token);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	return hexEncode(hashBuffer);
};

const isExemptPath = (path: string): boolean => EXEMPT_PATHS.some(exempt => path === exempt || path.startsWith(`${exempt}/`));

const rowToUser = (row: typeof users.$inferSelect): User => ({
	id: row.id,
	github_id: row.github_id,
	username: row.username,
	email: row.email,
	avatar_url: row.avatar_url,
	created_at: row.created_at,
	updated_at: row.updated_at,
});

const validateApiToken = async (db: DrizzleDB, token: string): Promise<Result<User, string>> => {
	const tokenHash = await hashToken(token);

	const [keyRow] = await db
		.select()
		.from(accessKeys)
		.where(and(eq(accessKeys.key_hash, tokenHash), eq(accessKeys.enabled, true)))
		.limit(1);

	if (!keyRow) return err("invalid_token");

	const [userRow] = await db.select().from(users).where(eq(users.id, keyRow.user_id)).limit(1);

	if (!userRow) return err("user_not_found");

	return ok(rowToUser(userRow));
};

const verifyWithDevpad = async (devpadApi: string, cookie: string): Promise<Result<DevpadUser, string>> => {
	const response = await fetch(`${devpadApi}/api/auth/verify`, {
		method: "GET",
		headers: { Cookie: cookie },
	});

	if (!response.ok) return err("session_invalid");

	const json = await response.json();
	const parsed = DevpadUserSchema.safeParse(json);

	if (!parsed.success) return err("invalid_user_response");

	return ok(parsed.data);
};

const ensureUser = async (db: DrizzleDB, devpadUser: DevpadUser): Promise<Result<User, string>> => {
	const now = new Date();

	await db
		.insert(users)
		.values({
			github_id: devpadUser.github_id,
			username: devpadUser.username,
			email: devpadUser.email,
			avatar_url: devpadUser.avatar_url,
			created_at: now,
			updated_at: now,
		})
		.onConflictDoUpdate({
			target: users.github_id,
			set: {
				username: devpadUser.username,
				email: devpadUser.email,
				avatar_url: devpadUser.avatar_url,
				updated_at: now,
			},
		});

	const [userRow] = await db.select().from(users).where(eq(users.github_id, devpadUser.github_id)).limit(1);

	if (!userRow) return err("upsert_failed");

	return ok(rowToUser(userRow));
};

const authenticateWithCookie = async (db: DrizzleDB, devpadApi: string, cookie: string): Promise<Result<User, string>> =>
	pipe(verifyWithDevpad(devpadApi, cookie))
		.flat_map(devpadUser => ensureUser(db, devpadUser))
		.result();

type AuthEnv = { Bindings: Env; Variables: AuthContext };

export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
	const path = new URL(c.req.url).pathname;

	if (isExemptPath(path)) return next();

	const authToken = c.req.header("Auth-Token");

	if (authToken) {
		const result = await validateApiToken(c.env.db, authToken);
		if (result.ok) {
			c.set("user", result.value);
			return next();
		}
	}

	const cookie = c.req.header("Cookie");

	if (cookie) {
		const result = await authenticateWithCookie(c.env.db, c.env.devpadApi, cookie);
		if (result.ok) {
			c.set("user", result.value);
			return next();
		}
	}

	return c.json({ code: "UNAUTHORIZED", message: "Authentication required" }, 401);
});

export const requireAuth = () => authMiddleware;
