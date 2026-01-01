import type { AppContext, User } from "@blog/schema";
import { Hono } from "hono";
import { withAuth } from "../middleware/require-auth";
import { createDevpadProvider } from "../providers/devpad";
import { type ProjectServiceError, createProjectService } from "../services/projects";

type Variables = {
	user: User;
	appContext: AppContext;
	jwtToken?: string;
};

export const projectsRouter = new Hono<{ Variables: Variables }>();

const errorMessage = (error: ProjectServiceError): string => {
	switch (error.type) {
		case "provider_error":
		case "corpus_error":
			return error.message;
	}
};

const getService = (ctx: AppContext) => {
	const devpadProvider = createDevpadProvider({
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

		if (!result.ok) {
			return c.json({ code: "INTERNAL_ERROR", message: result.error.message ?? "Failed to list projects" }, 500);
		}

		return c.json({ projects: result.value });
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

		if (!result.ok) {
			return c.json({ code: "INTERNAL_ERROR", message: errorMessage(result.error) ?? "Failed to refresh projects" }, 500);
		}

		return c.json({ projects: result.value });
	})
);
