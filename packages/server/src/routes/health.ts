import type { Env } from "@blog/schema";
import { Hono } from "hono";

export const healthRouter = new Hono<{ Bindings: Env }>();

healthRouter.get("/", c =>
	c.json({
		status: "ok",
		timestamp: new Date().toISOString(),
		environment: c.env.ENVIRONMENT,
	})
);
