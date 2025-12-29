import { drizzle, DrizzleD1Database } from 'drizzle-orm/d1'
import { and, eq, lte, isNull, inArray, desc, sql } from 'drizzle-orm'
import {
  posts,
  tags,
  categories,
  type PostRow,
  type Result,
  type Post,
  type PostContent,
  type PostCreate,
  type PostUpdate,
  type PostListParams,
  type PostsResponse,
  type VersionInfo,
  type CorpusError,
  ok,
  err,
} from '@blog/schema'
import {
  corpusPath,
  putContent,
  getContent,
  listVersions as corpusListVersions,
  deleteContent,
} from '../corpus/posts'

type PostServiceError =
  | { type: 'not_found'; resource: string }
  | { type: 'slug_conflict'; slug: string }
  | { type: 'corpus_error'; inner: CorpusError }
  | { type: 'db_error'; message: string }

type Deps = {
  db: D1Database
  corpus: R2Bucket
}

const toPostServiceError = (e: CorpusError): PostServiceError => ({
  type: 'corpus_error',
  inner: e,
})

const getCategoryWithDescendants = async (
  db: DrizzleD1Database,
  userId: number,
  categoryName: string
): Promise<string[]> => {
  const allCategories = await db
    .select()
    .from(categories)
    .where(eq(categories.owner_id, userId))

  const collectDescendants = (name: string): string[] => {
    const children = allCategories
      .filter(c => c.parent === name)
      .map(c => c.name)

    return [name, ...children.flatMap(collectDescendants)]
  }

  return collectDescendants(categoryName)
}

const fetchTagsForPosts = async (
  db: DrizzleD1Database,
  postIds: number[]
): Promise<Map<number, string[]>> => {
  if (postIds.length === 0) return new Map()

  const tagRows = await db
    .select()
    .from(tags)
    .where(inArray(tags.post_id, postIds))

  return tagRows.reduce((acc, row) => {
    const existing = acc.get(row.post_id) ?? []
    acc.set(row.post_id, [...existing, row.tag])
    return acc
  }, new Map<number, string[]>())
}

const syncTags = async (
  db: DrizzleD1Database,
  postId: number,
  tagNames: string[]
): Promise<void> => {
  await db.delete(tags).where(eq(tags.post_id, postId))

  if (tagNames.length === 0) return

  const tagInserts = tagNames.map(tag => ({ post_id: postId, tag }))
  await db.insert(tags).values(tagInserts)
}

const assemblePost = (
  row: PostRow,
  content: PostContent,
  tagList: string[]
): Post => ({
  id: row.id,
  uuid: row.uuid,
  author_id: row.author_id,
  slug: row.slug,
  title: content.title,
  content: content.content,
  description: content.description,
  format: content.format,
  category: row.category,
  tags: tagList,
  archived: row.archived,
  publish_at: row.publish_at,
  created_at: row.created_at,
  updated_at: row.updated_at,
  project_id: row.project_id,
  corpus_version: row.corpus_version,
})

