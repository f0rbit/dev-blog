import { type Component, For, createEffect, createSignal } from "solid-js";
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
	defaultParent: string;
	highlighted: boolean;
}

let formRef: HTMLElement | undefined;
let nameInputRef: HTMLInputElement | undefined;

const scrollToFormAndFocus = () => {
	formRef?.scrollIntoView({ behavior: "smooth", block: "center" });
	nameInputRef?.focus();
};

const CategoryForm: Component<CategoryFormProps> = props => {
	const [name, setName] = createSignal("");
	const [parent, setParent] = createSignal(props.defaultParent);
	const [submitting, setSubmitting] = createSignal(false);

	createEffect(() => {
		setParent(props.defaultParent);
		if (props.highlighted) scrollToFormAndFocus();
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
	};

	const parentCategory = () => {
		const p = props.categories.find(c => c.name === parent());
		return p?.name ?? "root";
	};

	return (
		<section
			ref={formRef}
			class="category-form-section"
			classList={{ "category-form-section--highlighted": props.highlighted }}
		>
			<h3 class="category-form-title">New Category</h3>
			<form onSubmit={handleSubmit} class="category-form">
				<div class="form-row">
					<label for="category-name" class="text-xs tertiary">
						Name
					</label>
					<Input ref={(el) => (nameInputRef = el)} value={name()} onInput={setName} placeholder="Category name" disabled={submitting()} />
				</div>
				<div class="form-row">
					<label for="category-parent" class="text-xs tertiary">
						Parent
					</label>
					<select value={parent()} onChange={e => setParent(e.currentTarget.value)} disabled={submitting()}>
						<For each={props.categories}>{cat => <option value={cat.name}>{cat.name}</option>}</For>
					</select>
				</div>
				<div class="category-form-actions">
					<Button type="submit" variant="primary" disabled={submitting() || !name().trim()}>
						{submitting() ? "Creating..." : "+ Create"}
					</Button>
				</div>
			</form>
		</section>
	);
};

export default CategoryForm;
