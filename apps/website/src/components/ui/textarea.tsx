import type { Component } from "solid-js";
import { splitProps } from "solid-js";

interface TextareaProps {
	value: string;
	onInput: (value: string) => void;
	placeholder?: string;
	rows?: number;
	disabled?: boolean;
	class?: string;
}

const Textarea: Component<TextareaProps> = props => {
	const [local, rest] = splitProps(props, ["value", "onInput", "placeholder", "rows", "disabled", "class"]);

	return <textarea {...rest} value={local.value} onInput={e => local.onInput(e.currentTarget.value)} placeholder={local.placeholder} rows={local.rows ?? 4} disabled={local.disabled} class={local.class} />;
};

export default Textarea;