export const createPostService = ({ db, corpus }: Deps) => {
  const drizzleDb = drizzle(db)

  const create = async (
    userId: number,
    input: PostCreate
  ): Promise<Result<Post, PostServiceError>> => {
    const existingSlug = await drizzleDb
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.author_id, userId), eq(posts.slug, input.slug)))
      .limit(1)

    if (existingSlug.length > 0) {
      return err({ type: 'slug_conflict', slug: input.slug })
    }

    const uuid = crypto.randomUUID()
    const path = corpusPath(userId, uuid)
    const content: PostContent = {
      title: input.title,
      content: input.content,
      description: input.description,
      format: input.format ?? 'md',
    }

    const corpusResult = await putContent(corpus, path, content)
    if (!corpusResult.ok) {
      return err(toPostServiceError(corpusResult.error))
    }

    const now = new Date()
    const publishAt = input.publish_at === undefined ? null : input.publish_at

    try {
      const inserted = await drizzleDb
        .insert(posts)
        .values({
          uuid,
          author_id: userId,
          slug: input.slug,
          corpus_version: corpusResult.value.hash,
          category: input.category ?? 'root',
          archived: false,
          publish_at: publishAt,
          created_at: now,
          updated_at: now,
          project_id: input.project_id ?? null,
        })
        .returning()

      const row = inserted[0]
      if (!row) {
        return err({ type: 'db_error', message: 'Insert returned no rows' })
      }

      await syncTags(drizzleDb, row.id, input.tags ?? [])

      return ok(assemblePost(row, content, input.tags ?? []))
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown database error'
      return err({ type: 'db_error', message })
    }
  }

  const update = async (
    userId: number,
    uuid: string,
    input: PostUpdate
  ): Promise<Result<Post, PostServiceError>> => {
    const existing = await drizzleDb
      .select()
      .from(posts)
      .where(and(eq(posts.author_id, userId), eq(posts.uuid, uuid)))
      .limit(1)

    if (existing.length === 0) {
      return err({ type: 'not_found', resource: `post:${uuid}` })
    }

    const row = existing[0]
    if (!row) {
      return err({ type: 'not_found', resource: `post:${uuid}` })
    }

    if (input.slug && input.slug !== row.slug) {
      const slugCheck = await drizzleDb
        .select({ id: posts.id })
        .from(posts)
        .where(and(eq(posts.author_id, userId), eq(posts.slug, input.slug)))
        .limit(1)

      if (slugCheck.length > 0) {
        return err({ type: 'slug_conflict', slug: input.slug })
      }
    }

    const path = corpusPath(userId, uuid)
    const currentVersion = row.corpus_version

    let newVersion = currentVersion
    let currentContent: PostContent | null = null

    const hasContentChange = input.title !== undefined ||
      input.content !== undefined ||
      input.description !== undefined ||
      input.format !== undefined

    if (hasContentChange && currentVersion) {
      const contentResult = await getContent(corpus, path, currentVersion)
      if (!contentResult.ok) {
        return err(toPostServiceError(contentResult.error))
      }
      currentContent = contentResult.value

      const updatedContent: PostContent = {
        title: input.title ?? currentContent.title,
        content: input.content ?? currentContent.content,
        description: input.description ?? currentContent.description,
        format: input.format ?? currentContent.format,
      }

      const corpusResult = await putContent(corpus, path, updatedContent, currentVersion)
      if (!corpusResult.ok) {
        return err(toPostServiceError(corpusResult.error))
      }

      newVersion = corpusResult.value.hash
      currentContent = updatedContent
    } else if (currentVersion) {
      const contentResult = await getContent(corpus, path, currentVersion)
      if (!contentResult.ok) {
        return err(toPostServiceError(contentResult.error))
      }
      currentContent = contentResult.value
    }

    const now = new Date()

    type PostUpdateFields = Partial<{
      slug: string
      corpus_version: string | null
      category: string
      archived: boolean
      publish_at: Date | null
      updated_at: Date
      project_id: string | null
    }>

    const updates: PostUpdateFields = { updated_at: now }

    if (input.slug !== undefined) updates.slug = input.slug
    if (input.category !== undefined) updates.category = input.category
    if (input.archived !== undefined) updates.archived = input.archived
    if (input.publish_at !== undefined) updates.publish_at = input.publish_at
    if (input.project_id !== undefined) updates.project_id = input.project_id
    if (newVersion !== currentVersion) updates.corpus_version = newVersion

    try {
      const updated = await drizzleDb
        .update(posts)
        .set(updates)
        .where(eq(posts.id, row.id))
        .returning()

      const updatedRow = updated[0]
      if (!updatedRow) {
        return err({ type: 'db_error', message: 'Update returned no rows' })
      }

      if (input.tags !== undefined) {
        await syncTags(drizzleDb, updatedRow.id, input.tags)
      }

      const finalTags = input.tags ?? (
        await fetchTagsForPosts(drizzleDb, [updatedRow.id])
      ).get(updatedRow.id) ?? []

      if (!currentContent) {
        return err({ type: 'not_found', resource: `post:${uuid}` })
      }

      return ok(assemblePost(updatedRow, currentContent, finalTags))
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown database error'
      return err({ type: 'db_error', message })
    }
  }

  const getBySlug = async (
    userId: number,
    slug: string
  ): Promise<Result<Post, PostServiceError>> => {
    const rows = await drizzleDb
      .select()
      .from(posts)
      .where(and(eq(posts.author_id, userId), eq(posts.slug, slug)))
      .limit(1)

    const row = rows[0]
    if (!row) {
      return err({ type: 'not_found', resource: `post:slug:${slug}` })
    }

    return assemblePostFromRow(userId, row)
  }

  const getByUuid = async (
    userId: number,
    uuid: string
  ): Promise<Result<Post, PostServiceError>> => {
    const rows = await drizzleDb
      .select()
      .from(posts)
      .where(and(eq(posts.author_id, userId), eq(posts.uuid, uuid)))
      .limit(1)

    const row = rows[0]
    if (!row) {
      return err({ type: 'not_found', resource: `post:${uuid}` })
    }

    return assemblePostFromRow(userId, row)
  }

  const assemblePostFromRow = async (
    userId: number,
    row: PostRow
  ): Promise<Result<Post, PostServiceError>> => {
    if (!row.corpus_version) {
      return err({ type: 'not_found', resource: `post:${row.uuid}:content` })
    }

    const path = corpusPath(userId, row.uuid)
    const contentResult = await getContent(corpus, path, row.corpus_version)

    if (!contentResult.ok) {
      return err(toPostServiceError(contentResult.error))
    }

    const tagsMap = await fetchTagsForPosts(drizzleDb, [row.id])
    const tagList = tagsMap.get(row.id) ?? []

    return ok(assemblePost(row, contentResult.value, tagList))
  }

  const list = async (
    userId: number,
    params: PostListParams
  ): Promise<Result<PostsResponse, PostServiceError>> => {
    const conditions = [eq(posts.author_id, userId)]

    if (params.category) {
      const categoryNames = await getCategoryWithDescendants(drizzleDb, userId, params.category)
      conditions.push(inArray(posts.category, categoryNames))
    }

    if (params.project) {
      conditions.push(eq(posts.project_id, params.project))
    }

    if (!params.archived) {
      conditions.push(eq(posts.archived, false))
    }

    const now = new Date()
    if (params.status === 'published') {
      conditions.push(lte(posts.publish_at, now))
    } else if (params.status === 'scheduled') {
      conditions.push(
        and(
          sql`${posts.publish_at} IS NOT NULL`,
          sql`${posts.publish_at} > ${now}`
        )!
      )
    } else if (params.status === 'draft') {
      conditions.push(isNull(posts.publish_at))
    }

    const whereClause = and(...conditions)

    const sortColumn = params.sort === 'created'
      ? posts.created_at
      : params.sort === 'published'
        ? posts.publish_at
        : posts.updated_at

    const orderBy = desc(sortColumn)

    try {
      const countResult = await drizzleDb
        .select({ count: sql<number>`count(*)` })
        .from(posts)
        .where(whereClause)

      const totalPosts = Number(countResult[0]?.count ?? 0)

      const rows = await drizzleDb
        .select()
        .from(posts)
        .where(whereClause)
        .orderBy(orderBy)
        .limit(params.limit)
        .offset(params.offset)

      if (params.tag) {
        const taggedPostIds = await drizzleDb
          .select({ post_id: tags.post_id })
          .from(tags)
          .where(eq(tags.tag, params.tag))

        const taggedIds = new Set(taggedPostIds.map(t => t.post_id))
        const filteredRows = rows.filter(r => taggedIds.has(r.id))

        return assemblePostsResponse(userId, filteredRows, totalPosts, params)
      }

      return assemblePostsResponse(userId, rows, totalPosts, params)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown database error'
      return err({ type: 'db_error', message })
    }
  }

  const assemblePostsResponse = async (
    userId: number,
    rows: PostRow[],
    totalPosts: number,
    params: PostListParams
  ): Promise<Result<PostsResponse, PostServiceError>> => {
    const postIds = rows.map(r => r.id)
    const tagsMap = await fetchTagsForPosts(drizzleDb, postIds)

    const postsWithContent: Post[] = []

    for (const row of rows) {
      if (!row.corpus_version) continue

      const path = corpusPath(userId, row.uuid)
      const contentResult = await getContent(corpus, path, row.corpus_version)

      if (!contentResult.ok) continue

      const tagList = tagsMap.get(row.id) ?? []
      postsWithContent.push(assemblePost(row, contentResult.value, tagList))
    }

    const totalPages = Math.ceil(totalPosts / params.limit)
    const currentPage = Math.floor(params.offset / params.limit) + 1

    return ok({
      posts: postsWithContent,
      total_posts: totalPosts,
      total_pages: totalPages,
      per_page: params.limit,
      current_page: currentPage,
    })
  }

  const remove = async (
    userId: number,
    uuid: string
  ): Promise<Result<void, PostServiceError>> => {
    const existing = await drizzleDb
      .select()
      .from(posts)
      .where(and(eq(posts.author_id, userId), eq(posts.uuid, uuid)))
      .limit(1)

    const row = existing[0]
    if (!row) {
      return err({ type: 'not_found', resource: `post:${uuid}` })
    }

    const path = corpusPath(userId, uuid)

    const corpusResult = await deleteContent(corpus, path)
    if (!corpusResult.ok) {
      return err(toPostServiceError(corpusResult.error))
    }

    try {
      await drizzleDb.delete(tags).where(eq(tags.post_id, row.id))
      await drizzleDb.delete(posts).where(eq(posts.id, row.id))

      return ok(undefined)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown database error'
      return err({ type: 'db_error', message })
    }
  }

  const listVersions = async (
    userId: number,
    uuid: string
  ): Promise<Result<VersionInfo[], PostServiceError>> => {
    const existing = await drizzleDb
      .select()
      .from(posts)
      .where(and(eq(posts.author_id, userId), eq(posts.uuid, uuid)))
      .limit(1)

    if (existing.length === 0) {
      return err({ type: 'not_found', resource: `post:${uuid}` })
    }

    const path = corpusPath(userId, uuid)
    const versionsResult = await corpusListVersions(corpus, path)

    if (!versionsResult.ok) {
      return err(toPostServiceError(versionsResult.error))
    }

    return ok(versionsResult.value)
  }

  const getVersion = async (
    userId: number,
    uuid: string,
    hash: string
  ): Promise<Result<PostContent, PostServiceError>> => {
    const existing = await drizzleDb
      .select()
      .from(posts)
      .where(and(eq(posts.author_id, userId), eq(posts.uuid, uuid)))
      .limit(1)

    if (existing.length === 0) {
      return err({ type: 'not_found', resource: `post:${uuid}` })
    }

    const path = corpusPath(userId, uuid)
    const contentResult = await getContent(corpus, path, hash)

    if (!contentResult.ok) {
      return err(toPostServiceError(contentResult.error))
    }

    return ok(contentResult.value)
  }

  const restoreVersion = async (
    userId: number,
    uuid: string,
    hash: string
  ): Promise<Result<Post, PostServiceError>> => {
    const existing = await drizzleDb
      .select()
      .from(posts)
      .where(and(eq(posts.author_id, userId), eq(posts.uuid, uuid)))
      .limit(1)

    const row = existing[0]
    if (!row) {
      return err({ type: 'not_found', resource: `post:${uuid}` })
    }

    const path = corpusPath(userId, uuid)
    const contentResult = await getContent(corpus, path, hash)

    if (!contentResult.ok) {
      return err(toPostServiceError(contentResult.error))
    }

    const restoredContent = contentResult.value
    const currentVersion = row.corpus_version

    const corpusResult = await putContent(corpus, path, restoredContent, currentVersion ?? undefined)
    if (!corpusResult.ok) {
      return err(toPostServiceError(corpusResult.error))
    }

    const now = new Date()

    try {
      const updated = await drizzleDb
        .update(posts)
        .set({
          corpus_version: corpusResult.value.hash,
          updated_at: now,
        })
        .where(eq(posts.id, row.id))
        .returning()

      const updatedRow = updated[0]
      if (!updatedRow) {
        return err({ type: 'db_error', message: 'Update returned no rows' })
      }

      const tagsMap = await fetchTagsForPosts(drizzleDb, [updatedRow.id])
      const tagList = tagsMap.get(updatedRow.id) ?? []

      return ok(assemblePost(updatedRow, restoredContent, tagList))
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown database error'
      return err({ type: 'db_error', message })
    }
  }

  return {
    create,
    update,
    getBySlug,
    getByUuid,
    list,
    delete: remove,
    listVersions,
    getVersion,
    restoreVersion,
  }
}

export type PostService = ReturnType<typeof createPostService>
