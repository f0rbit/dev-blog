import { createSignal } from "solid-js";

export type FormState = {
	submitting: () => boolean;
	error: () => string | null;
	setError: (error: string | null) => void;
	handleSubmit: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
};

export const createFormState = (): FormState => {
	const [submitting, setSubmitting] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);

	const handleSubmit = async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
		setSubmitting(true);
		setError(null);
		try {
			const result = await fn();
			return result;
		} catch (err) {
			setError(err instanceof Error ? err.message : "Operation failed");
			return undefined;
		} finally {
			setSubmitting(false);
		}
	};

	return { submitting, error, setError, handleSubmit };
};
