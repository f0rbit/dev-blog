type ApiHandler = {
	fetch: (request: Request) => Promise<Response>;
};

type RuntimeEnv = {
	API_HANDLER?: ApiHandler;
};

export const api = {
	blog: (path: string) => `/api/blog${path.startsWith("/") ? path : `/${path}`}`,

	auth: (path: string) => `/auth${path.startsWith("/") ? path : `/${path}`}`,

	async fetch(path: string, options: RequestInit = {}): Promise<Response> {
		return fetch(path, {
			...options,
			credentials: "same-origin",
		});
	},

	/**
	 * Make an SSR request to the API.
	 * If running in the unified worker, uses direct internal call.
	 * Otherwise falls back to HTTP fetch.
	 */
	async ssr(path: string, request: Request, options: RequestInit = {}, runtime?: { env?: RuntimeEnv }): Promise<Response> {
		const url = new URL(path, request.url);
		const cookie = request.headers.get("cookie") ?? "";
		console.log("[api.ssr] Path:", path);
		console.log("[api.ssr] Original request cookie:", cookie || "(none)");
		console.log("[api.ssr] Runtime env available:", !!runtime?.env);
		console.log("[api.ssr] API_HANDLER available:", !!runtime?.env?.API_HANDLER);

		// If we have access to the internal API handler, use it directly
		const apiHandler = runtime?.env?.API_HANDLER;
		if (apiHandler) {
			console.log("[api.ssr] Using internal API handler");
			// Create a new request with the original cookies forwarded
			const internalRequest = new Request(url.toString(), {
				...options,
				headers: {
					...options.headers,
					Cookie: cookie,
				},
			});
			return apiHandler.fetch(internalRequest);
		}

		console.log("[api.ssr] Falling back to HTTP fetch");
		// Fallback to HTTP fetch (for local dev or non-unified deployments)
		return fetch(url.toString(), {
			...options,
			headers: {
				...options.headers,
				Cookie: cookie,
			},
		});
	},
};
