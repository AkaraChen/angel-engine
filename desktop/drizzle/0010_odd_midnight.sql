CREATE TABLE `automation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`automation_id` text NOT NULL,
	`chat_id` text,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`scheduled_for` text,
	`started_at` text NOT NULL,
	`finished_at` text,
	`error` text,
	FOREIGN KEY (`automation_id`) REFERENCES `automations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `automation_runs_automation_started_idx` ON `automation_runs` (`automation_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `automation_runs_chat_id_idx` ON `automation_runs` (`chat_id`);--> statement-breakpoint
CREATE TABLE `automations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`cron` text NOT NULL,
	`prompt` text NOT NULL,
	`runtime` text NOT NULL,
	`project_id` text,
	`workspace_kind` text DEFAULT 'project' NOT NULL,
	`notify_on_failure` integer DEFAULT true NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`next_run_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `automations_enabled_next_run_idx` ON `automations` (`enabled`,`next_run_at`);--> statement-breakpoint
CREATE INDEX `automations_project_id_idx` ON `automations` (`project_id`);