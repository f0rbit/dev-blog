import type { Component } from "solid-js";
import { For, Show, createSignal } from "solid-js";
import TagEditor from "./tag-editor";

type Post = {
	id: number;
	uuid: string;
	slug: string;
	title: string;
	content: string;
	description?: string;
	format: "md" | "adoc";
	category: string;
	tags: string[];
	publish_at: string | null;
};

type Category = {
	name: string;
	parent: string | null;
};

type PostFormData = {
	slug: string;
	title: string;
	content: string;
	description?: string;
	format: "md" | "adoc";
	category: string;
	tags: string[];
	publish_at: Date | null;
};

type PostEditorProps = {
	post?: Post;
	categories: Category[];
	onSave?: (data: PostFormData) => Promise<void>;
	onFormReady?: (getFormData: () => PostFormData) => void;
};

const generateSlug = (title: string): string =>
	title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");

const formatDateForInput = (date: Date | null): string => {
	if (!date) return "";
	const pad = (n: number) => n.toString().padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const PostEditor: Component<PostEditorProps> = props => {
	console.log("[PostEditor] Received props.post:", JSON.stringify(props.post, null, 2));
	console.log("[PostEditor] Received props.categories:", JSON.stringify(props.categories, null, 2));
	
	const [title, setTitle] = createSignal(props.post?.title ?? "");
	const [slug, setSlug] = createSignal(props.post?.slug ?? "");
	const [content, setContent] = createSignal(props.post?.content ?? "");
	const [description, setDescription] = createSignal(props.post?.description ?? "");
	const [format, setFormat] = createSignal<"md" | "adoc">(props.post?.format ?? "md");
	const [category, setCategory] = createSignal(props.post?.category ?? "root");
	const [tags, setTags] = createSignal<string[]>(props.post?.tags ?? []);
	const [publishAt, setPublishAt] = createSignal<Date | null>(props.post?.publish_at ? new Date(props.post.publish_at) : null);

	console.log("[PostEditor] Initial title signal:", title());
	console.log("[PostEditor] Initial content signal:", content());

	const [saving, setSaving] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);

	const isEditing = () => !!props.post;

	// Expose form data getter for external save button
	const getFormData = (): PostFormData => ({
		slug: slug(),
		title: title(),
		content: content(),
		description: description() || undefined,
		format: format(),
		category: category(),
		tags: tags(),
		publish_at: publishAt(),
	});

	// Call onFormReady or window.postEditorReady so parent can wire up save button
	if (props.onFormReady) {
		props.onFormReady(getFormData);
	}
	if (typeof window !== "undefined" && (window as any).postEditorReady) {
		(window as any).postEditorReady(getFormData);
	}

	const handleTitleChange = (newTitle: string) => {
		setTitle(newTitle);
		if (!isEditing() && !slug()) {
			setSlug(generateSlug(newTitle));
		}
	};

	const handlePublishAtChange = (value: string) => {
		if (!value) {
			setPublishAt(null);
		} else {
			setPublishAt(new Date(value));
		}
	};

	const handleSave = async () => {
		if (!props.onSave) return;

		setError(null);
		if (!title().trim()) {
			setError("Title is required");
			return;
		}
		if (!slug().trim()) {
			setError("Slug is required");
			return;
		}

		setSaving(true);
		try {
			await props.onSave(getFormData());
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to save post");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div class="post-editor">
			<Show when={error()}>
				<div class="form-error">{error()}</div>
			</Show>

			{/* Title + Metadata section with border */}
			<div class="post-editor__header">
				<input type="text" class="post-editor__title-input" placeholder="Post title..." prop:value={title()} onInput={e => handleTitleChange(e.currentTarget.value)} />

				{/* Metadata grid */}
				<div class="post-editor__metadata">
					<div class="post-editor__field">
						<label>Slug</label>
						<input type="text" prop:value={slug()} onInput={e => setSlug(e.currentTarget.value)} placeholder="post-slug" />
					</div>

					<div class="post-editor__field">
						<label>Category</label>
						<select prop:value={category()} onChange={e => setCategory(e.currentTarget.value)}>
							<option value="root">root</option>
							<For each={props.categories.filter(c => c.name !== "root")}>{c => <option value={c.name}>{c.parent ? `${c.parent}/${c.name}` : c.name}</option>}</For>
						</select>
					</div>

					<div class="post-editor__field">
						<label>Format</label>
						<select prop:value={format()} onChange={e => setFormat(e.currentTarget.value as "md" | "adoc")}>
							<option value="md">Markdown</option>
							<option value="adoc">AsciiDoc</option>
						</select>
					</div>

					<div class="post-editor__field">
						<label>Publish at</label>
						<input type="datetime-local" prop:value={formatDateForInput(publishAt())} onInput={e => handlePublishAtChange(e.currentTarget.value)} />
					</div>

					<div class="post-editor__field post-editor__field--wide">
						<label>Description</label>
						<input type="text" prop:value={description()} onInput={e => setDescription(e.currentTarget.value)} placeholder="Brief description..." />
					</div>

					<div class="post-editor__field post-editor__field--wide">
						<label>Tags</label>
						<TagEditor tags={tags()} onChange={setTags} />
					</div>
				</div>

				{/* Actions - only show if onSave is provided (new post page) */}
				<Show when={props.onSave}>
					<div class="post-editor__actions">
						<button type="button" class="btn-primary" onClick={handleSave} disabled={saving()}>
							{saving() ? "Saving..." : isEditing() ? "Update" : "Create"}
						</button>
					</div>
				</Show>
			</div>

			{/* Content editor - full width, no border */}
			<textarea class="post-editor__content" placeholder="Write your content..." prop:value={content()} onInput={e => setContent(e.currentTarget.value)} />
		</div>
	);
};

export default PostEditor;
