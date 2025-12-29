import type { Component } from "solid-js";
import { splitProps } from "solid-js";

interface InputProps {
	type?: "text" | "password" | "email";
	value: string;
	onInput: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
	error?: boolean;
	class?: string;
}

const Input: Component<InputProps> = props => {
	const [local, rest] = splitProps(props, ["type", "value", "onInput", "placeholder", "disabled", "error", "class"]);

	const inputType = () => local.type ?? "text";
	const classes = () => [local.error ? "input-error" : "", local.class ?? ""].filter(Boolean).join(" ");

	return <input {...rest} type={inputType()} value={local.value} onInput={e => local.onInput(e.currentTarget.value)} placeholder={local.placeholder} disabled={local.disabled} class={classes()} />;
};

export default Input;
