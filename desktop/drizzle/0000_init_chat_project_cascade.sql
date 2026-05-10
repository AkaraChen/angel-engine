CREATE TABLE IF NOT EXISTS `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `projects_path_unique` ON `projects` (`path`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `chats` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`project_id` text,
	`cwd` text,
	`runtime` text NOT NULL,
	`remote_thread_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
DROP TABLE IF EXISTS `chats_cascade_next`;
--> statement-breakpoint
CREATE TABLE `chats_cascade_next` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`project_id` text,
	`cwd` text,
	`runtime` text NOT NULL,
	`remote_thread_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `chats_cascade_next` (
	`id`,
	`title`,
	`project_id`,
	`cwd`,
	`runtime`,
	`remote_thread_id`,
	`created_at`,
	`updated_at`
)
SELECT
	`id`,
	`title`,
	`project_id`,
	`cwd`,
	`runtime`,
	`remote_thread_id`,
	`created_at`,
	`updated_at`
FROM `chats`
WHERE
	`project_id` IS NULL
	OR EXISTS (
		SELECT 1
		FROM `projects`
		WHERE `projects`.`id` = `chats`.`project_id`
	);
--> statement-breakpoint
DROP TABLE `chats`;
--> statement-breakpoint
ALTER TABLE `chats_cascade_next` RENAME TO `chats`;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `chats_project_id_idx` ON `chats` (`project_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `chats_updated_at_idx` ON `chats` (`updated_at`);
