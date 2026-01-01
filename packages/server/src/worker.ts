import type { Bindings } from "@blog/schema";
import { createApiApp } from "./index";

type AstroHandler = {
	fetch: (request: Request, env: Bindings & { API_HANDLER?: ApiHandler }, ctx: ExecutionContext) => Promise<Response>;
};

type ApiHandler = {
	fetch: (request: Request) => Promise<Response>;
};

// API route prefixes that should be handled by Hono
const API_PREFIXES = ["/api/", "/health", "/auth/"];

export const createUnifiedApp = (env: Bindings, astroHandler: AstroHandler) => {
	const apiApp = createApiApp(env);

	// Create API handler that Astro can use for internal requests
	const apiHandler: ApiHandler = {
		fetch: async (request: Request) => apiApp.fetch(request, env, {} as ExecutionContext),
	};

	return {
		async fetch(request: Request, _env: Bindings, ctx: ExecutionContext): Promise<Response> {
			const url = new URL(request.url);
			const path = url.pathname;

			// Route API paths to Hono
			if (API_PREFIXES.some(prefix => path.startsWith(prefix) || path === prefix.replace(/\/$/, ""))) {
				return apiApp.fetch(request, env, ctx);
			}

			// Pass API handler to Astro via env so it can make internal requests
			const envWithApi = { ...env, API_HANDLER: apiHandler };

			// Everything else goes to Astro SSR
			return astroHandler.fetch(request, envWithApi, ctx);
		},
	};
};

export type UnifiedApp = ReturnType<typeof createUnifiedApp>;
