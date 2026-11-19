CREATE TABLE `workspace_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_at` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_invites_token_hash` ON `workspace_invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `workspace_invites_email_idx` ON `workspace_invites` (`email`);--> statement-breakpoint
CREATE TABLE `workspace_members` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`joined_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_members_workspace_user` ON `workspace_members` (`workspace_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `workspace_members_user_idx` ON `workspace_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `workspace_state` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`data_json` text,
	`version` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`created_at` text NOT NULL
);
