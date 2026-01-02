import type { AppContext } from "@blog/schema";
import type { Context } from "hono";

export type Variables = {
	user: { id: number };
	appContext: AppContext;
};

type ValidTarget = "query" | "param" | "json";
export const valid = <T>(c: Context, target: ValidTarget): T => (c.req.valid as (t: ValidTarget) => T)(target);
