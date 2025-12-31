import { auth } from "./auth";

const API_HOST = import.meta.env.PUBLIC_API_URL ?? "http://localhost:8080";

export const api = {
	host: API_HOST,

	blog: (path: string) => `${API_HOST}/api/blog${path.startsWith("/") ? path : `/${path}`}`,

	auth: (path: string) => `${API_HOST}/auth${path.startsWith("/") ? path : `/${path}`}`,

	async fetch(path: string, options: RequestInit = {}): Promise<Response> {
		const headers = {
			...options.headers,
			...auth.getAuthHeaders(),
		};

		return fetch(`${API_HOST}${path}`, {
			...options,
			headers,
			credentials: "include",
		});
	},

	async ssrFetch(path: string, request: Request, options: RequestInit = {}): Promise<Response> {
		const cookies = request.headers.get("cookie") ?? "";

		return fetch(`${API_HOST}${path}`, {
			...options,
			headers: {
				...options.headers,
				Cookie: cookies,
			},
		});
	},
};
