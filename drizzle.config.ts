import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: "./packages/schema/src/database.ts",
	out: "./migrations",
	dialect: "sqlite",
	dbCredentials: {
		url: "./local/sqlite.db",
	},
	verbose: true,
	strict: true,
});
