import type { AppContext } from "@blog/schema";
import { Hono } from "hono";

type Variables = {
	appContext: AppContext;
};

export const assetsRouter = new Hono<{ Variables: Variables }>();

assetsRouter.get("/", c => {
	return c.json(
		{
			code: "NOT_IMPLEMENTED",
			message: "Asset storage not yet implemented",
		},
		501
	);
});

assetsRouter.all("/*", c => {
	return c.json(
		{
			code: "NOT_IMPLEMENTED",
			message: "Asset storage not yet implemented",
		},
		501
	);
});
