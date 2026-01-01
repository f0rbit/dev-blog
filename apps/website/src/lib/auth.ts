const JWT_STORAGE_KEY = "devpad_jwt";

export const auth = {
	getToken(): string | null {
		if (typeof window === "undefined") return null;
		return localStorage.getItem(JWT_STORAGE_KEY);
	},

	setToken(token: string): void {
		localStorage.setItem(JWT_STORAGE_KEY, token);
	},

	clearToken(): void {
		localStorage.removeItem(JWT_STORAGE_KEY);
	},

	getAuthHeaders(): Record<string, string> {
		const token = this.getToken();
		console.log("[auth.getAuthHeaders] token:", token ? "present" : "missing");
		if (token) {
			return { Authorization: `Bearer jwt:${token}` };
		}
		return {};
	},

	isPreviewDeployment(): boolean {
		if (typeof window === "undefined") return false;
		return !window.location.hostname.includes("devpad.tools");
	},
};
