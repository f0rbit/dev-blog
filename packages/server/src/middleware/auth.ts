import { type AppContext, type Bindings, type DrizzleDB, type Result, type User, accessKeys, err, ok, pipe, users } from "@blog/schema";
import { and, eq } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { z } from "zod";

const EXEMPT_PATHS = ["/health", "/auth/user", "/auth/login", "/auth/logout", "/auth/callback"];
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
const isOptionalAuthPath = (path: string): boolean => OPTIONAL_AUTH_PATHS.some(p => path === p || path.startsWith(`${p}/`));

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

const extractJWTFromHeader = (authHeader: string): string | null => {
	if (!authHeader.startsWith("Bearer jwt:")) return null;
	return authHeader.slice("Bearer jwt:".length);
};

const verifyWithDevpadJWT = async (devpadApi: string, jwtToken: string): Promise<Result<DevpadUser, string>> => {
	const response = await fetch(`${devpadApi}/api/auth/verify`, {
		method: "GET",
		headers: { Authorization: `Bearer jwt:${jwtToken}` },
	});

	if (!response.ok) return err("jwt_invalid");

	const json = await response.json();
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
};

type AuthEnv = { Bindings: Bindings; Variables: Variables };

export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
	const path = new URL(c.req.url).pathname;
	console.log("[AUTH] Request path:", path);

	if (isExemptPath(path)) {
		console.log("[AUTH] Path is exempt, skipping auth");
		return next();
	}

	const ctx = c.get("appContext");
	const isOptional = isOptionalAuthPath(path);
	console.log("[AUTH] Optional auth path:", isOptional);

	const authToken = c.req.header("Auth-Token");
	if (authToken) {
		console.log("[AUTH] Trying Auth-Token header...");
		const result = await validateApiToken(ctx.db, authToken);
		if (result.ok) {
			console.log("[AUTH] Auth-Token valid, user:", result.value.username);
			c.set("user", result.value);
			return next();
		}
		console.log("[AUTH] Auth-Token invalid");
	}

	const authHeader = c.req.header("Authorization");
	if (authHeader) {
		console.log("[AUTH] Trying Authorization header...");
		const jwtToken = extractJWTFromHeader(authHeader);
		if (jwtToken) {
			console.log("[AUTH] Found JWT in header, verifying...");
			const result = await authenticateWithJWT(ctx.db, ctx.devpadApi, jwtToken);
			if (result.ok) {
				console.log("[AUTH] JWT valid, user:", result.value.username);
				c.set("user", result.value);
				return next();
			}
			console.log("[AUTH] JWT invalid");
		}
	}

	// Check for JWT in cookie (for SSR requests)
	const jwtCookie = getCookie(c, "devpad_jwt");
	if (jwtCookie) {
		console.log("[AUTH] Trying devpad_jwt cookie...");
		const result = await authenticateWithJWT(ctx.db, ctx.devpadApi, jwtCookie);
		if (result.ok) {
			console.log("[AUTH] JWT cookie valid, user:", result.value.username);
			c.set("user", result.value);
			return next();
		}
		console.log("[AUTH] JWT cookie invalid");
	}

	const cookie = c.req.header("Cookie");
	if (cookie) {
		console.log("[AUTH] Trying cookie passthrough to devpad...");
		const result = await authenticateWithCookie(ctx.db, ctx.devpadApi, cookie);
		if (result.ok) {
			console.log("[AUTH] Cookie auth valid, user:", result.value.username);
			c.set("user", result.value);
			return next();
		}
		console.log("[AUTH] Cookie auth invalid");
	}

	if (isOptional) {
		console.log("[AUTH] No auth found, but path is optional - continuing");
		return next();
	}

	console.log("[AUTH] No valid auth found, returning 401");
	return c.json({ code: "UNAUTHORIZED", message: "Authentication required" }, 401);
});

export const requireAuth = () => authMiddleware;
