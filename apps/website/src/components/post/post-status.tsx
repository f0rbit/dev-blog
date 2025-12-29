import type { Component } from "solid-js";
import { Show, createEffect, createSignal } from "solid-js";

type StatusMode = "draft" | "now" | "schedule";

type PostStatusProps = {
	publishAt: Date | null;
	onUpdate: (publishAt: Date | null) => void;
};

const deriveMode = (publishAt: Date | null): StatusMode => {
	if (!publishAt) return "draft";
	const now = new Date();
	const diff = publishAt.getTime() - now.getTime();
	return diff <= 60000 ? "now" : "schedule";
};

const formatDatetimeLocal = (date: Date): string => {
	const pad = (n: number) => n.toString().padStart(2, "0");
	const year = date.getFullYear();
	const month = pad(date.getMonth() + 1);
	const day = pad(date.getDate());
	const hours = pad(date.getHours());
	const minutes = pad(date.getMinutes());
	return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const PostStatus: Component<PostStatusProps> = props => {
	const [mode, setMode] = createSignal<StatusMode>(deriveMode(props.publishAt));
	const [scheduleDate, setScheduleDate] = createSignal(props.publishAt ? formatDatetimeLocal(props.publishAt) : "");

	createEffect(() => {
		setMode(deriveMode(props.publishAt));
		if (props.publishAt) {
			setScheduleDate(formatDatetimeLocal(props.publishAt));
		}
	});

	const handleModeChange = (newMode: StatusMode) => {
		setMode(newMode);

		if (newMode === "draft") {
			props.onUpdate(null);
			return;
		}

		if (newMode === "now") {
			props.onUpdate(new Date());
			return;
		}

		const dateValue = scheduleDate();
		if (dateValue) {
			props.onUpdate(new Date(dateValue));
		}
	};

	const handleScheduleChange = (value: string) => {
		setScheduleDate(value);
		if (value && mode() === "schedule") {
			props.onUpdate(new Date(value));
		}
	};

	return (
		<div class="post-status">
			<div class="status-options">
				<button type="button" class={mode() === "draft" ? "selected" : ""} onClick={() => handleModeChange("draft")}>
					Draft
				</button>
				<button type="button" class={mode() === "now" ? "selected" : ""} onClick={() => handleModeChange("now")}>
					Publish Now
				</button>
				<button type="button" class={mode() === "schedule" ? "selected" : ""} onClick={() => handleModeChange("schedule")}>
					Schedule
				</button>
			</div>

			<Show when={mode() === "schedule"}>
				<input type="datetime-local" value={scheduleDate()} onInput={e => handleScheduleChange(e.currentTarget.value)} style={{ "margin-top": "8px", width: "100%" }} />
			</Show>
		</div>
	);
};

export default PostStatus;
