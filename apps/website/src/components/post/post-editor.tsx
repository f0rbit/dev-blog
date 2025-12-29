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
	onSave: (data: PostFormData) => Promise<void>;
	onDelete?: () => Promise<void>;
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
	const [title, setTitle] = createSignal(props.post?.title ?? "");
	const [slug, setSlug] = createSignal(props.post?.slug ?? "");
	const [content, setContent] = createSignal(props.post?.content ?? "");
	const [description, setDescription] = createSignal(props.post?.description ?? "");
	const [format, setFormat] = createSignal<"md" | "adoc">(props.post?.format ?? "md");
	const [category, setCategory] = createSignal(props.post?.category ?? "root");
	const [tags, setTags] = createSignal<string[]>(props.post?.tags ?? []);
	const [publishAt, setPublishAt] = createSignal<Date | null>(props.post?.publish_at ? new Date(props.post.publish_at) : null);

	const [saving, setSaving] = createSignal(false);
	const [deleting, setDeleting] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);

	const isEditing = () => !!props.post;

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
			await props.onSave({
				slug: slug(),
				title: title(),
				content: content(),
				description: description() || undefined,
				format: format(),
				category: category(),
				tags: tags(),
				publish_at: publishAt(),
			});
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to save post");
		} finally {
			setSaving(false);
		}
	};

	const handleDelete = async () => {
		if (!props.onDelete) return;
		if (!confirm("Are you sure you want to delete this post?")) return;

		setDeleting(true);
		try {
			await props.onDelete();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to delete post");
			setDeleting(false);
		}
	};

	return (
		<div class="post-editor">
			<Show when={error()}>
				<div class="form-error">{error()}</div>
			</Show>

			{/* Title + Metadata section with border */}
			<div class="post-editor__header">
				<input type="text" class="post-editor__title-input" placeholder="Post title..." value={title()} onInput={e => handleTitleChange(e.currentTarget.value)} />

				{/* Metadata grid */}
				<div class="post-editor__metadata">
					<div class="post-editor__field">
						<label>Slug</label>
						<input type="text" value={slug()} onInput={e => setSlug(e.currentTarget.value)} placeholder="post-slug" />
					</div>

					<div class="post-editor__field">
						<label>Category</label>
						<select value={category()} onChange={e => setCategory(e.currentTarget.value)}>
							<option value="root">root</option>
							<For each={props.categories.filter(c => c.name !== "root")}>{c => <option value={c.name}>{c.parent ? `${c.parent}/${c.name}` : c.name}</option>}</For>
						</select>
					</div>

					<div class="post-editor__field">
						<label>Format</label>
						<select value={format()} onChange={e => setFormat(e.currentTarget.value as "md" | "adoc")}>
							<option value="md">Markdown</option>
							<option value="adoc">AsciiDoc</option>
						</select>
					</div>

					<div class="post-editor__field">
						<label>Publish at</label>
						<input type="datetime-local" value={formatDateForInput(publishAt())} onInput={e => handlePublishAtChange(e.currentTarget.value)} />
					</div>

					<div class="post-editor__field post-editor__field--wide">
						<label>Description</label>
						<input type="text" value={description()} onInput={e => setDescription(e.currentTarget.value)} placeholder="Brief description..." />
					</div>

					<div class="post-editor__field post-editor__field--wide">
						<label>Tags</label>
						<TagEditor tags={tags()} onChange={setTags} />
					</div>
				</div>

				{/* Actions */}
				<div class="post-editor__actions">
					<button type="button" class="btn-primary" onClick={handleSave} disabled={saving()}>
						{saving() ? "Saving..." : isEditing() ? "Update" : "Create"}
					</button>
					<Show when={isEditing() && props.onDelete}>
						<button type="button" class="btn-danger" onClick={handleDelete} disabled={deleting()}>
							{deleting() ? "Deleting..." : "Delete"}
						</button>
					</Show>
				</div>
			</div>

			{/* Content editor - full width, no border */}
			<textarea class="post-editor__content" placeholder="Write your content..." value={content()} onInput={e => setContent(e.currentTarget.value)} />
		</div>
	);
};

export default PostEditor;
