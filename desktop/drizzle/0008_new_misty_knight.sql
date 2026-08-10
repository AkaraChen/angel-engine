CREATE TABLE `shepherd_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	`pr_number` integer NOT NULL,
	`head_sha` text,
	`state` text NOT NULL,
	`settled_reason` text,
	`round` integer DEFAULT 0 NOT NULL,
	`max_rounds` integer DEFAULT 10 NOT NULL,
	`consecutive_no_progress` integer DEFAULT 0 NOT NULL,
	`handled_fingerprints` text NOT NULL,
	`baseline_snapshot` text,
	`pending_prompt` text,
	`pending_fingerprints` text NOT NULL,
	`last_sent_head_sha` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shepherd_sessions_chat_id_unique` ON `shepherd_sessions` (`chat_id`);