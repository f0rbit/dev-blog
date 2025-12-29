import { Hono } from "hono";
import { type Env } from "@blog/schema";

// Assets route placeholder - asset storage TBD
// Will require adding assets table to schema and STORAGE binding to Env

export const assetsRouter = new Hono<{ Bindings: Env }>();

assetsRouter.get("/", (c) => {
  return c.json({ 
    code: "NOT_IMPLEMENTED", 
    message: "Asset storage not yet implemented" 
  }, 501);
});

assetsRouter.all("/*", (c) => {
  return c.json({ 
    code: "NOT_IMPLEMENTED", 
    message: "Asset storage not yet implemented" 
  }, 501);
});
