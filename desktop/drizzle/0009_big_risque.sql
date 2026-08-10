CREATE TABLE `pull_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`chat_id` text,
	`root` text NOT NULL,
	`branch` text NOT NULL,
	`base_branch` text NOT NULL,
	`number` integer NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`is_draft` integer DEFAULT false NOT NULL,
	`state` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pull_requests_root_branch_idx` ON `pull_requests` (`root`,`branch`);