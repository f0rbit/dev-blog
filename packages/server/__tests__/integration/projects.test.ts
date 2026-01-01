import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { AppContext, Project, User } from "@blog/schema";
import { Hono } from "hono";
import { authMiddleware } from "../../src/middleware/auth";
import { createMockDevpadProvider } from "../../src/providers/devpad";
import { projectsRouter } from "../../src/routes/projects";
import { createProjectService } from "../../src/services/projects";
import { hashToken } from "../../src/utils/crypto";
import { type TestContext, createMockDevpadVerifyFetch, createTestContext, createTestToken, createTestUser } from "../setup";

type ProjectsResponse = { projects: Project[] };
type ErrorResponse = { code: string; message: string };

const mockFetchWithPreconnect = (handler: (url: string | URL | Request, init?: RequestInit) => Promise<Response>) => {
	const fn = handler as typeof globalThis.fetch;
	(fn as unknown as { preconnect: () => void }).preconnect = () => {};
	return fn;
};

const createAuthenticatedTestApp = (ctx: TestContext, devpadApi: string) => {
	const app = new Hono<{ Variables: { user: User; appContext: AppContext; jwtToken?: string } }>();

	app.use("*", async (c, next) => {
		c.set("appContext", {
			db: ctx.db,
			corpus: ctx.corpus,
			devpadApi,
			environment: "test",
		});
		await next();
	});

	app.use("*", authMiddleware);
	app.route("/api/blog/projects", projectsRouter);

	return app;
};

const createTestApp = (ctx: TestContext, user: User, mockProvider: ReturnType<typeof createMockDevpadProvider>, jwtToken?: string) => {
	const app = new Hono<{ Variables: { user: User; appContext: AppContext; jwtToken?: string } }>();

	app.use("*", async (c, next) => {
		const appContext = {
			db: ctx.db,
			corpus: ctx.corpus,
			devpadApi: "https://devpad.test",
			environment: "test",
		};
		c.set("appContext", appContext);
		c.set("user", user);
		if (jwtToken) {
			c.set("jwtToken", jwtToken);
		}
		await next();
	});

	const projectsRouterWithMock = new Hono<{ Variables: { user: User; appContext: AppContext; jwtToken?: string } }>();

	projectsRouterWithMock.use("*", async (c, next) => {
		const user = c.get("user");
		if (!user) {
			return c.json({ code: "UNAUTHORIZED", message: "Authentication required" }, 401);
		}
		return next();
	});

	projectsRouterWithMock.get("/", async c => {
		const user = c.get("user");
		const appContext = c.get("appContext");
		const service = createProjectService({
			corpus: appContext.corpus,
			devpadProvider: mockProvider,
		});

		const result = await service.list(user.id);

		if (!result.ok) {
			return c.json({ code: "INTERNAL_ERROR", message: result.error.message ?? "Failed to list projects" }, 500);
		}

		return c.json({ projects: result.value });
	});

	projectsRouterWithMock.post("/refresh", async c => {
		const user = c.get("user");
		const jwtToken = c.get("jwtToken");

		if (!jwtToken) {
			return c.json({ code: "UNAUTHORIZED", message: "JWT authentication required for refresh" }, 401);
		}

		const appContext = c.get("appContext");
		const service = createProjectService({
			corpus: appContext.corpus,
			devpadProvider: mockProvider,
		});

		const result = await service.refresh(user.id, jwtToken);

		if (!result.ok) {
			return c.json({ code: "INTERNAL_ERROR", message: result.error.message ?? "Failed to refresh projects" }, 500);
		}

		return c.json({ projects: result.value });
	});

	app.route("/api/blog/projects", projectsRouterWithMock);

	return app;
};

const mockProjects: Project[] = [
	{
		id: "proj-1",
		name: "Project One",
		slug: "project-one",
		description: "First project",
		color: "#ff0000",
		icon: "folder",
		url: "https://example.com/1",
	},
	{
		id: "proj-2",
		name: "Project Two",
		slug: "project-two",
		description: null,
		color: null,
		icon: null,
		url: null,
	},
];

