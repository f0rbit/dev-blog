import { type Component, For, Show, createSignal } from "solid-js";

type PostStatus = "draft" | "scheduled" | "published";

type PostStatusProps = {
	value: PostStatus;
	onChange: (status: PostStatus) => void;
	disabled?: boolean;
};

type StatusOption = {
	value: PostStatus;
	label: string;
	description: string;
	icon: string;
};

const statusOptions: StatusOption[] = [
	{
		value: "draft",
		label: "Draft",
		description: "Not visible to readers",
		icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
	},
	{
		value: "scheduled",
		label: "Scheduled",
		description: "Will publish at set time",
		icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
	},
	{
		value: "published",
		label: "Published",
		description: "Live and visible to all",
		icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
	},
];

const PostStatusSelector: Component<PostStatusProps> = props => {
	const [isOpen, setIsOpen] = createSignal(false);

	const currentOption = () => statusOptions.find(o => o.value === props.value) ?? statusOptions[0];

	const handleSelect = (status: PostStatus) => {
		if (props.disabled) return;
		props.onChange(status);
		setIsOpen(false);
	};

	const handleKeyDown = (e: KeyboardEvent) => {
		if (e.key === "Escape") {
			setIsOpen(false);
			return;
		}
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			setIsOpen(!isOpen());
		}
	};

	return (
		<div class="post-status" style={containerStyles}>
			<button
				type="button"
				class="post-status__trigger"
				style={triggerStyles(props.disabled)}
				onClick={() => !props.disabled && setIsOpen(!isOpen())}
				onKeyDown={handleKeyDown}
				aria-expanded={isOpen()}
				aria-haspopup="listbox"
				disabled={props.disabled}
			>
				<span class="post-status__current" style={currentStyles}>
					<StatusIcon path={currentOption()?.icon ?? ""} status={props.value} />
					<span>{currentOption()?.label}</span>
				</span>
				<ChevronIcon isOpen={isOpen()} />
			</button>

			<Show when={isOpen()}>
				<div class="post-status__dropdown" style={dropdownStyles} aria-label="Post status">
					<For each={statusOptions}>
						{option => (
							<button type="button" class="post-status__option" style={optionStyles(option.value === props.value)} onClick={() => handleSelect(option.value)}>
								<StatusIcon path={option.icon} status={option.value} />
								<div style={optionTextStyles}>
									<span style={optionLabelStyles}>{option.label}</span>
									<span style={optionDescStyles}>{option.description}</span>
								</div>
								<Show when={option.value === props.value}>
									<CheckIcon />
								</Show>
							</button>
						)}
					</For>
				</div>
			</Show>
		</div>
	);
};

const StatusIcon: Component<{ path: string; status: PostStatus }> = props => (
	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style={{ color: `var(--status-${props.status})` }}>
		<path d={props.path} />
	</svg>
);

const ChevronIcon: Component<{ isOpen: boolean }> = props => (
	<svg
		width="16"
		height="16"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		style={{
			transition: "transform var(--transition-fast)",
			transform: props.isOpen ? "rotate(180deg)" : "rotate(0deg)",
		}}
	>
		<path d="M6 9l6 6 6-6" />
	</svg>
);

const CheckIcon: Component = () => (
	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style={{ color: "var(--input-focus)", "margin-left": "auto" }}>
		<path d="M5 13l4 4L19 7" />
	</svg>
);

const containerStyles = {
	position: "relative" as const,
	display: "inline-block",
};

const triggerStyles = (disabled?: boolean) => ({
	display: "flex",
	"align-items": "center",
	"justify-content": "space-between",
	gap: "var(--space-sm)",
	padding: "var(--space-sm) var(--space-md)",
	"min-width": "180px",
	"background-color": "var(--input-background)",
	border: "1px solid var(--input-border)",
	"border-radius": "var(--radius-md)",
	cursor: disabled ? "not-allowed" : "pointer",
	opacity: disabled ? "0.5" : "1",
	transition: "border-color var(--transition-fast)",
});

const currentStyles = {
	display: "flex",
	"align-items": "center",
	gap: "var(--space-sm)",
};

const dropdownStyles = {
	position: "absolute" as const,
	top: "calc(100% + var(--space-xs))",
	left: "0",
	right: "0",
	"background-color": "var(--bg-secondary)",
	border: "1px solid var(--input-border)",
	"border-radius": "var(--radius-md)",
	"box-shadow": "0 4px 12px rgba(0, 0, 0, 0.1)",
	"z-index": "10",
	overflow: "hidden",
};

const optionStyles = (isSelected: boolean) => ({
	display: "flex",
	"align-items": "center",
	gap: "var(--space-sm)",
	width: "100%",
	padding: "var(--space-sm) var(--space-md)",
	"background-color": isSelected ? "var(--bg-tertiary)" : "transparent",
	border: "none",
	cursor: "pointer",
	"text-align": "left" as const,
	transition: "background-color var(--transition-fast)",
});

const optionTextStyles = {
	display: "flex",
	"flex-direction": "column" as const,
	gap: "2px",
};

const optionLabelStyles = {
	"font-weight": "500",
	color: "var(--text-primary)",
};

const optionDescStyles = {
	"font-size": "0.75rem",
	color: "var(--text-muted)",
};

export default PostStatusSelector;
