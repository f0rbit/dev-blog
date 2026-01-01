import { describe, expect, it } from "bun:test";
import { type CategoryNode, buildCategoryTree } from "../../src/services/categories";

describe("buildCategoryTree", () => {
	it("builds tree from flat categories", () => {
		const categories = [
			{ name: "tech", parent: "root" },
			{ name: "javascript", parent: "tech" },
			{ name: "react", parent: "javascript" },
		];

		const tree = buildCategoryTree(categories);

		expect(tree).toHaveLength(1);

		const tech = tree[0];
		if (!tech) throw new Error("expected tech");
		expect(tech.name).toBe("tech");
		expect(tech.children).toHaveLength(1);

		const javascript = tech.children[0];
		if (!javascript) throw new Error("expected javascript");
		expect(javascript.name).toBe("javascript");
		expect(javascript.children).toHaveLength(1);

		const react = javascript.children[0];
		if (!react) throw new Error("expected react");
		expect(react.name).toBe("react");
	});

	it("handles multiple root categories", () => {
		const categories = [
			{ name: "tech", parent: "root" },
			{ name: "lifestyle", parent: "root" },
			{ name: "health", parent: "root" },
		];

		const tree = buildCategoryTree(categories);

		expect(tree).toHaveLength(3);
		const names = tree.map(n => n.name).sort();
		expect(names).toEqual(["health", "lifestyle", "tech"]);
	});

	it("handles empty input", () => {
		expect(buildCategoryTree([])).toEqual([]);
	});

	it("treats null parent as root", () => {
		const categories = [
			{ name: "orphan", parent: null },
			{ name: "child", parent: "orphan" },
		];

		const tree = buildCategoryTree(categories);

		expect(tree).toHaveLength(1);

		const orphan = tree[0];
		if (!orphan) throw new Error("expected orphan");
		expect(orphan.name).toBe("orphan");
		expect(orphan.children).toHaveLength(1);

		const child = orphan.children[0];
		if (!child) throw new Error("expected child");
		expect(child.name).toBe("child");
	});

	it("handles categories with missing parent as root", () => {
		const categories = [
			{ name: "orphan", parent: "nonexistent" },
			{ name: "another", parent: "also-missing" },
		];

		const tree = buildCategoryTree(categories);

		expect(tree).toHaveLength(2);
		const names = tree.map(n => n.name).sort();
		expect(names).toEqual(["another", "orphan"]);
	});

	it("builds complex nested structure", () => {
		const categories = [
			{ name: "tech", parent: "root" },
			{ name: "frontend", parent: "tech" },
			{ name: "backend", parent: "tech" },
			{ name: "react", parent: "frontend" },
			{ name: "vue", parent: "frontend" },
			{ name: "nodejs", parent: "backend" },
			{ name: "python", parent: "backend" },
			{ name: "lifestyle", parent: "root" },
			{ name: "travel", parent: "lifestyle" },
		];

		const tree = buildCategoryTree(categories);

		expect(tree).toHaveLength(2);

		const tech = tree.find(n => n.name === "tech");
		if (!tech) throw new Error("expected tech");
		expect(tech.children).toHaveLength(2);

		const frontend = tech.children.find(n => n.name === "frontend");
		if (!frontend) throw new Error("expected frontend");
		expect(frontend.children).toHaveLength(2);
		const frontendChildren = frontend.children.map(n => n.name).sort();
		expect(frontendChildren).toEqual(["react", "vue"]);

		const backend = tech.children.find(n => n.name === "backend");
		if (!backend) throw new Error("expected backend");
		expect(backend.children).toHaveLength(2);
		const backendChildren = backend.children.map(n => n.name).sort();
		expect(backendChildren).toEqual(["nodejs", "python"]);

		const lifestyle = tree.find(n => n.name === "lifestyle");
		if (!lifestyle) throw new Error("expected lifestyle");
		expect(lifestyle.children).toHaveLength(1);
		const travel = lifestyle.children[0];
		if (!travel) throw new Error("expected travel");
		expect(travel.name).toBe("travel");
	});

	it("preserves parent reference in nodes", () => {
		const categories = [
			{ name: "parent", parent: "root" },
			{ name: "child", parent: "parent" },
		];

		const tree = buildCategoryTree(categories);

		const parentNode = tree[0];
		if (!parentNode) throw new Error("expected parent");
		expect(parentNode.parent).toBe("root");

		const childNode = parentNode.children[0];
		if (!childNode) throw new Error("expected child");
		expect(childNode.parent).toBe("parent");
	});

	it("works with extra properties on input", () => {
		const categories = [
			{ name: "tech", parent: "root", owner_id: 1, id: 1 },
			{ name: "js", parent: "tech", owner_id: 1, id: 2 },
		];

		const tree = buildCategoryTree(categories);

		expect(tree).toHaveLength(1);

		const tech = tree[0];
		if (!tech) throw new Error("expected tech");
		expect(tech.name).toBe("tech");

		const js = tech.children[0];
		if (!js) throw new Error("expected js");
		expect(js.name).toBe("js");
	});

	it("handles single category", () => {
		const categories = [{ name: "only", parent: "root" }];

		const tree = buildCategoryTree(categories);

		expect(tree).toHaveLength(1);

		const only = tree[0];
		if (!only) throw new Error("expected only");
		expect(only.name).toBe("only");
		expect(only.children).toEqual([]);
	});

	it("handles deeply nested categories", () => {
		const categories = [
			{ name: "level1", parent: "root" },
			{ name: "level2", parent: "level1" },
			{ name: "level3", parent: "level2" },
			{ name: "level4", parent: "level3" },
			{ name: "level5", parent: "level4" },
		];

		const tree = buildCategoryTree(categories);

		expect(tree).toHaveLength(1);
		let current: CategoryNode | undefined = tree[0];
		for (let i = 1; i <= 5; i++) {
			expect(current?.name).toBe(`level${i}`);
			current = current?.children[0];
		}
		expect(current).toBeUndefined();
	});
});
