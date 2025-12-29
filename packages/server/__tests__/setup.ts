import { createHash } from "crypto";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type VersionData = {
  hash: string;
  content: string;
  parent?: string;
  createdAt: Date;
};

export type VersionInfo = {
  hash: string;
  parent?: string;
  createdAt: Date;
};

export interface CorpusBackend {
  put(path: string, content: string, options?: { parent?: string }): Promise<{ hash: string }>;
  get(path: string, hash: string): Promise<string | null>;
  listVersions(path: string): Promise<VersionInfo[]>;
}

export type TestUser = {
  id: number;
  github_id: number;
  username: string;
  email: string;
  avatar_url: string;
};

// -----------------------------------------------------------------------------
// MemoryCorpusBackend - In-memory version control for tests
// -----------------------------------------------------------------------------

const computeHash = (content: string): string => {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
};

export class MemoryCorpusBackend implements CorpusBackend {
  private store = new Map<string, Map<string, VersionData>>();

  async put(
    path: string,
    content: string,
    options?: { parent?: string }
  ): Promise<{ hash: string }> {
    const hash = computeHash(content);
    const pathStore = this.store.get(path) ?? new Map<string, VersionData>();
    
    pathStore.set(hash, {
      hash,
      content,
      parent: options?.parent,
      createdAt: new Date(),
    });
    
    this.store.set(path, pathStore);
    return { hash };
  }

  async get(path: string, hash: string): Promise<string | null> {
    const pathStore = this.store.get(path);
    if (!pathStore) return null;
    
    const version = pathStore.get(hash);
    return version?.content ?? null;
  }

  async listVersions(path: string): Promise<VersionInfo[]> {
    const pathStore = this.store.get(path);
    if (!pathStore) return [];
    
    return Array.from(pathStore.values())
      .map(({ hash, parent, createdAt }) => ({ hash, parent, createdAt }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  clear(): void {
    this.store.clear();
  }
}

// -----------------------------------------------------------------------------
// Mock providers
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// Test helpers
// -----------------------------------------------------------------------------

export const generateId = (): string => crypto.randomUUID();

export const seedTestUser = (): TestUser => ({
  id: 1,
  github_id: 12345,
  username: "test-user",
  email: "test@example.com",
  avatar_url: "https://github.com/ghost.png",
});
