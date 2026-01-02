import { type Project, ProjectSchema, type Result, err, format_error, ok, pipe, try_catch, try_catch_async } from "@blog/schema";
import { z } from "zod";

export type DevpadProviderConfig = {
	apiUrl: string;
};

export type DevpadProvider = {
	fetchProjects: (token: string) => Promise<Result<Project[], string>>;
};

const ProjectsResponseSchema = z.array(ProjectSchema);

const extractProjectsArray = (data: unknown): unknown => (Array.isArray(data) ? data : (data as { projects?: unknown })?.projects);

export const createDevpadProvider = (config: DevpadProviderConfig): DevpadProvider => {
	const fetchProjects = async (token: string): Promise<Result<Project[], string>> => {
		const url = `${config.apiUrl}/api/v0/projects`;
		console.log("[devpad] fetchProjects:", { url, tokenLength: token?.length });

		const fetchResult = await try_catch_async(
			async () => {
				const response = await fetch(url, {
					headers: {
						Authorization: `Bearer jwt:${token}`,
						"Content-Type": "application/json",
					},
				});

				console.log("[devpad] fetchProjects response:", { status: response.status, ok: response.ok });

				if (!response.ok) {
					const body = await response.text().catch(() => "");
					console.log("[devpad] fetchProjects error body:", body.slice(0, 500));
					if (response.status === 401) throw new Error("Invalid or expired DevPad token");
					throw new Error(`DevPad API error: ${response.status} ${response.statusText}`);
				}

				return response.json();
			},
			e => {
				console.log("[devpad] fetchProjects exception:", format_error(e));
				return format_error(e);
			}
		);

		console.log("[devpad] fetchResult:", { ok: fetchResult.ok });

		return pipe(fetchResult)
			.map(extractProjectsArray)
			.flat_map((data: unknown) => {
				console.log("[devpad] parsing projects data:", { isArray: Array.isArray(data), length: Array.isArray(data) ? data.length : "n/a" });
				return try_catch(
					() => ProjectsResponseSchema.parse(data),
					e => {
						console.log("[devpad] parse error:", format_error(e));
						return `Invalid response format: ${format_error(e)}`;
					}
				);
			})
			.result();
	};

	return { fetchProjects };
};

export const createMockDevpadProvider = (): DevpadProvider & {
	setProjects: (p: Project[]) => void;
	setError: (e: string | null) => void;
} => {
	let projects: Project[] = [];
	let error: string | null = null;

	return {
		setProjects: p => {
			projects = p;
		},
		setError: e => {
			error = e;
		},
		fetchProjects: async _token => {
			if (error) return err(error);
			return ok(projects);
		},
	};
};
