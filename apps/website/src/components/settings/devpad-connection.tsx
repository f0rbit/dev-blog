import type { Component } from "solid-js";

export const DevpadConnection: Component = () => {
	return (
		<div class="devpad-status">
			<p class="text-sm">
				<span style={{ color: "var(--color-success, #22c55e)" }}>●</span> Connected via DevPad login
			</p>
			<p class="text-sm muted" style={{ "margin-top": "8px" }}>
				Your DevPad projects are available in the post editor.
			</p>
		</div>
	);
};

export default DevpadConnection;
