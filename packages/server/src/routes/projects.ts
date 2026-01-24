import type { AppContext } from "@blog/schema";
import { Hono } from "hono";
import { withAuth } from "../middleware/require-auth";
import { devpad } from "../providers/devpad";
import { createProjectService } from "../services/projects";
import { type Variables, response } from "../utils/route-helpers";

type ProjectVariables = Variables & {
	jwtToken?: string;
};

export const projectsRouter = new Hono<{ Variables: ProjectVariables }>();

const getService = (ctx: AppContext) => {
	const devpadProvider = devpad.create({
		apiUrl: ctx.devpadApi,
	});
	return createProjectService({
		corpus: ctx.corpus,
		devpadProvider,
	});
};

projectsRouter.get(
	"/",
	withAuth(async (c, user, ctx) => {
		const service = getService(ctx);
		const result = await service.list(user.id);
		return response.with(c, result, projects => ({ projects }));
	})
);

projectsRouter.post(
	"/refresh",
	withAuth(async (c, user, ctx) => {
		const jwtToken = c.get("jwtToken") as string | undefined;

		if (!jwtToken) {
			return c.json({ code: "UNAUTHORIZED", message: "JWT authentication required for refresh" }, 401);
		}

		const service = getService(ctx);
		const result = await service.refresh(user.id, jwtToken);
		return response.with(c, result, projects => ({ projects }));
	})
);
