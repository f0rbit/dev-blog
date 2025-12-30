import { createSignal, createResource, For, Show } from "solid-js";
import { api } from "@/lib/api";

type Project = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  icon: string | null;
};

type ProjectSelectorProps = {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
};

const fetchProjects = async (): Promise<{ projects: Project[]; connected: boolean }> => {
  const response = await fetch(api.blog("/projects"), { 
    credentials: "include" 
  });
  if (!response.ok) return { projects: [], connected: false };
  return response.json();
};

export const ProjectSelector = (props: ProjectSelectorProps) => {
  const [data, { refetch }] = createResource(fetchProjects);
  const [isOpen, setIsOpen] = createSignal(false);
  const [refreshing, setRefreshing] = createSignal(false);

  const projects = () => data()?.projects ?? [];
  const connected = () => data()?.connected ?? false;

  const selectedProjects = () => 
    projects().filter(p => props.selectedIds.includes(p.id));

  const availableProjects = () =>
    projects().filter(p => !props.selectedIds.includes(p.id));

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
      await fetch(api.blog("/projects/refresh"), {
        method: "POST",
        credentials: "include",
      });
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div class="project-selector">
      <Show when={!connected()}>
        <p class="project-selector__not-connected">
          Connect DevPad in Settings to link projects
        </p>
      </Show>

      <Show when={connected()}>
        {/* Selected projects as badges */}
        <div class="project-selector__selected">
          <For each={selectedProjects()}>
            {project => (
              <span 
                class="project-badge"
                style={{ "--project-color": project.color ?? "var(--text-muted)" }}
              >
                {project.name}
                <button
                  type="button"
                  class="project-badge__remove"
                  onClick={() => removeProject(project.id)}
                  aria-label={`Remove ${project.name}`}
                >
                  ×
                </button>
              </span>
            )}
          </For>
          
          <Show when={selectedProjects().length === 0}>
            <span class="project-selector__placeholder">No projects linked</span>
          </Show>
        </div>

        {/* Dropdown toggle */}
        <div class="project-selector__controls">
          <button
            type="button"
            class="project-selector__toggle"
            onClick={() => setIsOpen(!isOpen())}
          >
            {isOpen() ? "Done" : "Add Project"}
          </button>
          
          <button
            type="button"
            class="project-selector__refresh"
            onClick={handleRefresh}
            disabled={refreshing()}
            title="Refresh projects from DevPad"
          >
            {refreshing() ? "..." : "↻"}
          </button>
        </div>

        {/* Dropdown list */}
        <Show when={isOpen()}>
          <div class="project-selector__dropdown">
            <Show when={availableProjects().length === 0}>
              <p class="project-selector__empty">No more projects to add</p>
            </Show>
            
            <For each={availableProjects()}>
              {project => (
                <button
                  type="button"
                  class="project-selector__option"
                  onClick={() => toggleProject(project.id)}
                >
                  <span 
                    class="project-selector__color"
                    style={{ background: project.color ?? "var(--text-muted)" }}
                  />
                  <span class="project-selector__name">{project.name}</span>
                  <Show when={project.description}>
                    <span class="project-selector__desc">{project.description}</span>
                  </Show>
                </button>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
};
