import type { Context, Input } from "hono";
import type { AppContext, User } from "@blog/schema";

type BaseVariables = {
	user?: User;
	appContext: AppContext;
};

type BaseEnv = {
	Variables: BaseVariables & Record<string, unknown>;
};

type AuthenticatedHandler<E extends BaseEnv, P extends string, I extends Input, T> = (c: Context<E, P, I>, user: User, ctx: AppContext) => Promise<T>;

export const withAuth =
	<E extends BaseEnv, P extends string, I extends Input, T>(handler: AuthenticatedHandler<E, P, I, T>) =>
	async (c: Context<E, P, I>): Promise<T | Response> => {
		const user = c.get("user");
		if (!user) {
			return c.json({ code: "UNAUTHORIZED", message: "Authentication required" }, 401);
		}
		return handler(c, user, c.get("appContext"));
	};
