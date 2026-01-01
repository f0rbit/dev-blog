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

	async ssr(path: string, request: Request, options: RequestInit = {}): Promise<Response> {
		// Extract devpad_jwt from cookies for SSR auth
		const cookieHeader = request.headers.get("cookie") ?? "";
		const cookies: Record<string, string> = {};
		for (const c of cookieHeader.split(";")) {
			const [key, ...val] = c.trim().split("=");
			if (key) cookies[key] = val.join("=");
		}
		const jwtToken = cookies.devpad_jwt;

		const headers: Record<string, string> = {
			...((options.headers as Record<string, string>) ?? {}),
		};

		// Send JWT as Authorization header if available
		if (jwtToken) {
			headers.Authorization = `Bearer jwt:${jwtToken}`;
		}

		return fetch(`${API_HOST}${path}`, {
			...options,
			headers,
		});
	},
};
