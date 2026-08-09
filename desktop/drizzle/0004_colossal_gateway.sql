CREATE TABLE `worktree_creation_jobs` (
	`chat_id` text PRIMARY KEY NOT NULL,
	`error` text,
	`job_id` text NOT NULL,
	`progress` integer NOT NULL,
	`setup_approval` text,
	`stage` text NOT NULL,
	`status` text NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);
