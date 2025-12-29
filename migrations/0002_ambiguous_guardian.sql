CREATE TABLE `post_projects` (
	`post_id` integer NOT NULL,
	`project_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`post_id`, `project_id`),
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);

-- Migrate existing project_id data to junction table
INSERT INTO post_projects (post_id, project_id)
SELECT id, project_id FROM posts WHERE project_id IS NOT NULL;
