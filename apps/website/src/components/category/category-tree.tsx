import type { Category as SchemaCategory } from "@blog/schema";
import { type Component, For, Show, createMemo } from "solid-js";

const IconPlus: Component<{ size?: number }> = props => (
	<svg xmlns="http://www.w3.org/2000/svg" width={props.size ?? 18} height={props.size ?? 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		<path d="M5 12h14" />
		<path d="M12 5v14" />
	</svg>
);

const IconMinus: Component<{ size?: number }> = props => (
	<svg xmlns="http://www.w3.org/2000/svg" width={props.size ?? 18} height={props.size ?? 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		<path d="M5 12h14" />
	</svg>
);

type Category = Pick<SchemaCategory, "id" | "name" | "parent">;

interface CategoryTreeProps {
	categories: Category[];
	onDelete: (name: string) => void;
	onAddChild: (parentName: string) => void;
}

type TreeNode = Category & { children: TreeNode[]; depth: number; isLast: boolean };

const buildTree = (categories: Category[]): TreeNode[] => {
	const nodeMap = new Map<string, TreeNode>();

	for (const cat of categories) {
		nodeMap.set(cat.name, { ...cat, children: [], depth: 0, isLast: false });
	}

	const rootNode = nodeMap.get("root");
	if (!rootNode) return [];

	for (const cat of categories) {
		if (cat.name === "root") continue;

		const node = nodeMap.get(cat.name);
		if (!node) continue;

		const parentName = cat.parent === "root" || !cat.parent ? "root" : cat.parent;
		const parentNode = nodeMap.get(parentName);

		if (parentNode) {
			parentNode.children.push(node);
		}
	}

	const setDepthAndLast = (nodes: TreeNode[], depth: number) => {
		nodes.forEach((node, i) => {
			node.depth = depth;
			node.isLast = i === nodes.length - 1;
			setDepthAndLast(node.children, depth + 1);
		});
	};
	setDepthAndLast([rootNode], 0);

	return [rootNode];
};

const TreeNodeItem: Component<{
	node: TreeNode;
	onDelete: (name: string) => void;
	onAddChild: (parentName: string) => void;
	ancestorIsLast: boolean[];
}> = props => {
	const handleDelete = () => {
		if (!confirm(`Delete category "${props.node.name}"? This cannot be undone.`)) return;
		props.onDelete(props.node.name);
	};

	const handleAddChild = () => {
		props.onAddChild(props.node.name);
	};

	return (
		<>
			<div class="tree-node">
				<div class="tree-node__guides">
					<For each={props.ancestorIsLast}>{isLast => <span class={`tree-guide ${isLast ? "tree-guide--empty" : "tree-guide--line"}`} />}</For>
					<Show when={props.node.depth > 0}>
						<span class={`tree-guide ${props.node.isLast ? "tree-guide--corner" : "tree-guide--tee"}`} />
					</Show>
				</div>
				<span class="tree-node__name text-sm">{props.node.name}</span>
				<div class="tree-node__actions">
					<button type="button" class="tree-action tree-action--add" onClick={handleAddChild} title={`Add child to ${props.node.name}`} aria-label={`Add child category to ${props.node.name}`}>
						<IconPlus size={18} />
					</button>
					<Show when={props.node.name !== "root"}>
						<button type="button" class="tree-action tree-action--delete" onClick={handleDelete} title={`Delete ${props.node.name}`} aria-label={`Delete category ${props.node.name}`}>
							<IconMinus size={18} />
						</button>
					</Show>
				</div>
			</div>
			<For each={props.node.children}>{child => <TreeNodeItem node={child} onDelete={props.onDelete} onAddChild={props.onAddChild} ancestorIsLast={[...props.ancestorIsLast, props.node.isLast]} />}</For>
		</>
	);
};

const CategoryTree: Component<CategoryTreeProps> = props => {
	const tree = createMemo(() => buildTree(props.categories));

	return (
		<div class="category-tree">
			<Show when={tree().length === 0}>
				<p class="muted text-sm">No categories found.</p>
			</Show>
			<For each={tree()}>{node => <TreeNodeItem node={node} onDelete={props.onDelete} onAddChild={props.onAddChild} ancestorIsLast={[]} />}</For>
		</div>
	);
};

export default CategoryTree;
