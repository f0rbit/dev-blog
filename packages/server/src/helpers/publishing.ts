// Publishing status helpers - pure functions for determining post visibility

export const isPublished = (publishedAt: Date | null): boolean => {
	if (!publishedAt) return false;
	return publishedAt.getTime() <= Date.now();
};

export const isScheduled = (publishedAt: Date | null): boolean => {
	if (!publishedAt) return false;
	return publishedAt.getTime() > Date.now();
};

export const isDraft = (publishedAt: Date | null): boolean => publishedAt === null;