describe("Projects Route Integration", () => {
	let ctx: TestContext;

	beforeEach(() => {
		ctx = createTestContext();
	});

	afterEach(() => {
		ctx.close();
	});

	describe("GET /api/blog/projects", () => {
		it("returns empty list when cache is empty", async () => {
			const user = await createTestUser(ctx);
			const mockProvider = createMockDevpadProvider();

			const app = createTestApp(ctx, user as User, mockProvider);
			const res = await app.request("/api/blog/projects");

			expect(res.status).toBe(200);
			const body = (await res.json()) as ProjectsResponse;
			expect(body.projects).toEqual([]);
		});

		it("returns cached projects after refresh", async () => {
			const user = await createTestUser(ctx);
			const mockProvider = createMockDevpadProvider();
			mockProvider.setProjects(mockProjects);

			const app = createTestApp(ctx, user as User, mockProvider, "valid-jwt");

			await app.request("/api/blog/projects/refresh", { method: "POST" });

			const res = await app.request("/api/blog/projects");

			expect(res.status).toBe(200);
			const body = (await res.json()) as ProjectsResponse;
			expect(body.projects).toHaveLength(2);
			expect(body.projects[0]?.name).toBe("Project One");
		});
	});

	describe("POST /api/blog/projects/refresh", () => {
		it("requires JWT auth", async () => {
			const user = await createTestUser(ctx);
			const mockProvider = createMockDevpadProvider();

			const app = createTestApp(ctx, user as User, mockProvider);
			const res = await app.request("/api/blog/projects/refresh", { method: "POST" });

			expect(res.status).toBe(401);
			const body = (await res.json()) as ErrorResponse;
			expect(body.code).toBe("UNAUTHORIZED");
			expect(body.message).toContain("JWT");
		});

		it("fetches and caches projects from DevPad", async () => {
			const user = await createTestUser(ctx);
			const mockProvider = createMockDevpadProvider();
			mockProvider.setProjects(mockProjects);

			const app = createTestApp(ctx, user as User, mockProvider, "valid-jwt-token");
			const res = await app.request("/api/blog/projects/refresh", { method: "POST" });

			expect(res.status).toBe(200);
			const body = (await res.json()) as ProjectsResponse;
			expect(body.projects).toHaveLength(2);
			expect(body.projects[0]?.id).toBe("proj-1");
			expect(body.projects[1]?.id).toBe("proj-2");
		});

		it("caches projects for subsequent GET requests", async () => {
			const user = await createTestUser(ctx);
			const mockProvider = createMockDevpadProvider();
			mockProvider.setProjects(mockProjects);

			const app = createTestApp(ctx, user as User, mockProvider, "jwt");

			const refreshRes = await app.request("/api/blog/projects/refresh", { method: "POST" });
			expect(refreshRes.status).toBe(200);
			const refreshBody = (await refreshRes.json()) as ProjectsResponse;
			expect(refreshBody.projects).toHaveLength(2);

			mockProvider.setProjects([]);

			const listRes = await app.request("/api/blog/projects");
			const listBody = (await listRes.json()) as ProjectsResponse;
			expect(listBody.projects).toHaveLength(2);
		});

		it("returns error when DevPad fails", async () => {
			const user = await createTestUser(ctx);
			const mockProvider = createMockDevpadProvider();
			mockProvider.setError("DevPad API unavailable");

			const app = createTestApp(ctx, user as User, mockProvider, "jwt");
			const res = await app.request("/api/blog/projects/refresh", { method: "POST" });

			expect(res.status).toBe(500);
			const body = (await res.json()) as ErrorResponse;
			expect(body.code).toBe("INTERNAL_ERROR");
		});
	});

	describe("multi-user isolation", () => {
		it("users have separate project caches", async () => {
			const userA = await createTestUser(ctx, { github_id: 100001 });
			const userB = await createTestUser(ctx, { github_id: 100002 });

			const mockProviderA = createMockDevpadProvider();
			const mockProviderB = createMockDevpadProvider();

			const projectsA: Project[] = [
				{
					id: "proj-a",
					name: "User A Project",
					slug: "user-a-project",
					description: null,
					color: null,
					icon: null,
					url: null,
				},
			];

			const projectsB: Project[] = [
				{
					id: "proj-b1",
					name: "User B Project 1",
					slug: "user-b-project-1",
					description: null,
					color: null,
					icon: null,
					url: null,
				},
				{
					id: "proj-b2",
					name: "User B Project 2",
					slug: "user-b-project-2",
					description: null,
					color: null,
					icon: null,
					url: null,
				},
			];

			mockProviderA.setProjects(projectsA);
			mockProviderB.setProjects(projectsB);

			const appA = createTestApp(ctx, userA as User, mockProviderA, "jwt-a");
			const appB = createTestApp(ctx, userB as User, mockProviderB, "jwt-b");

			await appA.request("/api/blog/projects/refresh", { method: "POST" });
			await appB.request("/api/blog/projects/refresh", { method: "POST" });

			const resA = await appA.request("/api/blog/projects");
			const bodyA = (await resA.json()) as ProjectsResponse;
			expect(bodyA.projects).toHaveLength(1);
			expect(bodyA.projects[0]?.name).toBe("User A Project");

			const resB = await appB.request("/api/blog/projects");
			const bodyB = (await resB.json()) as ProjectsResponse;
			expect(bodyB.projects).toHaveLength(2);
		});
	});
});

