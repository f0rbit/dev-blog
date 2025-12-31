import { Show, createSignal, onMount } from "solid-js";
import { api } from "../../lib/api";
import { auth } from "../../lib/auth";

type User = {
	id: number;
	username: string;
	avatar_url: string | null;
};

const AuthStatus = () => {
	const [user, setUser] = createSignal<User | null>(null);
	const [loading, setLoading] = createSignal(true);

	onMount(async () => {
		try {
			const response = await api.fetch("/auth/status");
			if (response.ok) {
				const data = await response.json();
				if (data.authenticated) {
					setUser(data.user);
				}
			}
		} catch (e) {
			console.error("Failed to check auth status:", e);
		} finally {
			setLoading(false);
		}
	});

	return (
		<div class="user-info">
			<Show when={!loading()} fallback={<span class="loading">...</span>}>
				<Show
					when={user()}
					fallback={
						<a href="/auth/login" class="auth-btn login-btn">
							Login
						</a>
					}
				>
					{u => (
						<>
							<span class="username">{u().username}</span>
							<a href="/auth/logout" class="auth-btn logout-btn">
								Logout
							</a>
						</>
					)}
				</Show>
			</Show>
		</div>
	);
};

export default AuthStatus;
