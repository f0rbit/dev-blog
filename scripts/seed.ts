import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from '../packages/schema/src/database'
import { mkdir, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import type { PostContent } from '../packages/schema/src/corpus'

const LOCAL_DIR = './local'
const DB_PATH = `${LOCAL_DIR}/sqlite.db`
const CORPUS_PATH = `${LOCAL_DIR}/corpus`
const SCHEMA_PATH = './scripts/schema.sql'

type FileCorpusEntry = {
  content: PostContent
  parent: string | null
  created_at: string
}

const ensureDirectories = async (): Promise<void> => {
  await mkdir(LOCAL_DIR, { recursive: true })
  await mkdir(CORPUS_PATH, { recursive: true })
}

const readSchemaSQL = async (): Promise<string> => {
  const file = Bun.file(SCHEMA_PATH)
  return file.text()
}

const initDatabase = async (sqlite: ReturnType<typeof Database>): Promise<void> => {
  const schemaSql = await readSchemaSQL()
  sqlite.exec(schemaSql)
  console.log('✓ Database schema initialized')
}

const hashContent = (content: string): string => {
  const hash = Bun.hash(content)
  return hash.toString(16).padStart(16, '0')
}

const writeCorpusVersion = async (
  userId: number,
  postUuid: string,
  content: PostContent,
  parent: string | null = null
): Promise<string> => {
  const serialized = JSON.stringify(content)
  const hash = hashContent(serialized)
  const dirPath = `${CORPUS_PATH}/posts/${userId}/${postUuid}/v`
  const filePath = `${dirPath}/${hash}.json`

  await mkdir(dirPath, { recursive: true })

  const entry: FileCorpusEntry = {
    content,
    parent,
    created_at: new Date().toISOString(),
  }

  await Bun.write(filePath, JSON.stringify(entry, null, 2))

  return hash
}

const seedDevUser = async (
  db: ReturnType<typeof drizzle>
): Promise<typeof schema.users.$inferSelect> => {
  const now = new Date()

  await db
    .insert(schema.users)
    .values({
      github_id: 12345,
      username: 'dev-user',
      email: 'dev@local.test',
      avatar_url: 'https://github.com/ghost.png',
      created_at: now,
      updated_at: now,
    })
    .onConflictDoNothing()

  const [user] = await db.select().from(schema.users).limit(1)
  console.log(`✓ User seeded: ${user.username}`)
  return user
}

type CategorySeed = { name: string; parent: string | null }

const categorySeeds: CategorySeed[] = [
  { name: 'root', parent: null },
  { name: 'coding', parent: 'root' },
  { name: 'devlog', parent: 'coding' },
  { name: 'gamedev', parent: 'coding' },
  { name: 'learning', parent: 'root' },
  { name: 'hobbies', parent: 'root' },
  { name: 'story', parent: 'root' },
]

const seedCategories = async (
  db: ReturnType<typeof drizzle>,
  userId: number
): Promise<void> => {
  for (const cat of categorySeeds) {
    await db
      .insert(schema.categories)
      .values({
        owner_id: userId,
        name: cat.name,
        parent: cat.parent,
      })
      .onConflictDoNothing()
  }

  console.log(`✓ Categories seeded: ${categorySeeds.length} categories`)
}

type PostSeed = {
  slug: string
  category: string
  tags: string[]
  content: PostContent
  publishAt: Date | null
}

const postSeeds: PostSeed[] = [
  {
    slug: 'getting-started-with-bun',
    category: 'devlog',
    tags: ['bun', 'javascript', 'tutorial'],
    content: {
      title: 'Getting Started with Bun',
      content: `# Getting Started with Bun

Bun is a fast all-in-one JavaScript runtime. Here's why I'm excited about it.

## Installation

\`\`\`bash
curl -fsSL https://bun.sh/install | bash
\`\`\`

## Key Features

- **Speed**: Bun is incredibly fast
- **All-in-one**: Runtime, bundler, test runner, and package manager
- **TypeScript out of the box**: No config needed

## Conclusion

Give Bun a try for your next project!
`,
      description: 'A quick introduction to the Bun JavaScript runtime',
      format: 'md',
    },
    publishAt: new Date('2024-01-15'),
  },
  {
    slug: 'building-a-blog-api',
    category: 'devlog',
    tags: ['hono', 'cloudflare', 'typescript'],
    content: {
      title: 'Building a Blog API with Hono and Cloudflare',
      content: `# Building a Blog API

This is a draft post about building APIs with Hono.

## Why Hono?

- Lightweight and fast
- TypeScript-first
- Works great with Cloudflare Workers
`,
      description: 'How to build a modern API with Hono and Cloudflare Workers',
      format: 'md',
    },
    publishAt: null,
  },
  {
    slug: 'learning-rust-day-1',
    category: 'learning',
    tags: ['rust', 'learning'],
    content: {
      title: 'Learning Rust: Day 1',
      content: `# Day 1 of Learning Rust

Today I started learning Rust. Here are my notes.

## Ownership

The ownership system is unique to Rust...
`,
      description: 'My journey learning Rust programming',
      format: 'md',
    },
    publishAt: new Date(Date.now() + 86400000 * 7),
  },
]

const seedPosts = async (
  db: ReturnType<typeof drizzle>,
  userId: number
): Promise<void> => {
  const now = new Date()

  for (const seed of postSeeds) {
    const uuid = crypto.randomUUID()
    const hash = await writeCorpusVersion(userId, uuid, seed.content)

    const [post] = await db
      .insert(schema.posts)
      .values({
        uuid,
        author_id: userId,
        slug: seed.slug,
        corpus_version: hash,
        category: seed.category,
        archived: false,
        publish_at: seed.publishAt,
        created_at: now,
        updated_at: now,
      })
      .returning()

    for (const tag of seed.tags) {
      await db
        .insert(schema.tags)
        .values({
          post_id: post.id,
          tag,
        })
        .onConflictDoNothing()
    }
  }

  console.log(`✓ Posts seeded: ${postSeeds.length} posts`)
}

const seedAccessKey = async (
  db: ReturnType<typeof drizzle>,
  userId: number
): Promise<void> => {
  const devToken = 'dev-api-token-12345'
  const encoder = new TextEncoder()
  const data = encoder.encode(devToken)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const keyHash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  await db
    .insert(schema.accessKeys)
    .values({
      user_id: userId,
      key_hash: keyHash,
      name: 'Dev API Key',
      note: 'Local development token. Use "dev-api-token-12345" as Auth-Token header.',
      enabled: true,
      created_at: new Date(),
    })
    .onConflictDoNothing()

  console.log('✓ Access key seeded: dev-api-token-12345')
}

const main = async (): Promise<void> => {
  console.log('🌱 Seeding database...\n')

  await ensureDirectories()

  const isNewDatabase = !existsSync(DB_PATH)
  const sqlite = new Database(DB_PATH, { create: true })
  const db = drizzle(sqlite, { schema })

  if (isNewDatabase) {
    await initDatabase(sqlite)
  } else {
    console.log('✓ Database already exists, running migrations...')
    await initDatabase(sqlite)
  }

  const user = await seedDevUser(db)
  await seedCategories(db, user.id)
  await seedPosts(db, user.id)
  await seedAccessKey(db, user.id)

  sqlite.close()

  console.log('\n✅ Database seeded successfully!')
  console.log(`\nDatabase: ${DB_PATH}`)
  console.log(`Corpus: ${CORPUS_PATH}`)
  console.log('\nDev credentials:')
  console.log('  User: dev-user')
  console.log('  API Token: dev-api-token-12345')
}

main().catch(error => {
  console.error('❌ Seed failed:', error)
  process.exit(1)
})
