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

	return c.json(user);
});

authRouter.get("/login", c => {
	const ctx = c.get("appContext");
	const devpadApi = ctx.devpadApi;
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
