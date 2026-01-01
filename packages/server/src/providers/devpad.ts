import { type Project, ProjectSchema, type Result, err, ok } from "@blog/schema";
import { z } from "zod";

export type DevpadProviderConfig = {
	apiUrl: string;
};

export type DevpadProvider = {
	fetchProjects: (token: string) => Promise<Result<Project[], string>>;
};

const ProjectsResponseSchema = z.array(ProjectSchema);

export const createDevpadProvider = (config: DevpadProviderConfig): DevpadProvider => {
	const fetchProjects = async (token: string): Promise<Result<Project[], string>> => {
		try {
			const response = await fetch(`${config.apiUrl}/api/v0/projects`, {
				headers: {
					Authorization: `Bearer jwt:${token}`,
					"Content-Type": "application/json",
				},
			});

			if (!response.ok) {
				if (response.status === 401) {
					return err("Invalid or expired DevPad token");
				}
				return err(`DevPad API error: ${response.status} ${response.statusText}`);
			}

			const data: unknown = await response.json();
			const projectsArray = Array.isArray(data) ? data : (data as { projects?: unknown })?.projects;
			const parsed = ProjectsResponseSchema.safeParse(projectsArray);

			if (!parsed.success) {
				return err(`Invalid response format: ${parsed.error.message}`);
			}

			return ok(parsed.data);
		} catch (e) {
			return err(e instanceof Error ? e.message : "Failed to fetch projects");
		}
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
