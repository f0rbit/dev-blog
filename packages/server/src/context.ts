import type { AppContext, Bindings, DrizzleDB } from "@blog/schema";
import { drizzle } from "drizzle-orm/d1";

export const createContextFromBindings = (env: Bindings): AppContext => ({
	db: drizzle(env.DB) as DrizzleDB,
	corpus: env.CORPUS,
	devpadApi: env.DEVPAD_API,
	environment: env.ENVIRONMENT,
});
