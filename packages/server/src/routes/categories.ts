import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import * as schema from '@blog/schema/database'
import {
  CategoryCreateSchema,
  type Category,
  type Result,
  type ApiError,
  type Env,
  ok,
  err,
} from '@blog/schema'

interface CategoryNode {
  name: string
  parent: string | null
  children: CategoryNode[]
}

type AuthEnv = {
  Bindings: Env
  Variables: { user: { id: number } }
}

const CategoryNameSchema = z.object({
  name: z.string().min(1),
})

const CategoryUpdateSchema = z.object({
  name: z.string().min(1),
})

const buildCategoryTree = (categories: Category[]): CategoryNode[] => {
  const nodeMap = new Map<string, CategoryNode>()
  
  categories.forEach(cat => {
    nodeMap.set(cat.name, { name: cat.name, parent: cat.parent, children: [] })
  })
  
  const roots: CategoryNode[] = []
  
  nodeMap.forEach(node => {
    if (!node.parent || node.parent === 'root') {
      roots.push(node)
      return
    }
    
    const parent = nodeMap.get(node.parent)
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  })
  
  return roots
}

const findCategory = async (
  db: ReturnType<typeof drizzle>,
  ownerId: number,
  name: string
): Promise<Result<Category, ApiError>> => {
  const [category] = await db
    .select()
    .from(schema.categories)
    .where(and(
      eq(schema.categories.owner_id, ownerId),
      eq(schema.categories.name, name)
    ))
    .limit(1)

  if (!category) {
    return err({ code: 'NOT_FOUND', message: 'Category not found' })
  }

  return ok(category)
}

const hasChildren = async (
  db: ReturnType<typeof drizzle>,
  ownerId: number,
  name: string
): Promise<boolean> => {
  const children = await db
    .select()
    .from(schema.categories)
    .where(and(
      eq(schema.categories.owner_id, ownerId),
      eq(schema.categories.parent, name)
    ))
    .limit(1)

  return children.length > 0
}

const hasPosts = async (
  db: ReturnType<typeof drizzle>,
  authorId: number,
  category: string
): Promise<boolean> => {
  const postsInCategory = await db
    .select()
    .from(schema.posts)
    .where(and(
      eq(schema.posts.author_id, authorId),
      eq(schema.posts.category, category)
    ))
    .limit(1)

  return postsInCategory.length > 0
}

export const categoriesRouter = new Hono<AuthEnv>()

categoriesRouter.get('/', async (c) => {
  const user = c.get('user')
  const db = drizzle(c.env.DB)

  const categories = await db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.owner_id, user.id))

  const tree = buildCategoryTree(categories)

  return c.json({ categories: tree })
})

categoriesRouter.post(
  '/',
  zValidator('json', CategoryCreateSchema),
  async (c) => {
    const user = c.get('user')
    const data = c.req.valid('json')
    const db = drizzle(c.env.DB)

    const [existing] = await db
      .select()
      .from(schema.categories)
      .where(and(
        eq(schema.categories.owner_id, user.id),
        eq(schema.categories.name, data.name)
      ))
      .limit(1)

    if (existing) {
      return c.json(
        { code: 'CONFLICT', message: 'Category with this name already exists' },
        409
      )
    }

    if (data.parent && data.parent !== 'root') {
      const parentResult = await findCategory(db, user.id, data.parent)
      if (!parentResult.ok) {
        return c.json(
          { code: 'BAD_REQUEST', message: 'Parent category does not exist' },
          400
        )
      }
    }

    const [created] = await db
      .insert(schema.categories)
      .values({
        owner_id: user.id,
        name: data.name,
        parent: data.parent ?? 'root',
      })
      .returning()

    return c.json(created, 201)
  }
)

categoriesRouter.put(
  '/:name',
  zValidator('param', CategoryNameSchema),
  zValidator('json', CategoryUpdateSchema),
  async (c) => {
    const user = c.get('user')
    const { name } = c.req.valid('param')
    const data = c.req.valid('json')
    const db = drizzle(c.env.DB)

    const categoryResult = await findCategory(db, user.id, name)
    if (!categoryResult.ok) {
      return c.json(categoryResult.error, 404)
    }

    if (name === data.name) {
      return c.json(categoryResult.value)
    }

    const [existingNew] = await db
      .select()
      .from(schema.categories)
      .where(and(
        eq(schema.categories.owner_id, user.id),
        eq(schema.categories.name, data.name)
      ))
      .limit(1)

    if (existingNew) {
      return c.json(
        { code: 'CONFLICT', message: 'Category with this name already exists' },
        409
      )
    }

    await db
      .update(schema.categories)
      .set({ parent: data.name })
      .where(and(
        eq(schema.categories.owner_id, user.id),
        eq(schema.categories.parent, name)
      ))

    await db
      .update(schema.posts)
      .set({ category: data.name })
      .where(and(
        eq(schema.posts.author_id, user.id),
        eq(schema.posts.category, name)
      ))

    const [updated] = await db
      .update(schema.categories)
      .set({ name: data.name })
      .where(and(
        eq(schema.categories.owner_id, user.id),
        eq(schema.categories.name, name)
      ))
      .returning()

    return c.json(updated)
  }
)

categoriesRouter.delete(
  '/:name',
  zValidator('param', CategoryNameSchema),
  async (c) => {
    const user = c.get('user')
    const { name } = c.req.valid('param')
    const db = drizzle(c.env.DB)

    const categoryResult = await findCategory(db, user.id, name)
    if (!categoryResult.ok) {
      return c.json(categoryResult.error, 404)
    }

    if (await hasChildren(db, user.id, name)) {
      return c.json(
        { code: 'CONFLICT', message: 'Cannot delete category with children' },
        409
      )
    }

    if (await hasPosts(db, user.id, name)) {
      return c.json(
        { code: 'CONFLICT', message: 'Cannot delete category with posts' },
        409
      )
    }

    await db
      .delete(schema.categories)
      .where(and(
        eq(schema.categories.owner_id, user.id),
        eq(schema.categories.name, name)
      ))

    return c.body(null, 204)
  }
)
