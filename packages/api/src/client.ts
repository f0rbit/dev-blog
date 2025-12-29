import {
  type Result,
  type ApiError,
  type Post,
  type PostsResponse,
  type PaginatedResponse,
  type Tag,
  type PostCreate,
  type PostUpdate,
  type PostListParams,
  ok,
  err,
} from "@blog/schema";

// Asset type for file uploads (to be added to schema if needed)
type Asset = {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  post_id?: string | null;
  created_at: Date;
};

export type ClientConfig = {
  baseUrl: string;
  headers?: Record<string, string>;
};

type FetchResult<T> = Result<T, ApiError>;

const request = async <T>(
  config: ClientConfig,
  path: string,
  options: RequestInit = {}
): Promise<FetchResult<T>> => {
  const url = `${config.baseUrl}${path}`;
  const headers = {
    "Content-Type": "application/json",
    ...config.headers,
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({
      code: "UNKNOWN",
      message: response.statusText,
    }))) as ApiError;
    return err(error);
  }

  const data = (await response.json()) as T;
  return ok(data);
};

const buildQueryString = (params: Record<string, unknown>): string => {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return entries.length > 0 ? `?${entries.join("&")}` : "";
};

export type BlogClient = ReturnType<typeof createClient>;

export const createClient = (config: ClientConfig) => ({
  posts: {
    list: (query?: Partial<PostListParams>): Promise<FetchResult<PostsResponse>> =>
      request(config, `/api/posts${buildQueryString(query ?? {})}`),

    get: (uuid: string): Promise<FetchResult<Post>> =>
      request(config, `/api/post/${uuid}`),

    getBySlug: (slug: string): Promise<FetchResult<Post>> =>
      request(config, `/api/post/${slug}`),

    create: (data: PostCreate): Promise<FetchResult<Post>> =>
      request(config, "/api/post", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    update: (uuid: string, data: PostUpdate): Promise<FetchResult<Post>> =>
      request(config, `/api/post/${uuid}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),

    delete: (uuid: string): Promise<FetchResult<void>> =>
      request(config, `/api/post/${uuid}`, { method: "DELETE" }),

    listVersions: (uuid: string): Promise<FetchResult<{ versions: { hash: string; parent: string | null; created_at: string }[] }>> =>
      request(config, `/api/post/${uuid}/versions`),

    getVersion: (uuid: string, hash: string): Promise<FetchResult<{ title: string; content: string; description?: string; format: 'md' | 'adoc' }>> =>
      request(config, `/api/post/${uuid}/version/${hash}`),

    restoreVersion: (uuid: string, hash: string): Promise<FetchResult<Post>> =>
      request(config, `/api/post/${uuid}/restore/${hash}`, { method: "POST" }),
  },

  tags: {
    list: (): Promise<FetchResult<{ tags: { tag: string; count: number }[] }>> =>
      request(config, "/api/tags"),

    getForPost: (uuid: string): Promise<FetchResult<{ tags: string[] }>> =>
      request(config, `/api/posts/${uuid}/tags`),

    setForPost: (uuid: string, tags: string[]): Promise<FetchResult<{ tags: string[] }>> =>
      request(config, `/api/posts/${uuid}/tags`, {
        method: "PUT",
        body: JSON.stringify({ tags }),
      }),

    addToPost: (uuid: string, tags: string[]): Promise<FetchResult<{ tags: string[] }>> =>
      request(config, `/api/posts/${uuid}/tags`, {
        method: "POST",
        body: JSON.stringify({ tags }),
      }),

    removeFromPost: (uuid: string, tag: string): Promise<FetchResult<void>> =>
      request(config, `/api/posts/${uuid}/tags/${tag}`, { method: "DELETE" }),
  },

  assets: {
    list: (): Promise<FetchResult<{ items: Asset[] }>> =>
      request(config, "/api/assets"),

    get: (id: string): Promise<FetchResult<Asset>> =>
      request(config, `/api/assets/${id}`),

    upload: async (
      file: Blob,
      filename: string,
      postId?: string
    ): Promise<FetchResult<Asset>> => {
      const url = `${config.baseUrl}/api/assets${buildQueryString({ filename, postId })}`;
      const headers: Record<string, string> = {
        "Content-Type": file.type || "application/octet-stream",
        ...config.headers,
      };

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: file,
      });

      if (!response.ok) {
        const error = (await response.json().catch(() => ({
          code: "UNKNOWN",
          message: response.statusText,
        }))) as ApiError;
        return err(error);
      }

      const data = (await response.json()) as Asset;
      return ok(data);
    },

    downloadUrl: (id: string): string =>
      `${config.baseUrl}/api/assets/${id}/download`,

    delete: (id: string): Promise<FetchResult<{ success: boolean }>> =>
      request(config, `/api/assets/${id}`, { method: "DELETE" }),
  },

  health: {
    check: (): Promise<FetchResult<{ status: string; timestamp: string; environment: string }>> =>
      request(config, "/health"),
  },
});
