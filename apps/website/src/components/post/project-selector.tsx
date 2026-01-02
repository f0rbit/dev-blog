import { api } from "@/lib/api";
import { For, Show, createResource, createSignal } from "solid-js";

type Project = {
	id: string;
	name: string;
	project_id: string;
	description: string | null;
	icon_url: string | null;
};

type ProjectSelectorProps = {
	selectedIds: string[];
	onChange: (ids: string[]) => void;
	initialProjects?: Project[];
};

const fetchProjects = async (): Promise<Project[]> => {
	const response = await api.fetch("/api/blog/projects");
	if (!response.ok) return [];
	const data: { projects?: Project[] } = await response.json();
	return data.projects ?? [];
};

export const ProjectSelector = (props: ProjectSelectorProps) => {
	// Use a trigger signal to control when to fetch
	// Start at 0, only fetch when trigger > 0 OR when we don't have initial data
	const [fetchTrigger, setFetchTrigger] = createSignal(0);

	const [projects, { refetch }] = createResource(
		() => {
			const trigger = fetchTrigger();
			// Skip initial fetch if we have SSR data
			if (trigger === 0 && props.initialProjects && props.initialProjects.length > 0) {
				return null; // Returning null skips the fetch
			}
			return trigger;
		},
		fetchProjects,
		{ initialValue: props.initialProjects ?? [] }
	);

	const [isOpen, setIsOpen] = createSignal(false);
	const [refreshing, setRefreshing] = createSignal(false);

	const selectedProjects = () => (projects() ?? []).filter(p => props.selectedIds.includes(p.id));

	const availableProjects = () => (projects() ?? []).filter(p => !props.selectedIds.includes(p.id));

	const toggleProject = (projectId: string) => {
		const current = props.selectedIds;
		if (current.includes(projectId)) {
			props.onChange(current.filter(id => id !== projectId));
		} else {
			props.onChange([...current, projectId]);
		}
	};

	const removeProject = (projectId: string) => {
		props.onChange(props.selectedIds.filter(id => id !== projectId));
	};

	const handleRefresh = async () => {
		setRefreshing(true);
		try {
			await api.fetch("/api/blog/projects/refresh", {
				method: "POST",
			});
			// Increment trigger to force a refetch
			setFetchTrigger(n => n + 1);
		} finally {
			setRefreshing(false);
		}
	};

	return (
		<div class="project-selector">
			<div class="project-selector__selected">
				<For each={selectedProjects()}>
					{project => (
						<span class="project-badge">
							{project.name}
							<button type="button" class="project-badge__remove" onClick={() => removeProject(project.id)} aria-label={`Remove ${project.name}`}>
								×
							</button>
						</span>
					)}
				</For>

				<Show when={selectedProjects().length === 0}>
					<span class="project-selector__placeholder">No projects linked</span>
				</Show>
			</div>

			<div class="project-selector__controls">
				<button type="button" class="project-selector__toggle" onClick={() => setIsOpen(!isOpen())}>
					{isOpen() ? "Done" : "Add Project"}
				</button>

				<button type="button" class="project-selector__refresh" onClick={handleRefresh} disabled={refreshing()} title="Refresh projects from DevPad">
					{refreshing() ? "..." : "↻"}
				</button>
			</div>

			<Show when={isOpen()}>
				<div class="project-selector__dropdown">
					<Show when={availableProjects().length === 0}>
						<p class="project-selector__empty">No more projects to add</p>
					</Show>

					<For each={availableProjects()}>
						{project => (
							<button type="button" class="project-selector__option" onClick={() => toggleProject(project.id)}>
								<span class="project-selector__color" />
								<span class="project-selector__name">{project.name}</span>
								<Show when={project.description}>
									<span class="project-selector__desc">{project.description}</span>
								</Show>
							</button>
						)}
					</For>
				</div>
			</Show>
		</div>
	);
};
