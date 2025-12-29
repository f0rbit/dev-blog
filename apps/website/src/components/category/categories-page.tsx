import { type Component, Show, createResource, createSignal } from "solid-js";
import CategoryForm from "./category-form";
import CategoryTree from "./category-tree";

interface Category {
	id: number;
	name: string;
	parent: string | null;
}

const API_BASE = "http://localhost:8080";

interface CategoryNode {
	name: string;
	parent: string | null;
	children?: CategoryNode[];
}

const flattenTree = (nodes: CategoryNode[], id = 1): Category[] => nodes.flatMap((n, i) => [{ id: id + i, name: n.name, parent: n.parent }, ...flattenTree(n.children ?? [], id + i + 100)]);

const fetchCategories = async (): Promise<Category[]> => {
	const res = await fetch(`${API_BASE}/categories`);
	if (!res.ok) throw new Error("Failed to fetch categories");
	const data = await res.json();
	// API returns tree structure { categories: [...] }, flatten it
	return flattenTree(data.categories ?? []);
};

const CategoriesPage: Component = () => {
	const [categories, { refetch }] = createResource(fetchCategories);
	const [error, setError] = createSignal<string | null>(null);

	const handleDelete = async (name: string) => {
		setError(null);
		const res = await fetch(`${API_BASE}/category/${encodeURIComponent(name)}`, {
			method: "DELETE",
		});

		if (!res.ok) {
			setError("Failed to delete category");
			return;
		}

		refetch();
	};

	const handleCreate = async (data: { name: string; parent: string }) => {
		setError(null);
		const res = await fetch(`${API_BASE}/category`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(data),
		});

		if (!res.ok) {
			setError("Failed to create category");
			return;
		}

		refetch();
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
							<h2 class="text-sm muted">Category Hierarchy</h2>
							<CategoryTree categories={cats} onDelete={handleDelete} />
						</section>

						<section>
							<h2 class="text-sm muted">Add New Category</h2>
							<CategoryForm categories={cats} onSubmit={handleCreate} />
						</section>
					</>
				)}
			</Show>
		</div>
	);
};

export default CategoriesPage;
