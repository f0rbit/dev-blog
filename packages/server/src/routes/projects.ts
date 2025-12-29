import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createProjectService, type ProjectServiceError } from "../services/projects";
import { createDevpadProvider } from "../providers/devpad";
import type { AppContext, User } from "@blog/schema";

type Variables = {
	user: User;
	appContext: AppContext;
};

export const projectsRouter = new Hono<{ Variables: Variables }>();

const errorMessage = (error: ProjectServiceError): string => {
	switch (error.type) {
		case "no_token":
			return "No DevPad token configured";
		case "provider_error":
		case "db_error":
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
		db: appContext.db,
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

projectsRouter.get("/", async (c) => {
	const user = c.get("user");
	const service = getService(c);

	const refresh = c.req.query("refresh") === "true";
	const result = await service.list(user.id, refresh);

	if (!result.ok) {
		if (result.error.type === "no_token") {
			return c.json({ projects: [], connected: false }, 200);
		}
		return c.json({ error: errorMessage(result.error) }, 500);
	}

	return c.json({ projects: result.value, connected: true });
});

projectsRouter.post("/refresh", async (c) => {
	const user = c.get("user");
	const service = getService(c);

	const result = await service.refresh(user.id);

	if (!result.ok) {
		if (result.error.type === "no_token") {
			return c.json({ error: "No DevPad token configured" }, 400);
		}
		return c.json({ error: errorMessage(result.error) }, 500);
	}

	return c.json({ projects: result.value });
});

projectsRouter.put(
	"/token",
	zValidator("json", z.object({ token: z.string().min(1) })),
	async (c) => {
		const user = c.get("user");
		const { token } = c.req.valid("json");
		const service = getService(c);

		const result = await service.setToken(user.id, token);

		if (!result.ok) {
			return c.json({ error: errorMessage(result.error) }, 500);
		}

		return c.json({ success: true });
	}
);

projectsRouter.delete("/token", async (c) => {
	const user = c.get("user");
	const service = getService(c);

	const result = await service.removeToken(user.id);

	if (!result.ok) {
		return c.json({ error: errorMessage(result.error) }, 500);
	}

	return c.json({ success: true });
});

projectsRouter.get("/status", async (c) => {
	const user = c.get("user");
	const service = getService(c);

	const connected = await service.hasToken(user.id);
	return c.json({ connected });
});
