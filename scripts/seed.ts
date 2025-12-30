import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { create_corpus, create_file_backend, define_store, json_codec } from "@f0rbit/corpus";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { type PostContent, PostContentSchema } from "../packages/schema/src/corpus";
import type { DrizzleDB } from "../packages/schema/src/database";
import * as schema from "../packages/schema/src/database";
import type { PostsCorpus } from "../packages/schema/src/types";
import { createPostService } from "../packages/server/src/services/posts";

const LOCAL_DIR = "./local";
const DB_PATH = `${LOCAL_DIR}/sqlite.db`;
const CORPUS_PATH = `${LOCAL_DIR}/corpus`;

const ensureDirectories = async (): Promise<void> => {
	await mkdir(LOCAL_DIR, { recursive: true });
	await mkdir(CORPUS_PATH, { recursive: true });
};

const createCorpus = (): PostsCorpus => {
	const backend = create_file_backend({ base_path: CORPUS_PATH });
	const posts_store = define_store("posts", json_codec(PostContentSchema));
	return create_corpus().with_backend(backend).with_store(posts_store).build();
};

const seedDevUser = async (db: DrizzleDB): Promise<typeof schema.users.$inferSelect> => {
	const now = new Date();

	await db
		.insert(schema.users)
		.values({
			github_id: 12345,
			username: "dev-user",
			email: "dev@local.test",
			avatar_url: "https://github.com/ghost.png",
			created_at: now,
			updated_at: now,
		})
		.onConflictDoNothing();

	const [user] = await db.select().from(schema.users).limit(1);
	console.log(`✓ User seeded: ${user.username}`);
	return user;
};

type CategorySeed = { name: string; parent: string | null };

const categorySeeds: CategorySeed[] = [
	{ name: "root", parent: null },
	{ name: "coding", parent: "root" },
	{ name: "devlog", parent: "coding" },
	{ name: "gamedev", parent: "coding" },
	{ name: "learning", parent: "root" },
	{ name: "hobbies", parent: "root" },
	{ name: "story", parent: "root" },
];

const seedCategories = async (db: DrizzleDB, userId: number): Promise<void> => {
	for (const cat of categorySeeds) {
		await db
			.insert(schema.categories)
			.values({
				owner_id: userId,
				name: cat.name,
				parent: cat.parent,
			})
			.onConflictDoNothing();
	}

	console.log(`✓ Categories seeded: ${categorySeeds.length} categories`);
};

type PostSeed = {
	slug: string;
	category: string;
	tags: string[];
	content: PostContent;
	publishAt: Date | null;
};

