import { type AppContext, type Bindings, type DrizzleDB, create_cloudflare_backend, create_corpus, postsStoreDefinition, projectsCacheStoreDefinition } from "@blog/schema";
import { drizzle } from "drizzle-orm/d1";

export const createContextFromBindings = (env: Bindings): AppContext => {
	console.log(`[CONTEXT] Creating context. CORPUS_BUCKET=${!!env.CORPUS_BUCKET} DB=${!!env.DB} DEVPAD_API=${env.DEVPAD_API} ENV=${env.ENVIRONMENT}`);

	const backend = create_cloudflare_backend({
		d1: env.DB,
		r2: env.CORPUS_BUCKET as unknown as Parameters<typeof create_cloudflare_backend>[0]["r2"],
	});

	console.log(`[CONTEXT] Backend created. metadata=${typeof backend.metadata} data=${typeof backend.data}`);

	const corpus = create_corpus().with_backend(backend).with_store(postsStoreDefinition).with_store(projectsCacheStoreDefinition).build();

	console.log(`[CONTEXT] Corpus built. metadata=${typeof corpus.metadata} data=${typeof corpus.data}`);

	return {
		db: drizzle(env.DB) as DrizzleDB,
		corpus,
		devpadApi: env.DEVPAD_API,
		environment: env.ENVIRONMENT,
	};
};
