import type { AppContext, User } from "@blog/schema";
import { Hono } from "hono";
import { deleteCookie } from "hono/cookie";

type Variables = {
	user: User;
	appContext: AppContext;
};

export const authRouter = new Hono<{ Variables: Variables }>();

authRouter.get("/user", c => {
	const user = c.get("user");

	if (!user) {
		return c.json({ code: "UNAUTHORIZED", message: "Not authenticated" }, 401);
	}

	return c.json({ user });
});

authRouter.get("/login", c => {
	const ctx = c.get("appContext");
	const origin = new URL(c.req.url).origin;
	const isPreview = !origin.includes("devpad.tools");

	const params = new URLSearchParams({
		return_to: `${origin}/auth/callback`,
		...(isPreview && { mode: "jwt" }),
	});

	return c.redirect(`${ctx.devpadApi}/api/auth/login?${params}`);
});

authRouter.get("/callback", c => {
	const token = c.req.query("token");

	if (!token) {
		return c.json({ code: "INVALID_CALLBACK", message: "No token provided" }, 400);
	}

	const escapedToken = token.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

	return c.html(`
		<!DOCTYPE html>
		<html>
		<head><title>Authenticating...</title></head>
		<body>
			<script>
				localStorage.setItem('devpad_jwt', '${escapedToken}');
				window.location.href = '/posts';
			</script>
		</body>
		</html>
	`);
});

authRouter.get("/logout", c => {
	deleteCookie(c, "session");
	deleteCookie(c, "devpad_session");

	return c.html(`
		<!DOCTYPE html>
		<html>
		<head><title>Logging out...</title></head>
		<body>
			<script>
				localStorage.removeItem('devpad_jwt');
				document.cookie = 'session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
				window.location.href = '/';
			</script>
		</body>
		</html>
	`);
});

authRouter.get("/status", c => {
	const user = c.get("user");

	return c.json({
		authenticated: !!user,
		user: user
			? {
					id: user.id,
					username: user.username,
					email: user.email,
					avatar_url: user.avatar_url,
				}
			: null,
	});
});
