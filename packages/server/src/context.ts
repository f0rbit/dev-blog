import {
	type AppContext,
	type Bindings,
	type DrizzleDB,
	create_cloudflare_backend,
	create_corpus,
	postsStoreDefinition,
} from "@blog/schema";
import { drizzle } from "drizzle-orm/d1";

export const createContextFromBindings = (env: Bindings): AppContext => {
	const backend = create_cloudflare_backend({
		d1: env.DB,
		r2: env.CORPUS_BUCKET as unknown as Parameters<typeof create_cloudflare_backend>[0]["r2"],
	});

	const corpus = create_corpus()
		.with_backend(backend)
		.with_store(postsStoreDefinition)
		.build();

	return {
		db: drizzle(env.DB) as DrizzleDB,
		corpus,
		devpadApi: env.DEVPAD_API,
		environment: env.ENVIRONMENT,
	};
};
