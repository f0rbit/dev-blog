import { type AppContext, type Bindings, type DrizzleDB, type Result, type User, accessKeys, err, ok, pipe, try_catch_async, users } from "@blog/schema";
import { and, eq } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { hashToken } from "../utils/crypto";

const EXEMPT_PATHS = ["/health", "/auth/login", "/auth/logout", "/auth/callback"];
const OPTIONAL_AUTH_PATHS = ["/auth/status"];

const DevpadVerifyResponseSchema = z.object({
	authenticated: z.boolean(),
	user: z
		.object({
			id: z.string(),
			name: z.string(),
			email: z.string().nullable().optional(),
			github_id: z.number(),
			image_url: z.string().nullable().optional(),
			task_view: z.string().optional(),
		})
		.nullable(),
});

type DevpadUser = {
	github_id: number;
	username: string;
	email: string | null;
	avatar_url: string | null;
};

type UserRow = typeof users.$inferSelect;

export const isExemptPath = (path: string): boolean => EXEMPT_PATHS.some(exempt => path === exempt || path.startsWith(`${exempt}/`));
export const isOptionalAuthPath = (path: string): boolean => OPTIONAL_AUTH_PATHS.some(p => path === p || path.startsWith(`${p}/`));

export const rowToUser = (row: UserRow): User => ({
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
	const fetchResult = await try_catch_async(
		async () => {
			const response = await fetch(`${devpadApi}/api/auth/verify`, {
				method: "GET",
				headers: { Cookie: cookie },
			});
			if (!response.ok) throw new Error("session_invalid");
			return response.json();
		},
		() => "session_invalid"
	);

	return pipe(fetchResult)
		.flat_map((json: unknown) => {
			const parsed = DevpadVerifyResponseSchema.safeParse(json);
			if (!parsed.success) return err("invalid_user_response");
			if (!parsed.data.authenticated || !parsed.data.user) return err("session_invalid");

			const devpadUser = parsed.data.user;
			return ok({
				github_id: devpadUser.github_id,
				username: devpadUser.name,
				email: devpadUser.email ?? null,
				avatar_url: devpadUser.image_url ?? null,
			});
		})
		.result();
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

const JWT_PREFIX = "Bearer jwt:";

export const extractJWTFromHeader = (authHeader: string): Result<string, string> => {
	if (!authHeader.startsWith(JWT_PREFIX)) return err("missing_jwt_prefix");
	const token = authHeader.slice(JWT_PREFIX.length);
	if (token.length === 0) return err("empty_jwt_token");
	return ok(token);
};

const verifyWithDevpadJWT = async (devpadApi: string, jwtToken: string): Promise<Result<DevpadUser, string>> => {
	const fetchResult = await try_catch_async(
		async () => {
			const response = await fetch(`${devpadApi}/api/auth/verify`, {
				method: "GET",
				headers: { Authorization: `Bearer jwt:${jwtToken}` },
			});
			if (!response.ok) throw new Error("jwt_invalid");
			return response.json();
		},
		() => "jwt_invalid"
	);

	return pipe(fetchResult)
		.flat_map((json: unknown) => {
			const parsed = DevpadVerifyResponseSchema.safeParse(json);
			if (!parsed.success) return err("invalid_user_response");
			if (!parsed.data.authenticated || !parsed.data.user) return err("not_authenticated");

			const devpadUser = parsed.data.user;
			return ok({
				github_id: devpadUser.github_id,
				username: devpadUser.name,
				email: devpadUser.email ?? null,
				avatar_url: devpadUser.image_url ?? null,
			});
		})
		.result();
};

const authenticateWithCookie = async (db: DrizzleDB, devpadApi: string, cookie: string): Promise<Result<User, string>> =>
	pipe(verifyWithDevpad(devpadApi, cookie))
		.flat_map(devpadUser => ensureUser(db, devpadUser))
		.result();

const authenticateWithJWT = async (db: DrizzleDB, devpadApi: string, jwtToken: string): Promise<Result<User, string>> =>
	pipe(verifyWithDevpadJWT(devpadApi, jwtToken))
		.flat_map(devpadUser => ensureUser(db, devpadUser))
		.result();

type Variables = {
	user: User;
	appContext: AppContext;
	jwtToken?: string;
};

type AuthEnv = { Bindings: Bindings; Variables: Variables };

export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
	const path = new URL(c.req.url).pathname;

	if (isExemptPath(path)) return next();

	const ctx = c.get("appContext");
	const isOptional = isOptionalAuthPath(path);

	const authToken = c.req.header("Auth-Token");
	if (authToken) {
		const result = await validateApiToken(ctx.db, authToken);
		if (result.ok) {
			c.set("user", result.value);
			return next();
		}
	}

	const authHeader = c.req.header("Authorization");
	if (authHeader) {
		const jwtResult = extractJWTFromHeader(authHeader);
		if (jwtResult.ok) {
			const result = await authenticateWithJWT(ctx.db, ctx.devpadApi, jwtResult.value);
			if (result.ok) {
				c.set("user", result.value);
				c.set("jwtToken", jwtResult.value);
				return next();
			}
		}
	}

	const jwtCookie = getCookie(c, "devpad_jwt");
	if (jwtCookie) {
		const result = await authenticateWithJWT(ctx.db, ctx.devpadApi, jwtCookie);
		if (result.ok) {
			c.set("user", result.value);
			c.set("jwtToken", jwtCookie);
			return next();
		}
	}

	const cookie = c.req.header("Cookie");
	if (cookie) {
		const result = await authenticateWithCookie(ctx.db, ctx.devpadApi, cookie);
		if (result.ok) {
			c.set("user", result.value);
			return next();
		}
	}

	if (isOptional) return next();

	return c.json({ code: "UNAUTHORIZED", message: "Authentication required" }, 401);
});

export const requireAuth = () => authMiddleware;
