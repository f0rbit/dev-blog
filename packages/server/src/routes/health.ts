import { Hono } from "hono";
import type { Env } from "@blog/schema";

export const healthRouter = new Hono<{ Bindings: Env }>();

healthRouter.get("/", (c) =>
  c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT,
  })
);
