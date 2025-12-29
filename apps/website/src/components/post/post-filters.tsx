import type { Component } from "solid-js";
import { For } from "solid-js";

type Category = {
	name: string;
};

type PostFiltersProps = {
	status: string;
	category: string;
	search: string;
	categories: Category[];
	onStatusChange: (status: string) => void;
	onCategoryChange: (category: string) => void;
	onSearchChange: (search: string) => void;
};

const statusOptions = [
	{ value: "", label: "All" },
	{ value: "draft", label: "Draft" },
	{ value: "scheduled", label: "Scheduled" },
	{ value: "published", label: "Published" },
];

const PostFilters: Component<PostFiltersProps> = props => {
	return (
		<div class="filters">
			<div class="filter-group">
				<label for="status-filter">Status</label>
				<select id="status-filter" value={props.status} onChange={e => props.onStatusChange(e.currentTarget.value)}>
					<For each={statusOptions}>{option => <option value={option.value}>{option.label}</option>}</For>
				</select>
			</div>

			<div class="filter-group">
				<label for="category-filter">Category</label>
				<select id="category-filter" value={props.category} onChange={e => props.onCategoryChange(e.currentTarget.value)}>
					<option value="">All Categories</option>
					<For each={props.categories}>{cat => <option value={cat.name}>{cat.name}</option>}</For>
				</select>
			</div>

			<div class="filter-group">
				<label for="search-filter">Search</label>
				<input id="search-filter" type="text" placeholder="Search posts..." value={props.search} onInput={e => props.onSearchChange(e.currentTarget.value)} />
			</div>
		</div>
	);
};

export default PostFilters;
