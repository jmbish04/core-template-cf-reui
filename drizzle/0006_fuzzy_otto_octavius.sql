CREATE TABLE `chat_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`title` text DEFAULT 'Untitled document' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_documents_thread_id_unique` ON `chat_documents` (`thread_id`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`mime_type` text,
	`size` integer,
	`r2_key` text,
	`owner` text DEFAULT 'You' NOT NULL,
	`starred` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `files_parent_idx` ON `files` (`parent_id`);