ALTER TABLE `chat_messages` ADD `latency_ms` integer;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `prompt_tokens` integer;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `completion_tokens` integer;