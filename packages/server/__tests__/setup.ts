import { create_corpus, create_memory_backend, postsStoreDefinition, type PostsCorpus } from "@blog/schema";

export type TestUser = {
	id: number;
	github_id: number;
	username: string;
	email: string;
	avatar_url: string;
};

export const createTestCorpus = (): PostsCorpus => {
	const backend = create_memory_backend();
	return create_corpus()
		.with_backend(backend)
		.with_store(postsStoreDefinition)
		.build() as PostsCorpus;
};

export type DevToArticle = {
	id: number;
	title: string;
	description: string;
	url: string;
	published_at: string;
	tag_list: string[];
};

export class MockDevToProvider {
	private articles: DevToArticle[] = [];

	setArticles(articles: DevToArticle[]): void {
		this.articles = articles;
	}

	async fetchArticles(_token: string): Promise<DevToArticle[]> {
		return this.articles;
	}
}

export type DevpadProject = {
	id: string;
	name: string;
	description: string;
	url: string;
	createdAt: string;
	updatedAt: string;
};

export class MockDevpadProvider {
	private projects: DevpadProject[] = [];

	setProjects(projects: DevpadProject[]): void {
		this.projects = projects;
	}

	async fetchProjects(_token: string): Promise<DevpadProject[]> {
		return this.projects;
	}
}

export const generateId = (): string => crypto.randomUUID();

export const seedTestUser = (): TestUser => ({
	id: 1,
	github_id: 12345,
	username: "test-user",
	email: "test@example.com",
	avatar_url: "https://github.com/ghost.png",
});
