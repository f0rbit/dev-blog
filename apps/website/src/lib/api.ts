export const api = {
	blog: (path: string) => `/api/blog${path.startsWith("/") ? path : `/${path}`}`,

	auth: (path: string) => `/auth${path.startsWith("/") ? path : `/${path}`}`,

	async fetch(path: string, options: RequestInit = {}): Promise<Response> {
		return fetch(path, {
			...options,
			credentials: "same-origin",
		});
	},

	async ssr(path: string, request: Request, options: RequestInit = {}): Promise<Response> {
		const url = new URL(path, request.url);
		return fetch(url.toString(), {
			...options,
			headers: {
				...options.headers,
				Cookie: request.headers.get("cookie") ?? "",
			},
		});
	},
};