const postSeeds: PostSeed[] = [
	{
		slug: "getting-started-with-bun",
		category: "devlog",
		tags: ["bun", "javascript", "tutorial"],
		content: {
			title: "Getting Started with Bun",
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
			description: "A quick introduction to the Bun JavaScript runtime",
			format: "md",
		},
		publishAt: new Date("2024-01-15"),
	},
	{
		slug: "building-a-blog-api",
		category: "devlog",
		tags: ["hono", "cloudflare", "typescript"],
		content: {
			title: "Building a Blog API with Hono and Cloudflare",
			content: `# Building a Blog API

This is a draft post about building APIs with Hono.

## Why Hono?

- Lightweight and fast
- TypeScript-first
- Works great with Cloudflare Workers
`,
			description: "How to build a modern API with Hono and Cloudflare Workers",
			format: "md",
		},
		publishAt: null,
	},
	{
		slug: "learning-rust-day-1",
		category: "learning",
		tags: ["rust", "learning"],
		content: {
			title: "Learning Rust: Day 1",
			content: `# Day 1 of Learning Rust

Today I started learning Rust. Here are my notes.

## Ownership

The ownership system is unique to Rust...
`,
			description: "My journey learning Rust programming",
			format: "md",
		},
		publishAt: new Date(Date.now() + 86400000 * 7),
	},
	{
		slug: "functional-programming-patterns-typescript",
		category: "coding",
		tags: ["typescript", "functional", "patterns"],
		content: {
			title: "Functional Programming Patterns in TypeScript",
			content: `# Functional Programming Patterns in TypeScript

After years of writing object-oriented code, I've found that functional patterns lead to more maintainable and testable code. Here's a collection of patterns I use daily.

## The Result Pattern

Instead of throwing exceptions, we can use union types to represent success and failure states:

\`\`\`typescript
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

const divide = (a: number, b: number): Result<number, string> => {
  if (b === 0) return { ok: false, error: "Division by zero" };
  return { ok: true, value: a / b };
};
\`\`\`

## Composition Over Inheritance

Build complex behaviors by composing simple functions rather than creating deep class hierarchies. The pipe function is your friend:

\`\`\`typescript
const pipe = <T>(...fns: Array<(x: T) => T>) => (x: T): T =>
  fns.reduce((acc, fn) => fn(acc), x);

const processUser = pipe(
  validateEmail,
  normalizeUsername,
  hashPassword
);
\`\`\`

This approach makes testing trivial - each function is pure and can be tested in isolation.
`,
			description: "Practical functional programming patterns for everyday TypeScript development",
			format: "md",
		},
		publishAt: new Date("2024-03-10"),
	},
	{
		slug: "roguelike-devlog-01-dungeon-generation",
		category: "gamedev",
		tags: ["gamedev", "roguelike", "procedural-generation"],
		content: {
			title: "Roguelike Devlog #1: Dungeon Generation",
			content: `= Roguelike Devlog #1: Dungeon Generation

I've been working on a roguelike game in my spare time, and I wanted to share my progress on the dungeon generation system.

== The Problem

Generating interesting dungeons is harder than it looks. You need rooms that connect logically, corridors that don't overlap weirdly, and enough variation to keep things fresh.

== Binary Space Partitioning

I settled on BSP (Binary Space Partitioning) for the initial room layout. The algorithm recursively divides the dungeon space into smaller regions, then places a room within each leaf node.

----
function splitSpace(area, depth):
    if depth == 0 or area too small:
        return createRoom(area)
    
    splitVertically = random() > 0.5
    left, right = divide(area, splitVertically)
    
    return {
        left: splitSpace(left, depth - 1),
        right: splitSpace(right, depth - 1)
    }
----

== What's Next

Next week I'll tackle corridor generation and making sure rooms connect properly. The current approach sometimes creates isolated sections, which isn't ideal.

Stay tuned for more updates!
`,
			format: "adoc",
		},
		publishAt: new Date("2024-02-20"),
	},
	{
		slug: "weekend-project-mechanical-keyboard",
		category: "hobbies",
		tags: ["keyboards", "diy", "hardware"],
		content: {
			title: "Weekend Project: Building My First Mechanical Keyboard",
			content: `# Building My First Mechanical Keyboard

Last weekend I finally took the plunge and built my own mechanical keyboard. It's been on my todo list for years, and I'm glad I finally did it.

## The Parts

- **PCB**: DZ60 RGB hot-swap
- **Case**: Tofu60 aluminum (dark grey)
- **Switches**: Gateron Milky Yellows (lubed with Krytox 205g0)
- **Keycaps**: GMK clones from KBDfans
- **Stabilizers**: Durock v2 (holee modded)

## The Build Process

Honestly, with a hot-swap PCB, the "build" was mostly just pressing switches into sockets. The real work was in the prep - lubing 70 switches took about 3 hours while watching movies.

The holee mod for stabilizers made a massive difference. No more rattle on the spacebar and enter key.

## Was It Worth It?

Absolutely. The total cost was around $280, which is expensive for a keyboard but reasonable for the hobby. More importantly, I now understand why people get obsessed with this stuff. The sound and feel of a properly built keyboard is *chef's kiss*.

Next project: designing a custom PCB with a rotary encoder.
`,
			description: "My journey into the mechanical keyboard rabbit hole",
			format: "md",
		},
		publishAt: new Date("2024-04-05"),
	},
	{
		slug: "why-i-switched-to-neovim",
		category: "coding",
		tags: ["neovim", "productivity", "tools"],
		content: {
			title: "Why I Switched to Neovim (And You Might Not Want To)",
			content: `# Why I Switched to Neovim

After 8 years of VS Code, I made the switch to Neovim. Here's an honest account of why, and why it might not be for everyone.

## The Good

Modal editing clicked for me. Once you internalize the grammar of vim motions (verb + noun), text manipulation becomes incredibly fast. \`ciw\` to change inner word, \`da(\` to delete around parentheses - it's like speaking a language.

Startup time is instant. My entire config loads in under 50ms. No more waiting for extensions to initialize.

Everything is keyboard-driven. I haven't touched my mouse during coding in months.

## The Bad

The learning curve is brutal. I was slower for the first 2-3 weeks. If you're on a deadline, don't switch.

Configuration is endless. I've spent hours tweaking my setup. Some people love this, others will hate it.

LSP setup can be finicky. Getting TypeScript, ESLint, and Prettier to play nice required more effort than VS Code's one-click extensions.

## My Verdict

If you're curious and have the patience, try it. But there's nothing wrong with staying in VS Code - it's a great editor. The productivity gains from Neovim are real but marginal compared to just... writing more code.
`,
			format: "md",
		},
		publishAt: null,
	},
	{
		slug: "notes-on-distributed-systems",
		category: "learning",
		tags: ["distributed-systems", "architecture", "notes"],
		content: {
			title: "Notes on Distributed Systems Design",
			content: `= Notes on Distributed Systems Design

These are my notes from reading "Designing Data-Intensive Applications" and various papers. Mostly for my own reference.

== CAP Theorem (But Actually)

The CAP theorem is often misunderstood. It's not about choosing 2 of 3 - it's about what happens during a network partition. When the network is healthy, you can have all three.

The real question is: when a partition occurs, do you prioritize consistency or availability?

== Consensus Protocols

=== Raft

Easier to understand than Paxos. Leader-based consensus with explicit log replication.

Key insight: safety is guaranteed even with message delays and lost messages. Liveness requires a stable leader.

=== CRDT

Conflict-free Replicated Data Types allow concurrent updates without coordination. Great for eventual consistency scenarios.

Simple example: a G-Counter (grow-only counter) where each node maintains its own count, and the total is the sum of all node counts.

== Questions I Still Have

- How do you choose between strong and eventual consistency for specific features?
- What's the practical limit on Raft cluster size?
- When do CRDTs become impractical due to metadata overhead?

More reading needed...
`,
			format: "adoc",
		},
		publishAt: new Date(Date.now() + 86400000 * 14),
	},
	{
		slug: "on-burnout-and-recovery",
		category: "story",
		tags: ["burnout", "mental-health", "career"],
		content: {
			title: "On Burnout and Recovery",
			content: `# On Burnout and Recovery

This is a more personal post than I usually write. Last year, I burned out hard. Here's what happened and what helped.

## How It Started

The classic story: I took on too much. A demanding job, side projects, trying to learn new things constantly. I wore busyness as a badge of honor.

The warning signs were there - insomnia, irritability, loss of interest in things I used to enjoy. I ignored them all because I was "productive."

## The Breaking Point

One Monday morning, I couldn't get out of bed. Not in a physical way - I just couldn't muster any reason to. Work that used to excite me felt meaningless. Every task felt insurmountable.

I took a sick day, then a week, then a month.

## What Helped

**1. Actually resting.** Not "productive" rest like reading technical books. Actual rest. Walks, cooking, seeing friends, playing games with no learning objective.

**2. Therapy.** Talking to someone helped me understand the patterns that led here. The constant need to prove myself, the inability to set boundaries.

**3. Re-evaluating.** What actually matters? Turns out, not shipping features at 11pm to impress people who won't remember it in a month.

## Where I Am Now

Better, but careful. I set hard boundaries now. I have hobbies that have nothing to do with tech. I'm okay with being "just" a good engineer instead of an exceptional one.

If any of this resonates, take it seriously. Burnout isn't a badge of honor - it's a warning sign.
`,
			format: "md",
		},
		publishAt: new Date("2024-05-12"),
	},
	{
		slug: "roguelike-devlog-02-entity-component-system",
		category: "gamedev",
		tags: ["gamedev", "roguelike", "ecs", "architecture"],
		content: {
			title: "Roguelike Devlog #2: Implementing an ECS",
			content: `= Roguelike Devlog #2: Entity Component System

Following up on the dungeon generation post, this week I tackled the entity component system (ECS) for managing game objects.

== Why ECS?

In a roguelike, you have many entities with varying combinations of behaviors:

- Players and monsters need position, health, AI
- Items need position, pickup behavior
- Traps need position, trigger logic
- Doors need position, open/close state

Inheritance doesn't scale here. With ECS, entities are just IDs, and we attach components (data) and systems (behavior) as needed.

== The Implementation

I kept it simple:

----
type Entity = number;

interface World {
  entities: Set<Entity>;
  components: Map<ComponentType, Map<Entity, Component>>;
}

const addComponent = <T>(world: World, entity: Entity, type: ComponentType, data: T) => {
  if (!world.components.has(type)) {
    world.components.set(type, new Map());
  }
  world.components.get(type)!.set(entity, data);
};
----

== Systems

Systems query entities by their component composition and update state:

----
const movementSystem = (world: World) => {
  const positions = world.components.get("Position");
  const velocities = world.components.get("Velocity");
  
  for (const [entity, vel] of velocities) {
    const pos = positions.get(entity);
    if (pos) {
      pos.x += vel.dx;
      pos.y += vel.dy;
    }
  }
};
----

== Next Steps

Need to implement a proper AI system for enemies. Thinking about behavior trees vs. utility AI. Will explore both and report back!
`,
			format: "adoc",
		},
		publishAt: null,
	},
];

