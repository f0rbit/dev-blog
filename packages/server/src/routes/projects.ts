import { type AppContext, type Project, type ProjectsCache, projectsCacheStoreDefinition, projectsCacheStoreId } from "@blog/schema";
import { create_store } from "@f0rbit/corpus";
import { Hono } from "hono";
import { withAuth } from "../middleware/require-auth";
import { createDevpadProvider } from "../providers/devpad";
import { createProjectService } from "../services/projects";
import { type Variables, handleResultWith } from "../utils/route-helpers";

type ProjectVariables = Variables & {
	jwtToken?: string;
};

export const projectsRouter = new Hono<{ Variables: ProjectVariables }>();

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
		console.log(`[ROUTE:PROJECTS:GET] userId=${user.id} username=${user.username}`);
		const service = getService(ctx);
		const result = await service.list(user.id);
		console.log(`[ROUTE:PROJECTS:GET:RESULT] ok=${result.ok} count=${result.ok ? result.value.length : "N/A"}`);
		return handleResultWith(c, result, projects => ({ projects }));
	})
);

projectsRouter.post(
	"/refresh",
	withAuth(async (c, user, ctx) => {
		const jwtToken = c.get("jwtToken") as string | undefined;
		console.log(`[ROUTE:PROJECTS:REFRESH] userId=${user.id} username=${user.username} hasJwt=${!!jwtToken}`);

		if (!jwtToken) {
			console.log("[ROUTE:PROJECTS:REFRESH] No JWT token, returning 401");
			return c.json({ code: "UNAUTHORIZED", message: "JWT authentication required for refresh" }, 401);
		}

		const service = getService(ctx);
		const result = await service.refresh(user.id, jwtToken);
		console.log(`[ROUTE:PROJECTS:REFRESH:RESULT] ok=${result.ok} count=${result.ok ? result.value.length : "N/A"}`);
		return handleResultWith(c, result, projects => ({ projects }));
	})
);

// Debug endpoint to test R2 persistence directly
projectsRouter.get(
	"/debug",
	withAuth(async (c, user, ctx) => {
		const storeId = projectsCacheStoreId(user.id);
		console.log(`[DEBUG:PROJECTS] userId=${user.id} storeId=${storeId}`);

		const testProject: Project = {
			id: "debug-test-1",
			name: "Debug Test Project",
			owner_id: "test",
			project_id: "debug",
			description: null,
			specification: null,
			repo_url: null,
			repo_id: null,
			icon_url: null,
			status: "DEVELOPMENT",
			link_url: null,
			link_text: null,
			visibility: "PRIVATE",
			current_version: null,
			scan_branch: null,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			deleted: false,
		};

		const testCache: ProjectsCache = {
			projects: [testProject],
			fetched_at: new Date().toISOString(),
		};

		const backend = { metadata: ctx.corpus.metadata, data: ctx.corpus.data };
		const store = create_store(backend, { ...projectsCacheStoreDefinition, id: storeId });

		// Write
		console.log(`[DEBUG:PROJECTS:WRITE] Writing test data to ${storeId}`);
		const writeResult = await store.put(testCache);
		console.log(`[DEBUG:PROJECTS:WRITE:RESULT] ok=${writeResult.ok} ${writeResult.ok ? "" : `error=${JSON.stringify(writeResult.error)}`}`);

		// Immediate read
		console.log(`[DEBUG:PROJECTS:READ] Reading from ${storeId}`);
		const readResult = await store.get_latest();
		console.log(`[DEBUG:PROJECTS:READ:RESULT] ok=${readResult.ok} ${readResult.ok ? `projectCount=${readResult.value.data.projects.length}` : `error=${JSON.stringify(readResult.error)}`}`);

		return c.json({
			userId: user.id,
			storeId,
			writeOk: writeResult.ok,
			writeError: !writeResult.ok ? writeResult.error : null,
			readOk: readResult.ok,
			readData: readResult.ok ? readResult.value.data : null,
			readError: !readResult.ok ? readResult.error : null,
			timestamp: new Date().toISOString(),
		});
	})
);
