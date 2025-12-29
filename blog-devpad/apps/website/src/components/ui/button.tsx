import type { JSX, ParentComponent } from "solid-js";
import { splitProps } from "solid-js";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
} & JSX.ButtonHTMLAttributes<HTMLButtonElement>;

const variantStyles: Record<ButtonVariant, string> = {
  primary: `
    background-color: var(--input-focus);
    color: white;
  `,
  secondary: `
    background-color: var(--bg-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--input-border);
  `,
  ghost: `
    background-color: transparent;
    color: var(--text-secondary);
  `,
  danger: `
    background-color: oklch(55% 0.2 25);
    color: white;
  `,
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: `
    padding: var(--space-xs) var(--space-sm);
    font-size: 0.875rem;
  `,
  md: `
    padding: var(--space-sm) var(--space-md);
    font-size: 1rem;
  `,
  lg: `
    padding: var(--space-md) var(--space-lg);
    font-size: 1.125rem;
  `,
};

const baseStyles = `
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  border-radius: var(--radius-md);
  font-weight: 500;
  transition: opacity var(--transition-fast), transform var(--transition-fast);
  cursor: pointer;
  border: none;
`;

const Button: ParentComponent<ButtonProps> = (props) => {
  const [local, rest] = splitProps(props, ["variant", "size", "disabled", "children"]);
  
  const variant = () => local.variant ?? "primary";
  const size = () => local.size ?? "md";

  return (
    <button
      {...rest}
      disabled={local.disabled}
      style={{
        ...parseStyles(baseStyles),
        ...parseStyles(variantStyles[variant()]),
        ...parseStyles(sizeStyles[size()]),
        ...(local.disabled ? { opacity: "0.5", cursor: "not-allowed" } : {}),
      }}
      onMouseDown={(e) => {
        if (!local.disabled) {
          (e.currentTarget as HTMLElement).style.transform = "scale(0.98)";
        }
      }}
      onMouseUp={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "scale(1)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "scale(1)";
      }}
    >
      {local.children}
    </button>
  );
};

const parseStyles = (css: string): JSX.CSSProperties => {
  const result: Record<string, string> = {};
  css
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((declaration) => {
      const [prop, ...valueParts] = declaration.split(":");
      if (!prop || valueParts.length === 0) return;
      const camelProp = prop.trim().replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      result[camelProp] = valueParts.join(":").trim();
    });
  return result as JSX.CSSProperties;
};

export default Button;
