import { type Result, err, first, format_error, match, ok, to_nullable } from "@blog/schema";

export type ServiceError = {
	type: "not_found" | "db_error" | "invalid_input" | "unauthorized" | "conflict";
	message?: string;
	resource?: string;
};

export const createDbError = (e: unknown) => ({
	type: "db_error" as const,
	message: format_error(e),
});

export const createNotFound = (resource: string) => ({
	type: "not_found" as const,
	resource,
});

export const firstRowOr = <T, E>(rows: T[], errorFn: () => E): Result<T, E> =>
	match(
		first(rows),
		(v: T) => ok(v) as Result<T, E>,
		() => err(errorFn())
	);

export const firstRowOrNull = <T>(rows: T[]): T | null => to_nullable(first(rows));
