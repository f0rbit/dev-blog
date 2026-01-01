import { api } from "@/lib/api";
import { type Component, For, Show, createSignal } from "solid-js";
import Button from "../ui/button";
import { DevpadConnection } from "./devpad-connection";
import TokenForm from "./token-form";
import TokenList from "./token-list";

interface User {
	id: number;
	github_id: number;
	username: string;
	email: string | null;
	avatar_url: string | null;
	created_at: string;
	updated_at: string;
}

interface Token {
	id: number;
	name: string;
	note?: string;
	enabled: boolean;
	created_at: string;
}

// Placeholder for future integrations feature
interface Integration {
	id: string;
	name: string;
	connected: boolean;
	username?: string;
}

interface SettingsPageProps {
	initialUser?: User | null;
	initialTokens?: Token[];
}

const formatDate = (dateStr: string): string => {
	const date = new Date(dateStr);
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
};

const integrations: Integration[] = [
	{ id: "devto", name: "DEV.to", connected: false },
	{ id: "medium", name: "Medium", connected: false },
	{ id: "github", name: "GitHub", connected: false },
	{ id: "hashnode", name: "Hashnode", connected: false },
];

const SettingsPage: Component<SettingsPageProps> = props => {
	const [user] = createSignal<User | null>(props.initialUser ?? null);

	const [tokens, setTokens] = createSignal<Token[]>(props.initialTokens ?? []);
	const [tokensLoading, setTokensLoading] = createSignal(false);
	const [tokensError, setTokensError] = createSignal<string | null>(null);

	const [showModal, setShowModal] = createSignal(false);

	const fetchTokens = async () => {
		try {
			const res = await api.fetch("/api/blog/tokens");
			if (!res.ok) {
				setTokensError("Failed to fetch tokens");
				return;
			}
			const data = (await res.json()) as { tokens?: Token[] };
			setTokens(data.tokens ?? []);
		} catch {
			setTokensError("Failed to fetch tokens");
		} finally {
			setTokensLoading(false);
		}
	};

	const refetchTokens = () => {
		setTokensLoading(true);
		setTokensError(null);
		fetchTokens();
	};

	const handleToggle = async (id: number, enabled: boolean) => {
		setTokensError(null);
		const res = await api.fetch(`/api/blog/token/${id}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ enabled }),
		});

		if (!res.ok) {
			setTokensError("Failed to update token");
			return;
		}

		refetchTokens();
	};

	const handleDelete = async (id: number) => {
		setTokensError(null);
		const res = await api.fetch(`/api/blog/token/${id}`, {
			method: "DELETE",
		});

		if (!res.ok) {
			setTokensError("Failed to delete token");
			return;
		}

		refetchTokens();
	};

	const handleCreate = async (data: { name: string; note?: string }): Promise<{ key: string }> => {
		const res = await api.fetch("/api/blog/token", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(data),
		});

		if (!res.ok) {
			throw new Error("Failed to create token");
		}

		const result = (await res.json()) as { key: string };
		refetchTokens();
		return result;
	};

	const handleIntegrationClick = (integration: Integration) => {
		alert(`${integration.name} integration coming soon!`);
	};

	return (
		<div class="flex-col" style={{ gap: "24px" }}>
			<section class="settings-section">
				<h3 class="settings-section__title">Profile</h3>
				<div class="settings-section__content">
					<Show when={user()} keyed fallback={<p class="muted text-sm">Not signed in</p>}>
						{userData => (
							<>
								<div class="profile-row">
									<span class="profile-row__label">Username</span>
									<span class="profile-row__value">{userData.username}</span>
								</div>
								<div class="profile-row">
									<span class="profile-row__label">Email</span>
									<span class="profile-row__value">{userData.email ?? "Not set"}</span>
								</div>
								<div class="profile-row">
									<span class="profile-row__label">User ID</span>
									<span class="profile-row__value mono text-sm">{userData.id}</span>
								</div>
								<div class="profile-row">
									<span class="profile-row__label">Created</span>
									<span class="profile-row__value">{formatDate(userData.created_at)}</span>
								</div>
								<div class="profile-note">
									<p class="text-sm muted">Profile is managed by DevPad.</p>
									<a href="https://devpad.tools/settings" target="_blank" rel="noopener noreferrer" class="text-sm">
										Go to DevPad Settings →
									</a>
								</div>
							</>
						)}
					</Show>
				</div>
			</section>

			<section class="settings-section">
				<h3 class="settings-section__title">Integrations</h3>
				<div class="settings-section__content">
					<For each={integrations}>
						{integration => (
							<div class="integration-row">
								<span class="integration-row__name">{integration.name}</span>
								<Show
									when={integration.connected}
									fallback={
										<>
											<span class="integration-row__status muted">Not connected</span>
											<Button variant="secondary" onClick={() => handleIntegrationClick(integration)}>
												Connect
											</Button>
										</>
									}
								>
									<span class="integration-row__status">
										<span class="integration-connected">✓</span> @{integration.username}
									</span>
									<Button variant="secondary" onClick={() => handleIntegrationClick(integration)}>
										Disconnect
									</Button>
								</Show>
							</div>
						)}
					</For>
				</div>
			</section>

			<section class="settings-section">
				<h3 class="settings-section__title">DevPad Integration</h3>
				<div class="settings-section__content">
					<DevpadConnection />
				</div>
			</section>

			<section class="settings-section">
				<h3 class="settings-section__title">API Tokens</h3>
				<div class="settings-section__content">
					<Show when={tokensError()}>
						<div class="form-error">
							<p class="text-sm">{tokensError()}</p>
						</div>
					</Show>

					<Show when={tokensLoading()}>
						<p class="muted text-sm">Loading tokens...</p>
					</Show>

					<Show when={tokens()} keyed>
						{tokenList => <TokenList tokens={tokenList} onToggle={handleToggle} onDelete={handleDelete} />}
					</Show>

					<div class="settings-section__actions">
						<Button variant="primary" onClick={() => setShowModal(true)}>
							+ Create Token
						</Button>
					</div>
				</div>
			</section>

			<TokenForm isOpen={showModal()} onSubmit={handleCreate} onClose={() => setShowModal(false)} />
		</div>
	);
};

export default SettingsPage;
