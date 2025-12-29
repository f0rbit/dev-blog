import { type ParentComponent, Show, createEffect, onCleanup } from "solid-js";
import { Portal, isServer } from "solid-js/web";

interface ModalProps {
	isOpen: boolean;
	onClose: () => void;
	title: string;
}

const Modal: ParentComponent<ModalProps> = props => {
	const handleKeydown = (e: KeyboardEvent) => {
		if (e.key === "Escape") props.onClose();
	};

	const handleOverlayClick = (e: MouseEvent) => {
		if (e.target === e.currentTarget) props.onClose();
	};

	createEffect(() => {
		if (isServer) return;
		if (props.isOpen) {
			document.addEventListener("keydown", handleKeydown);
			onCleanup(() => {
				document.removeEventListener("keydown", handleKeydown);
			});
		}
	});

	return (
		<Show when={props.isOpen}>
			<Portal>
				<div class="modal-overlay" onClick={handleOverlayClick} onKeyDown={handleKeydown} role="presentation">
					<div class="modal-card">
						<div class="modal-header">
							<h3>{props.title}</h3>
							<button type="button" class="modal-close" onClick={props.onClose} aria-label="Close modal">
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M18 6L6 18M6 6l12 12" />
								</svg>
							</button>
						</div>
						{props.children}
					</div>
				</div>
			</Portal>
		</Show>
	);
};

export default Modal;
