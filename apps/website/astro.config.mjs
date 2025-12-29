import { resolve } from "node:path";
import cloudflare from "@astrojs/cloudflare";
import solidJs from "@astrojs/solid-js";
import { defineConfig } from "astro/config";

export default defineConfig({
	integrations: [solidJs()],
	adapter: cloudflare({
		platformProxy: {
			enabled: true,
		},
	}),
	output: "server",
	vite: {
		resolve: {
			alias: {
				"@blog/api": resolve("../../packages/api/src/index.ts"),
				"@blog/schema": resolve("../../packages/schema/src/index.ts"),
			},
		},
	},
});
