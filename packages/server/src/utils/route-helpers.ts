import type { AppContext, Result } from "@blog/schema";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { mapServiceErrorToResponse } from "./errors";

export type Variables = {
	user: { id: number };
	appContext: AppContext;
};

type ValidTarget = "query" | "param" | "json";
export const valid = <T>(c: Context, target: ValidTarget): T => (c.req.valid as (t: ValidTarget) => T)(target);

type MappableError = Parameters<typeof mapServiceErrorToResponse>[0];

export const handleResult = <T>(c: Context, result: Result<T, MappableError>, successStatus: ContentfulStatusCode = 200): Response => {
	if (!result.ok) {
		const { status, body } = mapServiceErrorToResponse(result.error);
		return c.json(body, status);
	}
	return c.json(result.value, successStatus);
};
