CREATE TABLE `photo_objects` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`order_id` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `photo_objects_key` ON `photo_objects` (`object_key`);--> statement-breakpoint
CREATE INDEX `photo_objects_workspace_order_idx` ON `photo_objects` (`workspace_id`,`order_id`);