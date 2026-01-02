import type { Bindings } from "@blog/schema";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { createContextFromBindings } from "./context";
import { authMiddleware } from "./middleware/auth";
import { authRouter } from "./routes/auth";
import { categoriesRouter } from "./routes/categories";
import { healthRouter } from "./routes/health";
import { postsRouter } from "./routes/posts";
import { projectsRouter } from "./routes/projects";
import { tagsRouter } from "./routes/tags";
import { tokensRouter } from "./routes/tokens";
import type { Variables } from "./utils/route-helpers";

export const createApiApp = (env: Bindings) => {
	const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

	app.use("*", logger());

	app.use("*", async (c, next) => {
		const ctx = createContextFromBindings(env);
		c.set("appContext", ctx);
		await next();
	});

	app.use("*", authMiddleware);

	const blogRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();
	blogRouter.route("/posts", postsRouter);
	blogRouter.route("/tags", tagsRouter);
	blogRouter.route("/categories", categoriesRouter);
	blogRouter.route("/tokens", tokensRouter);
	blogRouter.route("/projects", projectsRouter);

	app.route("/api/blog", blogRouter);
	app.route("/health", healthRouter);
	app.route("/auth", authRouter);

	app.notFound(c => c.json({ code: "NOT_FOUND", message: "Resource not found" }, 404));

	app.onError((error, c) => {
		console.error("Unhandled error:", error);
		const ctx = c.get("appContext");
		return c.json(
			{
				code: "INTERNAL_ERROR",
				message: ctx?.environment === "production" ? "An unexpected error occurred" : error.message,
			},
			500
		);
	});

	return app;
};

export type ApiApp = ReturnType<typeof createApiApp>;

export default createApiApp;
