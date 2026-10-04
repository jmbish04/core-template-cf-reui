CREATE TABLE IF NOT EXISTS `passkey_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`challenge` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `passkey_challenges_challenge_unique` ON `passkey_challenges` (`challenge`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `passkey_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`credential_id` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`transports` text,
	`device_type` text,
	`backed_up` integer DEFAULT false NOT NULL,
	`label` text,
	`created_at` integer NOT NULL,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `passkey_credentials_credential_id_unique` ON `passkey_credentials` (`credential_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `passkey_handoffs` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`origin_user_agent` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`approved_at` integer,
	`consumed_at` integer,
	`credential_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `passkey_handoffs_token_unique` ON `passkey_handoffs` (`token`);