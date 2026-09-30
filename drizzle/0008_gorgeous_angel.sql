ALTER TABLE `chat_threads` ADD `titled` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- Backfill: a thread that already carries a title someone or something chose
-- is settled. Without this every existing thread would read as untitled and be
-- re-titled by the model on its next turn, overwriting user renames.
UPDATE `chat_threads` SET `titled` = 1 WHERE `title` <> 'New chat';
