import { type Component, For, Show, createMemo } from "solid-js";
import Button from "../ui/button";

interface Category {
	id: number;
	name: string;
	parent: string | null;
}

interface CategoryTreeProps {
	categories: Category[];
	onDelete: (name: string) => void;
}

type TreeNode = Category & { children: TreeNode[]; depth: number };

const buildTree = (categories: Category[]): TreeNode[] => {
	const nodeMap = new Map<string, TreeNode>();
	const roots: TreeNode[] = [];

	for (const cat of categories) {
		nodeMap.set(cat.name, { ...cat, children: [], depth: 0 });
	}

	for (const cat of categories) {
		const node = nodeMap.get(cat.name);
		if (!node) continue;

		const parentName = cat.parent ?? "root";
		const parentNode = nodeMap.get(parentName);

		if (parentNode) {
			node.depth = parentNode.depth + 1;
			parentNode.children.push(node);
		} else if (cat.name === "root" || !cat.parent) {
			roots.push(node);
		}
	}

	return roots;
};

const flattenTree = (nodes: TreeNode[]): TreeNode[] => nodes.flatMap(node => [node, ...flattenTree(node.children)]);

const CategoryTree: Component<CategoryTreeProps> = props => {
	const flatCategories = createMemo(() => {
		const tree = buildTree(props.categories);
		return flattenTree(tree);
	});

	return (
		<div class="category-tree">
			<Show when={flatCategories().length === 0}>
				<p class="muted text-sm">No categories found.</p>
			</Show>
			<For each={flatCategories()}>
				{category => (
					<div class="category-item" style={{ "padding-left": `${category.depth * 16 + 8}px` }}>
						<span class="category-item__name">{category.name}</span>
						<Show when={category.name !== "root"}>
							<Button variant="danger" onClick={() => props.onDelete(category.name)}>
								Delete
							</Button>
						</Show>
					</div>
				)}
			</For>
		</div>
	);
};

export default CategoryTree;
