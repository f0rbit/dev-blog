import { type Component, For } from "solid-js";
import { splitProps } from "solid-js";

interface SelectProps {
	value: string;
	onChange: (value: string) => void;
	options: { value: string; label: string }[];
	placeholder?: string;
	disabled?: boolean;
	class?: string;
}

const Select: Component<SelectProps> = props => {
	const [local, rest] = splitProps(props, ["value", "onChange", "options", "placeholder", "disabled", "class"]);

	return (
		<select {...rest} value={local.value} onChange={e => local.onChange(e.currentTarget.value)} disabled={local.disabled} class={local.class}>
			{local.placeholder && (
				<option value="" disabled>
					{local.placeholder}
				</option>
			)}
			<For each={local.options}>{option => <option value={option.value}>{option.label}</option>}</For>
		</select>
	);
};

export default Select;
