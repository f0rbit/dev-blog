import type { AppContext } from "@blog/schema";
import { Hono } from "hono";

type Variables = {
	appContext: AppContext;
};

export const healthRouter = new Hono<{ Variables: Variables }>();

healthRouter.get("/", c => {
	const ctx = c.get("appContext");
	return c.json({
		status: "ok",
		timestamp: new Date().toISOString(),
		environment: ctx.environment,
	});
});
