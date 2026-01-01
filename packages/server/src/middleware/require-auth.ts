import type { Context } from "hono";
import type { AppContext, User } from "@blog/schema";

type AuthenticatedHandler<T> = (c: Context, user: User, ctx: AppContext) => Promise<T>;

export const withAuth =
	<T>(handler: AuthenticatedHandler<T>) =>
	async (c: Context): Promise<T | Response> => {
		const user = c.get("user") as User | undefined;
		if (!user) {
			return c.json({ code: "UNAUTHORIZED", message: "Authentication required" }, 401);
		}
		return handler(c, user, c.get("appContext") as AppContext);
	};
