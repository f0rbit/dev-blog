import { z } from 'zod'

export const PostContentSchema = z.object({
  title: z.string().min(1),
  content: z.string(),
  description: z.string().optional(),
  format: z.enum(['md', 'adoc']),
})

export type PostContent = z.infer<typeof PostContentSchema>

export const VersionInfoSchema = z.object({
  hash: z.string(),
  parent: z.string().nullable(),
  created_at: z.coerce.date(),
})

export type VersionInfo = z.infer<typeof VersionInfoSchema>

export type PutOptions = {
  parent?: string
}

export type PutResult = {
  hash: string
}

export type Ok<T> = { ok: true; value: T }
export type Err<E> = { ok: false; error: E }
export type Result<T, E = Error> = Ok<T> | Err<E>

const ok = <T>(value: T): Ok<T> => ({ ok: true, value })
const err = <E>(error: E): Err<E> => ({ ok: false, error })

export const Result = { ok, err }

export type CorpusError =
  | { type: 'not_found'; path: string; version?: string }
  | { type: 'invalid_content'; message: string }
  | { type: 'io_error'; message: string }

export interface CorpusBackend {
  put(path: string, content: string, options?: PutOptions): Promise<Result<PutResult, CorpusError>>
  get(path: string, version?: string): Promise<Result<string, CorpusError>>
  listVersions(path: string): Promise<Result<VersionInfo[], CorpusError>>
  delete(path: string): Promise<Result<void, CorpusError>>
}

export const corpusPath = (userId: number, postUuid: string): string =>
  `posts/${userId}/${postUuid}`

export const parsePostContent = (raw: string): Result<PostContent, CorpusError> => {
  const parsed = PostContentSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) {
    return Result.err({ type: 'invalid_content', message: parsed.error.message })
  }
  return Result.ok(parsed.data)
}

export const serializePostContent = (content: PostContent): string =>
  JSON.stringify(content)
