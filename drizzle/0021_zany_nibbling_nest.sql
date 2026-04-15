CREATE TABLE `chat_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`summary` text NOT NULL,
	`trigger` text DEFAULT 'finalize' NOT NULL,
	`vault_path` text,
	`vault_written` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `chats` ADD `bucket` text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE `chats` ADD `vault_path` text;