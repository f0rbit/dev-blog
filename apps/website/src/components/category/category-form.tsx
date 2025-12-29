import { type Component, For, createEffect, createSignal } from "solid-js";
import Button from "../ui/button";
import Input from "../ui/input";
import Modal from "../ui/modal";

interface Category {
	id: number;
	name: string;
	parent: string | null;
}

interface CategoryFormProps {
	categories: Category[];
	onSubmit: (data: { name: string; parent: string }) => Promise<void>;
	isOpen: boolean;
	onClose: () => void;
	defaultParent: string;
}

const CategoryForm: Component<CategoryFormProps> = props => {
	const [name, setName] = createSignal("");
	const [parent, setParent] = createSignal(props.defaultParent);
	const [submitting, setSubmitting] = createSignal(false);

	createEffect(() => {
		if (props.isOpen) {
			setParent(props.defaultParent);
			setName("");
		}
	});

	const handleSubmit = async (e: Event) => {
		e.preventDefault();
		const trimmedName = name().trim();
		if (!trimmedName) return;

		setSubmitting(true);
		await props.onSubmit({ name: trimmedName, parent: parent() });
		setName("");
		setParent("root");
		setSubmitting(false);
		props.onClose();
	};

	const parentCategory = () => {
		const p = props.categories.find(c => c.name === props.defaultParent);
		return p?.name ?? "root";
	};

	return (
		<Modal isOpen={props.isOpen} onClose={props.onClose} title="Add Category">
			<form onSubmit={handleSubmit} class="modal-form">
				<div class="form-row">
					<label for="category-name" class="text-xs tertiary">
						Name
					</label>
					<Input value={name()} onInput={setName} placeholder="Category name" disabled={submitting()} />
				</div>
				<div class="form-row">
					<label for="category-parent" class="text-xs tertiary">
						Parent
					</label>
					<select value={parent()} onChange={e => setParent(e.currentTarget.value)} disabled={submitting()}>
						<For each={props.categories}>{cat => <option value={cat.name}>{cat.name}</option>}</For>
					</select>
					<p class="text-xs muted">
						Creating under: <span class="secondary">{parentCategory()}</span>
					</p>
				</div>
				<div class="modal-actions">
					<Button type="button" variant="secondary" onClick={props.onClose} disabled={submitting()}>
						Cancel
					</Button>
					<Button type="submit" variant="primary" disabled={submitting() || !name().trim()}>
						{submitting() ? "Adding..." : "Add Category"}
					</Button>
				</div>
			</form>
		</Modal>
	);
};

export default CategoryForm;
