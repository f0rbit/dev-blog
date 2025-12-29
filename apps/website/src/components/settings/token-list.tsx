import { type Component, For, Show } from "solid-js";
import Button from "../ui/button";

interface Token {
	id: number;
	name: string;
	note?: string;
	enabled: boolean;
	created_at: string;
}

interface TokenListProps {
	tokens: Token[];
	onToggle: (id: number, enabled: boolean) => void;
	onDelete: (id: number) => void;
}

const formatDate = (dateStr: string): string => {
	const date = new Date(dateStr);
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
};

const TokenList: Component<TokenListProps> = props => {
	return (
		<div class="token-list">
			<Show when={props.tokens.length === 0}>
				<div class="empty-state">
					<p>No API tokens yet.</p>
				</div>
			</Show>
			<For each={props.tokens}>
				{token => (
					<div class="token-item" classList={{ "card-inactive": !token.enabled }}>
						<div class="token-item__info">
							<span class="token-item__name">{token.name}</span>
							<div class="token-item__meta">
								<Show when={token.note}>
									<span>{token.note}</span>
									<span> · </span>
								</Show>
								<span>Created {formatDate(token.created_at)}</span>
								<span> · </span>
								<span>{token.enabled ? "Enabled" : "Disabled"}</span>
							</div>
						</div>
						<div class="token-item__actions">
							<Button variant="secondary" onClick={() => props.onToggle(token.id, !token.enabled)}>
								{token.enabled ? "Disable" : "Enable"}
							</Button>
							<Button variant="danger" onClick={() => props.onDelete(token.id)}>
								Delete
							</Button>
						</div>
					</div>
				)}
			</For>
		</div>
	);
};

export default TokenList;
