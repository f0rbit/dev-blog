import type { Bindings } from "@blog/schema";
import { createApiApp } from "./index";

type AstroHandler = {
	fetch: (request: Request, env: Bindings, ctx: ExecutionContext) => Promise<Response>;
};

// API route prefixes that should be handled by Hono
const API_PREFIXES = ["/api/", "/health", "/auth/"];

export const createUnifiedApp = (env: Bindings, astroHandler: AstroHandler) => {
	const apiApp = createApiApp(env);

	return {
		async fetch(request: Request, _env: Bindings, ctx: ExecutionContext): Promise<Response> {
			const url = new URL(request.url);
			const path = url.pathname;

			// Route API paths to Hono
			if (API_PREFIXES.some(prefix => path.startsWith(prefix) || path === prefix.replace(/\/$/, ""))) {
				return apiApp.fetch(request, env, ctx);
			}

			// Everything else goes to Astro SSR
			return astroHandler.fetch(request, env, ctx);
		},
	};
};

export type UnifiedApp = ReturnType<typeof createUnifiedApp>;
