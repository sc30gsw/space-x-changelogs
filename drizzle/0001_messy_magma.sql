CREATE TABLE `entries_scoped` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL REFERENCES `projects`(`id`) ON DELETE cascade,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `entries_scoped` (`id`, `project_id`, `title`, `body`, `created_at`)
SELECT `id`, `project_id`, `title`, `body`, `created_at`
FROM `entries`
WHERE `project_id` IN (SELECT `id` FROM `projects`);
--> statement-breakpoint
DROP TABLE `entries`;
--> statement-breakpoint
ALTER TABLE `entries_scoped` RENAME TO `entries`;
