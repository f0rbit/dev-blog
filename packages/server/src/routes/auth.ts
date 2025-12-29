import type { Env } from "@blog/schema";
import { Hono } from "hono";
import { deleteCookie } from "hono/cookie";
import type { AuthContext } from "../middleware/auth";

type AuthEnv = { Bindings: Env; Variables: AuthContext };

export const authRouter = new Hono<AuthEnv>();

authRouter.get("/user", c => {
	const user = c.get("user");

	if (!user) {
		return c.json({ code: "UNAUTHORIZED", message: "Not authenticated" }, 401);
	}

	return c.json(user);
});

authRouter.get("/login", c => {
	const devpadApi = c.env.devpadApi;
	const currentUrl = c.req.url;
	const returnUrl = new URL(currentUrl).origin;

	const loginUrl = `${devpadApi}/auth/github?return_to=${encodeURIComponent(returnUrl)}`;

	return c.redirect(loginUrl);
});

authRouter.get("/logout", c => {
	deleteCookie(c, "session");
	deleteCookie(c, "devpad_session");

	return c.json({ success: true, message: "Logged out" });
});
