import type { Component } from "solid-js";

type Status = "draft" | "scheduled" | "published";

type StatusBadgeProps = {
	status: Status;
};

const statusConfig: Record<Status, { label: string; class: string }> = {
	draft: { label: "Draft", class: "status-badge--draft" },
	scheduled: { label: "Scheduled", class: "status-badge--scheduled" },
	published: { label: "Published", class: "status-badge--published" },
};

const StatusBadge: Component<StatusBadgeProps> = props => {
	const config = () => statusConfig[props.status];

	return (
		<span class={`status-badge ${config().class}`}>
			<StatusIcon status={props.status} />
			{config().label}
		</span>
	);
};

const StatusIcon: Component<{ status: Status }> = props => {
	const iconPath = (): string => {
		switch (props.status) {
			case "draft":
				return "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z";
			case "scheduled":
				return "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z";
			case "published":
				return "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z";
		}
	};

	return (
		<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d={iconPath()} />
		</svg>
	);
};

export default StatusBadge;
