import type { Bindings } from "@blog/schema";
import { Hono } from "hono";
import { createApiApp } from "./index";

type AstroHandler = {
	fetch: (request: Request, env: Bindings, ctx: ExecutionContext) => Promise<Response>;
};

export const createUnifiedApp = (env: Bindings, astroHandler: AstroHandler) => {
	const app = new Hono<{ Bindings: Bindings }>();

	const apiApp = createApiApp(env);

	app.route("/", apiApp);

	app.all("*", async c => {
		return astroHandler.fetch(c.req.raw, env, c.executionCtx);
	});

	return app;
};

export type UnifiedApp = ReturnType<typeof createUnifiedApp>;
