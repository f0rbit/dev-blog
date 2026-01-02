import { api } from "@/lib/api";
import type { Category as SchemaCategory } from "@blog/schema";
import { type Component, Show, createResource, createSignal } from "solid-js";
import CategoryForm from "./category-form";
import CategoryTree from "./category-tree";

type Category = Pick<SchemaCategory, "id" | "name" | "parent">;

interface CategoryNode {
	name: string;
	parent: string | null;
	children?: CategoryNode[];
}

interface Props {
	initialCategories?: Category[];
}

const flattenTree = (nodes: CategoryNode[], id = 1): Category[] => nodes.flatMap((n, i) => [{ id: id + i, name: n.name, parent: n.parent }, ...flattenTree(n.children ?? [], id + i + 100)]);

const fetchCategories = async (): Promise<Category[]> => {
	if (typeof window === "undefined") {
		return [];
	}
	const data = await api.json<{ categories?: CategoryNode[] }>("/api/blog/categories");
	return flattenTree(data.categories ?? []);
};

const CategoriesPage: Component<Props> = props => {
	// Use a signal to force refetch - increment to trigger new fetch
	const [fetchTrigger, setFetchTrigger] = createSignal(0);
	const [categories, { refetch }] = createResource(
		() => {
			const trigger = fetchTrigger();
			// Skip initial fetch if we have SSR data, but always fetch on trigger > 0
			if (trigger === 0 && props.initialCategories && props.initialCategories.length > 0) {
				return null;
			}
			return trigger;
		},
		fetchCategories,
		{ initialValue: props.initialCategories ?? [] }
	);
	const [error, setError] = createSignal<string | null>(null);
	const [defaultParent, setDefaultParent] = createSignal("root");
	const [formHighlighted, setFormHighlighted] = createSignal(false);

	const refreshCategories = () => setFetchTrigger(n => n + 1);

	const handleDelete = async (name: string) => {
		setError(null);
		try {
			await api.delete(`/api/blog/categories/${encodeURIComponent(name)}`);
			refreshCategories();
		} catch {
			setError("Failed to delete category");
		}
	};

	const handleCreate = async (data: { name: string; parent: string }) => {
		setError(null);
		try {
			await api.post("/api/blog/categories", data);
			refreshCategories();
		} catch {
			setError("Failed to create category");
		}
	};

	const selectParentForAdd = (parentName: string) => {
		setDefaultParent(parentName);
		setFormHighlighted(true);
		setTimeout(() => setFormHighlighted(false), 1500);
	};

	return (
		<div class="flex-col" style={{ gap: "24px" }}>
			<Show when={error()}>
				<div class="form-error">
					<p class="text-sm">{error()}</p>
				</div>
			</Show>

			<Show when={categories.loading}>
				<p class="muted text-sm">Loading categories...</p>
			</Show>

			<Show when={categories.error}>
				<div class="form-error">
					<p class="text-sm">Failed to load categories</p>
				</div>
			</Show>

			<Show when={categories()} keyed>
				{cats => (
					<>
						<section>
							<h2 class="text-sm muted" style={{ "margin-bottom": "8px" }}>
								Category Hierarchy
							</h2>
							<CategoryTree categories={cats} onDelete={handleDelete} onAddChild={selectParentForAdd} />
						</section>

						<CategoryForm categories={cats} onSubmit={handleCreate} defaultParent={defaultParent()} highlighted={formHighlighted()} />
					</>
				)}
			</Show>
		</div>
	);
};

export default CategoriesPage;
