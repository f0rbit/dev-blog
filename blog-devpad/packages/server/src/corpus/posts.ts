import {
  type PostContent,
  type VersionInfo,
  type CorpusError,
  type Result,
  PostContentSchema,
  ok,
  err,
} from '@blog/schema'

export const corpusPath = (userId: number, postUuid: string): string =>
  `posts/${userId}/${postUuid}`

const versionKey = (basePath: string, hash: string): string =>
  `${basePath}/v/${hash}.json`

const sha256 = async (content: string): Promise<string> => {
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

type R2Metadata = {
  parent?: string
  created_at: string
}

export const putContent = async (
  corpus: R2Bucket,
  path: string,
  content: PostContent,
  parent?: string
): Promise<Result<{ hash: string }, CorpusError>> => {
  const serialized = JSON.stringify(content)
  const hash = await sha256(serialized)
  const key = versionKey(path, hash)
  const now = new Date().toISOString()

  const metadata: R2Metadata = {
    created_at: now,
    ...(parent && { parent }),
  }

  try {
    await corpus.put(key, serialized, {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: metadata,
    })
    return ok({ hash })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown R2 error'
    return err({ type: 'io_error', message })
  }
}

export const getContent = async (
  corpus: R2Bucket,
  path: string,
  hash: string
): Promise<Result<PostContent, CorpusError>> => {
  const key = versionKey(path, hash)

  try {
    const object = await corpus.get(key)
    if (!object) {
      return err({ type: 'not_found', path, version: hash })
    }

    const raw = await object.text()
    const parsed = PostContentSchema.safeParse(JSON.parse(raw))

    if (!parsed.success) {
      return err({ type: 'invalid_content', message: parsed.error.message })
    }

    return ok(parsed.data)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown R2 error'
    return err({ type: 'io_error', message })
  }
}

export const listVersions = async (
  corpus: R2Bucket,
  path: string
): Promise<Result<VersionInfo[], CorpusError>> => {
  const prefix = `${path}/v/`

  try {
    const listed = await corpus.list({ prefix })

    const versions: VersionInfo[] = listed.objects
      .map(obj => {
        const hash = obj.key
          .replace(prefix, '')
          .replace('.json', '')

        const meta = obj.customMetadata ?? {}
        const parent = meta['parent'] ?? null
        const createdAtStr = meta['created_at']
        const created_at = createdAtStr
          ? new Date(createdAtStr)
          : obj.uploaded

        return { hash, parent, created_at }
      })
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())

    return ok(versions)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown R2 error'
    return err({ type: 'io_error', message })
  }
}

export const deleteContent = async (
  corpus: R2Bucket,
  path: string
): Promise<Result<void, CorpusError>> => {
  const prefix = `${path}/v/`

  try {
    const listed = await corpus.list({ prefix })
    const keys = listed.objects.map(obj => obj.key)

    if (keys.length > 0) {
      await corpus.delete(keys)
    }

    return ok(undefined)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown R2 error'
    return err({ type: 'io_error', message })
  }
}