const seedPosts = async (db: DrizzleDB, corpus: PostsCorpus, userId: number): Promise<void> => {
	const service = createPostService({ db, corpus });
	let seededCount = 0;

	for (const seed of postSeeds) {
		const existing = await db
			.select({ id: schema.posts.id })
			.from(schema.posts)
			.where(and(eq(schema.posts.author_id, userId), eq(schema.posts.slug, seed.slug)))
			.limit(1);

		if (existing.length > 0) continue;

		const result = await service.create(userId, {
			slug: seed.slug,
			title: seed.content.title,
			content: seed.content.content,
			description: seed.content.description,
			format: seed.content.format,
			category: seed.category,
			tags: seed.tags,
			publish_at: seed.publishAt,
		});

		if (!result.ok) {
			console.error(`  ✗ Failed to create post "${seed.slug}":`, result.error);
			continue;
		}

		seededCount++;
	}

	console.log(`✓ Posts seeded: ${seededCount} new posts (${postSeeds.length - seededCount} already existed)`);
};

const seedAccessKey = async (db: DrizzleDB, userId: number): Promise<void> => {
	const devToken = "dev-api-token-12345";
	const encoder = new TextEncoder();
	const data = encoder.encode(devToken);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const keyHash = Array.from(new Uint8Array(hashBuffer))
		.map(b => b.toString(16).padStart(2, "0"))
		.join("");

	await db
		.insert(schema.accessKeys)
		.values({
			user_id: userId,
			key_hash: keyHash,
			name: "Dev API Key",
			note: 'Local development token. Use "dev-api-token-12345" as Auth-Token header.',
			enabled: true,
			created_at: new Date(),
		})
		.onConflictDoNothing();

	console.log("✓ Access key seeded: dev-api-token-12345");
};

const main = async (): Promise<void> => {
	console.log("🌱 Seeding database...\n");

	await ensureDirectories();

	if (!existsSync(DB_PATH)) {
		console.error('❌ Database not found. Run "bun run db:push" first to create the schema.');
		process.exit(1);
	}

	const sqlite = new Database(DB_PATH);
	const db = drizzle(sqlite) as DrizzleDB;
	const corpus = createCorpus();

	const user = await seedDevUser(db);
	await seedCategories(db, user.id);
	await seedPosts(db, corpus, user.id);
	await seedAccessKey(db, user.id);

	sqlite.close();

	console.log("\n✅ Database seeded successfully!");
	console.log(`\nDatabase: ${DB_PATH}`);
	console.log(`Corpus: ${CORPUS_PATH}`);
	console.log("\nDev credentials:");
	console.log("  User: dev-user");
	console.log("  API Token: dev-api-token-12345");
};

main().catch(error => {
	console.error("❌ Seed failed:", error);
	process.exit(1);
});
