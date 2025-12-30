import type { AppContext, Bindings, User } from "@blog/schema";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createContextFromBindings } from "./context";
import { authMiddleware } from "./middleware/auth";
import { assetsRouter } from "./routes/assets";
import { authRouter } from "./routes/auth";
import { categoriesRouter } from "./routes/categories";
import { healthRouter } from "./routes/health";
import { postsRouter } from "./routes/posts";
import { tagsRouter } from "./routes/tags";
import { tokensRouter } from "./routes/tokens";
import { projectsRouter } from "./routes/projects";

type Variables = {
	user: User;
	appContext: AppContext;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use("*", logger());
app.use(
	"*",
	cors({
		origin: ["http://localhost:4321", "http://localhost:3000"],
		allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
		allowHeaders: ["Content-Type", "Authorization", "Auth-Token"],
		credentials: true,
	})
);

app.use("*", async (c, next) => {
	const ctx = createContextFromBindings(c.env);
	c.set("appContext", ctx);
	await next();
});

app.use("*", authMiddleware);

const blogRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();
blogRouter.route("/posts", postsRouter);
blogRouter.route("/post", postsRouter);
blogRouter.route("/tags", tagsRouter);
blogRouter.route("/categories", categoriesRouter);
blogRouter.route("/category", categoriesRouter);
blogRouter.route("/tokens", tokensRouter);
blogRouter.route("/token", tokensRouter);
blogRouter.route("/assets", assetsRouter);
blogRouter.route("/projects", projectsRouter);
blogRouter.route("/project", projectsRouter);

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

export default app;
