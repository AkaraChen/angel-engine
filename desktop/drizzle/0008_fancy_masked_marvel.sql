ALTER TABLE `chats` ADD `source_link` text;--> statement-breakpoint
ALTER TABLE `worktree_creation_jobs` ADD `error_code` text;--> statement-breakpoint
ALTER TABLE `worktree_creation_jobs` ADD `related_chat_id` text;--> statement-breakpoint
ALTER TABLE `worktree_creation_jobs` ADD `worktree_ref` text;