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

		// If we have access to the internal API handler, use it directly
		const apiHandler = runtime?.env?.API_HANDLER;
		if (apiHandler) {
			// Create a new request with the original cookies forwarded
			const internalRequest = new Request(url.toString(), {
				...options,
				headers: {
					...options.headers,
					Cookie: request.headers.get("cookie") ?? "",
				},
			});
			return apiHandler.fetch(internalRequest);
		}

		// Fallback to HTTP fetch (for local dev or non-unified deployments)
		return fetch(url.toString(), {
			...options,
			headers: {
				...options.headers,
				Cookie: request.headers.get("cookie") ?? "",
			},
		});
	},
};
