import { type Component, Show, createSignal } from "solid-js";
import Button from "../ui/button";
import Input from "../ui/input";
import Modal from "../ui/modal";
import Textarea from "../ui/textarea";

interface TokenFormProps {
	isOpen: boolean;
	onSubmit: (data: { name: string; note?: string }) => Promise<{ key: string }>;
	onClose: () => void;
}

const TokenForm: Component<TokenFormProps> = props => {
	const [name, setName] = createSignal("");
	const [note, setNote] = createSignal("");
	const [submitting, setSubmitting] = createSignal(false);
	const [generatedKey, setGeneratedKey] = createSignal<string | null>(null);
	const [error, setError] = createSignal<string | null>(null);

	const reset = () => {
		setName("");
		setNote("");
		setGeneratedKey(null);
		setError(null);
		setSubmitting(false);
	};

	const handleClose = () => {
		reset();
		props.onClose();
	};

	const handleSubmit = async (e: Event) => {
		e.preventDefault();
		const trimmedName = name().trim();
		if (!trimmedName) return;

		setSubmitting(true);
		setError(null);

		try {
			const result = await props.onSubmit({
				name: trimmedName,
				note: note().trim() || undefined,
			});
			setGeneratedKey(result.key);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create token");
		} finally {
			setSubmitting(false);
		}
	};

	const copyToClipboard = async () => {
		const key = generatedKey();
		if (key) {
			await navigator.clipboard.writeText(key);
		}
	};

	return (
		<Modal isOpen={props.isOpen} onClose={handleClose} title="New API Token">
			<Show
				when={!generatedKey()}
				fallback={
					<div class="modal-form">
						<div class="form-success">
							<p class="text-sm font-medium">Token created successfully!</p>
						</div>
						<div class="form-row">
							<label>API Key (copy now - shown only once)</label>
							<div class="flex-row" style={{ gap: "8px" }}>
								<input type="text" value={generatedKey() ?? ""} readonly class="mono flex-1" />
								<Button variant="secondary" onClick={copyToClipboard}>
									Copy
								</Button>
							</div>
						</div>
						<p class="text-xs muted">This key will not be shown again. Please copy it now and store it securely.</p>
						<div class="modal-actions">
							<Button variant="primary" onClick={handleClose}>
								Done
							</Button>
						</div>
					</div>
				}
			>
				<form onSubmit={handleSubmit} class="modal-form">
					<Show when={error()}>
						<div class="form-error">
							<p class="text-sm">{error()}</p>
						</div>
					</Show>
					<div class="form-row">
						<label for="token-name">
							Name <span class="required">*</span>
						</label>
						<Input value={name()} onInput={setName} placeholder="Token name" disabled={submitting()} />
					</div>
					<div class="form-row">
						<label for="token-note">Note (optional)</label>
						<Textarea value={note()} onInput={setNote} placeholder="What is this token for?" rows={3} disabled={submitting()} />
					</div>
					<div class="modal-actions">
						<Button variant="secondary" onClick={handleClose} disabled={submitting()}>
							Cancel
						</Button>
						<Button type="submit" variant="primary" disabled={submitting() || !name().trim()}>
							{submitting() ? "Creating..." : "Create Token"}
						</Button>
					</div>
				</form>
			</Show>
		</Modal>
	);
};

export default TokenForm;
