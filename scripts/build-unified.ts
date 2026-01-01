import { $ } from "bun";
import { cpSync, mkdirSync, writeFileSync, existsSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT_DIR = process.cwd();
const DIST_DIR = join(ROOT_DIR, "dist");
const WEBSITE_DIR = join(ROOT_DIR, "apps/website");
const WEBSITE_DIST = join(WEBSITE_DIR, "dist");

async function build() {
	console.log("🔨 Building unified worker...\n");

	// Clean dist directory
	if (existsSync(DIST_DIR)) {
		console.log("🧹 Cleaning dist directory...");
		rmSync(DIST_DIR, { recursive: true });
	}
	mkdirSync(DIST_DIR, { recursive: true });

	// Step 1: Build Astro
	console.log("📦 Building Astro SSR...");
	await $`bun run --filter '@blog/website' build`;

	// Step 2: Copy Astro's client assets to dist/client
	console.log("📁 Copying client assets...");
	cpSync(join(WEBSITE_DIST, "client"), join(DIST_DIR, "client"), { recursive: true });

	// Step 3: Copy Astro's worker and rename it
	console.log("📁 Copying Astro worker...");
	cpSync(join(WEBSITE_DIST, "_worker.js"), join(DIST_DIR, "_astro-worker.js"));

	// Also copy the worker's directory if it exists (for chunks)
	const workerDir = join(WEBSITE_DIST, "_worker.js");
	if (existsSync(workerDir) && statSync(workerDir).isDirectory()) {
		cpSync(workerDir, join(DIST_DIR, "_astro-worker.js"), { recursive: true });
	}

	// Step 4: Generate the unified worker entry point
	console.log("🔧 Generating unified worker entry...");

	const workerEntry = `
// Unified worker entry point
// This wraps Astro's SSR handler with Hono API routes

import { createUnifiedApp } from "./server/worker.js";
import astroHandler from "./_astro-worker.js";

export default {
  async fetch(request, env, ctx) {
    const app = createUnifiedApp(env, { fetch: astroHandler.fetch });
    return app.fetch(request, env, ctx);
  }
};
`;

	writeFileSync(join(DIST_DIR, "_worker.js"), workerEntry.trim());

	// Step 5: Bundle the server package
	console.log("📦 Bundling server package...");
	await $`bun build packages/server/src/worker.ts --outdir dist/server --target browser --format esm`;

	console.log("\n✅ Build complete!");
	console.log("   Worker entry: dist/_worker.js");
	console.log("   Server code:  dist/server/");
	console.log("   Client assets: dist/client/");
	console.log("\n🚀 Deploy with: bunx wrangler deploy");
}

build().catch(error => {
	console.error("❌ Build failed:", error);
	process.exit(1);
});
