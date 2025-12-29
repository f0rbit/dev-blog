import type { Component } from "solid-js";
import { For, createSignal } from "solid-js";

type TagEditorProps = {
	tags: string[];
	onChange: (tags: string[]) => void;
};

const TagEditor: Component<TagEditorProps> = props => {
	const [inputValue, setInputValue] = createSignal("");

	const addTag = () => {
		const tag = inputValue().trim().toLowerCase();
		if (!tag) return;
		if (props.tags.includes(tag)) return;

		props.onChange([...props.tags, tag]);
		setInputValue("");
	};

	const removeTag = (tagToRemove: string) => {
		props.onChange(props.tags.filter(t => t !== tagToRemove));
	};

	const handleKeyDown = (e: KeyboardEvent) => {
		if (e.key !== "Enter") return;
		e.preventDefault();
		addTag();
	};

	return (
		<div class="tag-editor">
			<div class="flex-row flex-wrap" style={{ gap: "4px" }}>
				<For each={props.tags}>
					{tag => (
						<span class="tag-badge">
							{tag}
							<button type="button" class="button-reset" onClick={() => removeTag(tag)} aria-label={`Remove ${tag}`}>
								<svg class="lucide" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M18 6L6 18M6 6l12 12" />
								</svg>
							</button>
						</span>
					)}
				</For>
			</div>

			<input type="text" placeholder="Add tag..." value={inputValue()} onInput={e => setInputValue(e.currentTarget.value)} onKeyDown={handleKeyDown} style={{ "margin-top": "8px", width: "100%" }} />
		</div>
	);
};

export default TagEditor;
