import { type Result, err, format_error, ok } from "@blog/schema";

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

export const firstRowOr = <T, E>(rows: T[], errorFn: () => E): Result<T, E> => {
	const row = rows[0];
	if (!row) return err(errorFn());
	return ok(row);
};
