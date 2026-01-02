import { type Component, Show, createSignal } from "solid-js";
import { createFormState } from "../../lib/form-utils";
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
	const [generatedKey, setGeneratedKey] = createSignal<string | null>(null);
	const form = createFormState();

	const reset = () => {
		setName("");
		setNote("");
		setGeneratedKey(null);
		form.setError(null);
	};

	const handleClose = () => {
		reset();
		props.onClose();
	};

	const handleSubmit = async (e: Event) => {
		e.preventDefault();
		const trimmedName = name().trim();
		if (!trimmedName) return;

		const result = await form.handleSubmit(() =>
			props.onSubmit({
				name: trimmedName,
				note: note().trim() || undefined,
			})
		);
		if (result) setGeneratedKey(result.key);
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
					<Show when={form.error()}>
						<div class="form-error">
							<p class="text-sm">{form.error()}</p>
						</div>
					</Show>
					<div class="form-row">
						<label for="token-name">
							Name <span class="required">*</span>
						</label>
						<Input value={name()} onInput={setName} placeholder="Token name" disabled={form.submitting()} />
					</div>
					<div class="form-row">
						<label for="token-note">Note (optional)</label>
						<Textarea value={note()} onInput={setNote} placeholder="What is this token for?" rows={3} disabled={form.submitting()} />
					</div>
					<div class="modal-actions">
						<Button variant="secondary" onClick={handleClose} disabled={form.submitting()}>
							Cancel
						</Button>
						<Button type="submit" variant="primary" disabled={form.submitting() || !name().trim()}>
							{form.submitting() ? "Creating..." : "Create Token"}
						</Button>
					</div>
				</form>
			</Show>
		</Modal>
	);
};

export default TokenForm;
