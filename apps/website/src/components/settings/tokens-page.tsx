import { type Component, Show, createResource, createSignal } from "solid-js";
import Button from "../ui/button";
import TokenForm from "./token-form";
import TokenList from "./token-list";

interface Token {
	id: number;
	name: string;
	note?: string;
	enabled: boolean;
	created_at: string;
}

const API_BASE = "http://localhost:8080";

const fetchTokens = async (): Promise<Token[]> => {
	const res = await fetch(`${API_BASE}/tokens`);
	if (!res.ok) throw new Error("Failed to fetch tokens");
	const data = await res.json();
	return data.tokens ?? [];
};

const TokensPage: Component = () => {
	const [tokens, { refetch }] = createResource(fetchTokens);
	const [showModal, setShowModal] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);

	const handleToggle = async (id: number, enabled: boolean) => {
		setError(null);
		const res = await fetch(`${API_BASE}/token/${id}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ enabled }),
		});

		if (!res.ok) {
			setError("Failed to update token");
			return;
		}

		refetch();
	};

	const handleDelete = async (id: number) => {
		setError(null);
		const res = await fetch(`${API_BASE}/token/${id}`, {
			method: "DELETE",
		});

		if (!res.ok) {
			setError("Failed to delete token");
			return;
		}

		refetch();
	};

	const handleCreate = async (data: { name: string; note?: string }): Promise<{ key: string }> => {
		const res = await fetch(`${API_BASE}/token`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(data),
		});

		if (!res.ok) {
			throw new Error("Failed to create token");
		}

		const result = await res.json();
		refetch();
		return result;
	};

	const handleModalClose = () => {
		setShowModal(false);
	};

	return (
		<div class="flex-col" style={{ gap: "24px" }}>
			<div class="flex-row justify-between">
				<span />
				<Button variant="primary" onClick={() => setShowModal(true)}>
					New Token
				</Button>
			</div>

			<Show when={error()}>
				<div class="form-error">
					<p class="text-sm">{error()}</p>
				</div>
			</Show>

			<Show when={tokens.loading}>
				<p class="muted text-sm">Loading tokens...</p>
			</Show>

			<Show when={tokens.error}>
				<div class="form-error">
					<p class="text-sm">Failed to load tokens</p>
				</div>
			</Show>

			<Show when={tokens()} keyed>
				{tokenList => <TokenList tokens={tokenList} onToggle={handleToggle} onDelete={handleDelete} />}
			</Show>

			<TokenForm isOpen={showModal()} onSubmit={handleCreate} onClose={handleModalClose} />
		</div>
	);
};

export default TokensPage;
