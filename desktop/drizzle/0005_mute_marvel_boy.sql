CREATE TABLE `queued_chat_runs` (
	`run_id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`created_at` text NOT NULL,
	`input` text NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `queued_chat_runs_chat_id_unique` ON `queued_chat_runs` (`chat_id`);--> statement-breakpoint
CREATE INDEX `queued_chat_runs_chat_id_idx` ON `queued_chat_runs` (`chat_id`);