import { Show, createSignal } from "solid-js";

type User = {
	id: number;
	username: string;
	avatar_url: string | null;
};

interface Props {
	initialUser?: User | null;
	initialAuthenticated?: boolean;
}

const AuthStatus = (props: Props) => {
	const [user, setUser] = createSignal<User | null>(props.initialUser ?? null);

	return (
		<div class="user-info">
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
		</div>
	);
};

export default AuthStatus;
