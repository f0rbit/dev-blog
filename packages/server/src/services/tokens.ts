import { type AccessKeyCreate, type AccessKeyUpdate, type DrizzleDB, type Result, accessKeys, err, format_error, ok, try_catch_async } from "@blog/schema";
import type { AccessKey } from "@blog/schema/database";
import { and, eq } from "drizzle-orm";
import { hashToken } from "../utils/crypto";

type TokenServiceError = { type: "not_found"; resource: string } | { type: "db_error"; message: string };

export type SanitizedToken = {
	id: number;
	name: string;
	note: string | null;
	enabled: boolean;
	created_at: Date;
};

export type CreatedToken = SanitizedToken & {
	token: string;
};

type Deps = {
	db: DrizzleDB;
};

const toDbError = (e: unknown): TokenServiceError => ({
	type: "db_error",
	message: format_error(e),
});

const notFound = (resource: string): TokenServiceError => ({
	type: "not_found",
	resource,
});

const firstRow = <T>(rows: T[], resource: string): Result<T, TokenServiceError> => {
	const row = rows[0];
	if (!row) return err(notFound(resource));
	return ok(row);
};

export const sanitizeToken = (token: AccessKey): SanitizedToken => ({
	id: token.id,
	name: token.name,
	note: token.note,
	enabled: token.enabled,
	created_at: token.created_at,
});

export const generateToken = (): string => crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");

export const createTokenService = ({ db }: Deps) => {
	const list = async (userId: number): Promise<Result<SanitizedToken[], TokenServiceError>> =>
		try_catch_async(async () => {
			const tokens = await db.select().from(accessKeys).where(eq(accessKeys.user_id, userId));

			return tokens.map(sanitizeToken);
		}, toDbError);

	const find = async (userId: number, tokenId: number): Promise<Result<AccessKey, TokenServiceError>> => {
		const rows = await db
			.select()
			.from(accessKeys)
			.where(and(eq(accessKeys.user_id, userId), eq(accessKeys.id, tokenId)))
			.limit(1);

		return firstRow(rows, `token:${tokenId}`);
	};

	const create = async (userId: number, input: AccessKeyCreate): Promise<Result<CreatedToken, TokenServiceError>> =>
		try_catch_async(async () => {
			const plainToken = generateToken();
			const keyHash = await hashToken(plainToken);

			const [created] = await db
				.insert(accessKeys)
				.values({
					user_id: userId,
					key_hash: keyHash,
					name: input.name,
					note: input.note ?? null,
					enabled: true,
				})
				.returning();

			if (!created) throw new Error("Insert returned no rows");

			return {
				...sanitizeToken(created),
				token: plainToken,
			};
		}, toDbError);

	const update = async (userId: number, tokenId: number, input: AccessKeyUpdate): Promise<Result<SanitizedToken, TokenServiceError>> => {
		const existingResult = await find(userId, tokenId);
		if (!existingResult.ok) return existingResult;

		type UpdateFields = Partial<{
			name: string;
			note: string | null;
			enabled: boolean;
		}>;

		const updates: UpdateFields = {};
		if (input.name !== undefined) updates.name = input.name;
		if (input.note !== undefined) updates.note = input.note;
		if (input.enabled !== undefined) updates.enabled = input.enabled;

		if (Object.keys(updates).length === 0) {
			return ok(sanitizeToken(existingResult.value));
		}

		return try_catch_async(async () => {
			const [updated] = await db
				.update(accessKeys)
				.set(updates)
				.where(and(eq(accessKeys.user_id, userId), eq(accessKeys.id, tokenId)))
				.returning();

			if (!updated) throw new Error("Update returned no rows");
			return sanitizeToken(updated);
		}, toDbError);
	};

	const remove = async (userId: number, tokenId: number): Promise<Result<void, TokenServiceError>> => {
		const existingResult = await find(userId, tokenId);
		if (!existingResult.ok) return existingResult;

		return try_catch_async(async () => {
			await db.delete(accessKeys).where(and(eq(accessKeys.user_id, userId), eq(accessKeys.id, tokenId)));
		}, toDbError);
	};

	return {
		list,
		find,
		create,
		update,
		delete: remove,
	};
};

export type TokenService = ReturnType<typeof createTokenService>;
