import type { AppContext, User } from "@blog/schema";
import { Hono } from "hono";
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

const getService = (c: { get: (key: string) => unknown }) => {
	const appContext = c.get("appContext") as AppContext;
	const devpadProvider = createDevpadProvider({
		apiUrl: appContext.devpadApi,
	});
	return createProjectService({
		corpus: appContext.corpus,
		devpadProvider,
	});
};

projectsRouter.use("*", async (c, next) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ code: "UNAUTHORIZED", message: "Authentication required" }, 401);
	}
	return next();
});

projectsRouter.get("/", async c => {
	const user = c.get("user");
	const service = getService(c);

	const result = await service.list(user.id);

	if (!result.ok) {
		return c.json({ code: "INTERNAL_ERROR", message: result.error.message ?? "Failed to list projects" }, 500);
	}

	return c.json({ projects: result.value });
});

projectsRouter.post("/refresh", async c => {
	const user = c.get("user");
	const jwtToken = c.get("jwtToken");

	if (!jwtToken) {
		return c.json({ code: "UNAUTHORIZED", message: "JWT authentication required for refresh" }, 401);
	}

	const service = getService(c);
	const result = await service.refresh(user.id, jwtToken);

	if (!result.ok) {
		return c.json({ code: "INTERNAL_ERROR", message: errorMessage(result.error) ?? "Failed to refresh projects" }, 500);
	}

	return c.json({ projects: result.value });
});
