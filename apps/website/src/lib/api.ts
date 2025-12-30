// API configuration - single source of truth for API URLs

const API_HOST = import.meta.env.PUBLIC_API_URL ?? "http://localhost:8080";

/** API URL builders */
export const api = {
	/** Base API host */
	host: API_HOST,

	/** Build blog API URL - e.g., api.blog("/posts") */
	blog: (path: string) => `${API_HOST}/api/blog${path.startsWith("/") ? path : `/${path}`}`,

	/** Build auth API URL - e.g., api.auth("/login") */
	auth: (path: string) => `${API_HOST}/auth${path.startsWith("/") ? path : `/${path}`}`,
};
