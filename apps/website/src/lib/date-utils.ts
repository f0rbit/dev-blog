export const formatDate = (dateStr: string): string => {
	const date = new Date(dateStr);
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
};

export const relativeTime = (dateStr: string): string => {
	const date = new Date(dateStr);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffSeconds = Math.floor(diffMs / 1000);
	const diffMinutes = Math.floor(diffSeconds / 60);
	const diffHours = Math.floor(diffMinutes / 60);
	const diffDays = Math.floor(diffHours / 24);
	const diffWeeks = Math.floor(diffDays / 7);
	const diffMonths = Math.floor(diffDays / 30);

	if (diffSeconds < 60) return "just now";
	if (diffMinutes < 60) return diffMinutes === 1 ? "1 minute ago" : `${diffMinutes} minutes ago`;
	if (diffHours < 24) return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
	if (diffDays < 7) return diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;
	if (diffWeeks < 4) return diffWeeks === 1 ? "1 week ago" : `${diffWeeks} weeks ago`;
	return diffMonths === 1 ? "1 month ago" : `${diffMonths} months ago`;
};