describe("Projects Routes (HTTP)", () => {
	let ctx: TestContext;
	let originalFetch: typeof globalThis.fetch;
	const devpadApi = "https://devpad.test";

	beforeEach(() => {
		ctx = createTestContext();
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		ctx.close();
		globalThis.fetch = originalFetch;
	});

	describe("GET /api/blog/projects", () => {
		it("requires authentication", async () => {
			const app = createAuthenticatedTestApp(ctx, devpadApi);
			const res = await app.request("/api/blog/projects");

			expect(res.status).toBe(401);
			const body = (await res.json()) as ErrorResponse;
			expect(body.code).toBe("UNAUTHORIZED");
		});

		it("returns projects with valid Auth-Token", async () => {
			const user = await createTestUser(ctx);
			const plainToken = "projects-test-token";
			await createTestToken(ctx, user.id, "test-token", await hashToken(plainToken));

			const app = createAuthenticatedTestApp(ctx, devpadApi);
			const res = await app.request("/api/blog/projects", {
				headers: { "Auth-Token": plainToken },
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as ProjectsResponse;
			expect(body.projects).toEqual([]);
		});

		it("returns projects with valid JWT auth", async () => {
			const mockUser = {
				github_id: 999001,
				username: "jwtprojectsuser",
				email: "jwt@projects.test",
				avatar_url: null,
			};

			globalThis.fetch = mockFetchWithPreconnect(createMockDevpadVerifyFetch({ authenticated: true, user: mockUser }));

			const app = createAuthenticatedTestApp(ctx, devpadApi);
			const res = await app.request("/api/blog/projects", {
				headers: { Authorization: "Bearer jwt:valid-jwt-token" },
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as ProjectsResponse;
			expect(body.projects).toEqual([]);
		});
	});

	describe("POST /api/blog/projects/refresh", () => {
		it("requires authentication", async () => {
			const app = createAuthenticatedTestApp(ctx, devpadApi);
			const res = await app.request("/api/blog/projects/refresh", { method: "POST" });

			expect(res.status).toBe(401);
			const body = (await res.json()) as ErrorResponse;
			expect(body.code).toBe("UNAUTHORIZED");
		});

		it("requires JWT token (rejects Auth-Token only)", async () => {
			const user = await createTestUser(ctx);
			const plainToken = "refresh-test-token";
			await createTestToken(ctx, user.id, "test-token", await hashToken(plainToken));

			const app = createAuthenticatedTestApp(ctx, devpadApi);
			const res = await app.request("/api/blog/projects/refresh", {
				method: "POST",
				headers: { "Auth-Token": plainToken },
			});

			expect(res.status).toBe(401);
			const body = (await res.json()) as ErrorResponse;
			expect(body.code).toBe("UNAUTHORIZED");
			expect(body.message).toContain("JWT");
		});

		it("works with valid JWT auth", async () => {
			const mockUser = {
				github_id: 999002,
				username: "jwtrefreshuser",
				email: "jwtrefresh@projects.test",
				avatar_url: null,
			};

			const mockProjectsResponse = JSON.stringify([{ id: "p1", name: "Project 1", slug: "project-1", description: null, color: null, icon: null, url: null }]);

			globalThis.fetch = mockFetchWithPreconnect(async url => {
				const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

				if (urlStr.includes("/api/auth/verify")) {
					return new Response(
						JSON.stringify({
							authenticated: true,
							user: {
								id: `user-${mockUser.github_id}`,
								name: mockUser.username,
								email: mockUser.email,
								github_id: mockUser.github_id,
								image_url: mockUser.avatar_url,
							},
						}),
						{ status: 200 }
					);
				}

				if (urlStr.includes("/api/v0/projects")) {
					return new Response(mockProjectsResponse, { status: 200 });
				}

				return new Response("Not found", { status: 404 });
			});

			const app = createAuthenticatedTestApp(ctx, devpadApi);
			const res = await app.request("/api/blog/projects/refresh", {
				method: "POST",
				headers: { Authorization: "Bearer jwt:valid-jwt-token" },
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as ProjectsResponse;
			expect(body.projects).toHaveLength(1);
			expect(body.projects[0]?.name).toBe("Project 1");
		});
	});
});
