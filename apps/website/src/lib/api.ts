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

	async json<T>(path: string, options?: RequestInit): Promise<T> {
		const res = await this.fetch(path, options);
		if (!res.ok) {
			const errorData = (await res.json().catch(() => ({}))) as { message?: string };
			throw new Error(errorData.message || `Request failed: ${res.status}`);
		}
		return res.json() as Promise<T>;
	},

	async post<T>(path: string, body: unknown): Promise<T> {
		return this.json<T>(path, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
	},

	async put<T>(path: string, body: unknown): Promise<T> {
		return this.json<T>(path, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
	},

	async delete(path: string): Promise<void> {
		const res = await this.fetch(path, { method: "DELETE" });
		if (!res.ok) {
			const errorData = (await res.json().catch(() => ({}))) as { message?: string };
			throw new Error(errorData.message || `Delete failed: ${res.status}`);
		}
	},

	/**
	 * Make an SSR request to the API.
	 * If running in the unified worker, uses direct internal call.
	 * Otherwise falls back to HTTP fetch.
	 */
	async ssr(path: string, request: Request, options: RequestInit = {}, runtime?: { env?: RuntimeEnv }): Promise<Response> {
		const url = new URL(path, request.url);
		const cookie = request.headers.get("cookie") ?? "";

		// If we have access to the internal API handler, use it directly
		const apiHandler = runtime?.env?.API_HANDLER;
		if (apiHandler) {
			const internalRequest = new Request(url.toString(), {
				...options,
				headers: {
					...options.headers,
					Cookie: cookie,
				},
			});
			return apiHandler.fetch(internalRequest);
		}

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
