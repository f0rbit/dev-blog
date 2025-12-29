import { type Component, For, createSignal } from "solid-js";
import Button from "../ui/button";
import Input from "../ui/input";

interface Category {
	id: number;
	name: string;
	parent: string | null;
}

interface CategoryFormProps {
	categories: Category[];
	onSubmit: (data: { name: string; parent: string }) => Promise<void>;
}

const CategoryForm: Component<CategoryFormProps> = props => {
	const [name, setName] = createSignal("");
	const [parent, setParent] = createSignal("root");
	const [submitting, setSubmitting] = createSignal(false);

	const handleSubmit = async (e: Event) => {
		e.preventDefault();
		const trimmedName = name().trim();
		if (!trimmedName) return;

		setSubmitting(true);
		await props.onSubmit({ name: trimmedName, parent: parent() });
		setName("");
		setParent("root");
		setSubmitting(false);
	};

	return (
		<form onSubmit={handleSubmit} class="flex-col" style={{ gap: "12px" }}>
			<div class="form-row">
				<label for="category-name">Name</label>
				<Input value={name()} onInput={setName} placeholder="Category name" disabled={submitting()} />
			</div>
			<div class="form-row">
				<label for="category-parent">Parent</label>
				<select value={parent()} onChange={e => setParent(e.currentTarget.value)} disabled={submitting()}>
					<For each={props.categories}>{cat => <option value={cat.name}>{cat.name}</option>}</For>
				</select>
			</div>
			<Button type="submit" variant="primary" disabled={submitting() || !name().trim()}>
				Add Category
			</Button>
		</form>
	);
};

export default CategoryForm;
