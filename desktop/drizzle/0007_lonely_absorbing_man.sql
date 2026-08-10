CREATE TABLE `chat_diff_anchors` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`kind` text NOT NULL,
	`recorded_at` text NOT NULL,
	`sha` text NOT NULL,
	`turn_id` text,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_diff_anchors_chat_kind_recorded_idx` ON `chat_diff_anchors` (`chat_id`,`kind`,`recorded_at`);