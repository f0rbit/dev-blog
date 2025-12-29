import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { Env } from "@blog/schema";
import { authMiddleware, type AuthContext } from "./middleware/auth";
import { authRouter } from "./routes/auth";
import { postsRouter } from "./routes/posts";
import { tagsRouter } from "./routes/tags";
import { categoriesRouter } from "./routes/categories";
import { tokensRouter } from "./routes/tokens";
import { assetsRouter } from "./routes/assets";
import { healthRouter } from "./routes/health";

type AppEnv = { Bindings: Env; Variables: AuthContext };

const app = new Hono<AppEnv>();

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

app.use("*", authMiddleware);

app.route("/health", healthRouter);
app.route("/auth", authRouter);
app.route("/api/posts", postsRouter);
app.route("/api/post", postsRouter);
app.route("/api/tags", tagsRouter);
app.route("/api/categories", categoriesRouter);
app.route("/api/category", categoriesRouter);
app.route("/api/tokens", tokensRouter);
app.route("/api/token", tokensRouter);
app.route("/api/assets", assetsRouter);

app.notFound((c) =>
  c.json({ code: "NOT_FOUND", message: "Resource not found" }, 404)
);

app.onError((error, c) => {
  console.error("Unhandled error:", error);
  return c.json(
    {
      code: "INTERNAL_ERROR",
      message:
        c.env.ENVIRONMENT === "production"
          ? "An unexpected error occurred"
          : error.message,
    },
    500
  );
});

export default app;
