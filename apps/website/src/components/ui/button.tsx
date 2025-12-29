import type { JSX, ParentComponent } from "solid-js";
import { splitProps } from "solid-js";

interface ButtonProps {
	variant?: "primary" | "secondary" | "danger";
	type?: "button" | "submit";
	disabled?: boolean;
	onClick?: () => void;
	class?: string;
	children: JSX.Element;
}

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
	primary: "btn-primary",
	secondary: "btn-secondary",
	danger: "btn-danger",
};

const Button: ParentComponent<ButtonProps> = props => {
	const [local, rest] = splitProps(props, ["variant", "type", "disabled", "onClick", "class", "children"]);

	const variant = () => local.variant ?? "primary";
	const buttonType = () => local.type ?? "button";
	const classes = () => [variantClasses[variant()], local.class ?? ""].filter(Boolean).join(" ");

	return (
		<button {...rest} type={buttonType()} disabled={local.disabled} onClick={local.onClick} class={classes()}>
			{local.children}
		</button>
	);
};

export default Button;
