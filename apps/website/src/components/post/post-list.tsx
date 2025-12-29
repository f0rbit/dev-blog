import type { Component } from "solid-js";
import { For, Show } from "solid-js";
import StatusBadge from "../ui/status-badge";

type Post = {
	id: number;
	uuid: string;
	slug: string;
	title: string;
	description?: string;
	category: string;
	tags: string[];
	publish_at: string | null;
	updated_at: string;
};

type PostListProps = {
	posts: Post[];
};

type PostStatus = "draft" | "scheduled" | "published";

const deriveStatus = (publishAt: string | null): PostStatus => {
	if (!publishAt) return "draft";
	const publishDate = new Date(publishAt);
	return publishDate <= new Date() ? "published" : "scheduled";
};

const formatDate = (dateStr: string): string => {
	const date = new Date(dateStr);
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
};

const PostList: Component<PostListProps> = props => {
	return (
		<div class="post-list">
			<For each={props.posts}>
				{post => (
					<article class="post-item">
						<div class="post-item__header">
							<h3 class="post-item__title">
								<a href={`/posts/${post.slug}`}>{post.title}</a>
							</h3>
							<StatusBadge status={deriveStatus(post.publish_at)} />
						</div>

						<Show when={post.description}>
							<p class="post-item__description">{post.description}</p>
						</Show>

						<div class="post-item__meta">
							<span class="post-item__category">{post.category}</span>

							<Show when={post.tags.length > 0}>
								<div class="post-item__tags">
									<For each={post.tags}>{tag => <span class="tag-badge">{tag}</span>}</For>
								</div>
							</Show>

							<span>Updated {formatDate(post.updated_at)}</span>
						</div>
					</article>
				)}
			</For>
		</div>
	);
};

export default PostList;
