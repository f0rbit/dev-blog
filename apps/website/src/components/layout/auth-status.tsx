import type { Component } from "solid-js";

const AuthStatus: Component = () => {
	return (
		<div class="user-info">
			<a href="/auth/login" class="auth-btn login-btn">
				Login
			</a>
		</div>
	);
};

export default AuthStatus;
