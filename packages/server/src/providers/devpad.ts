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
		const fetchResult = await try_catch_async(
			async () => {
				const response = await fetch(`${config.apiUrl}/api/v0/projects`, {
					headers: {
						Authorization: `Bearer jwt:${token}`,
						"Content-Type": "application/json",
					},
				});

				if (!response.ok) {
					if (response.status === 401) throw new Error("Invalid or expired DevPad token");
					throw new Error(`DevPad API error: ${response.status} ${response.statusText}`);
				}

				return response.json();
			},
			e => format_error(e)
		);

		return pipe(fetchResult)
			.map(extractProjectsArray)
			.flat_map((data: unknown) =>
				try_catch(
					() => ProjectsResponseSchema.parse(data),
					e => `Invalid response format: ${format_error(e)}`
				)
			)
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
