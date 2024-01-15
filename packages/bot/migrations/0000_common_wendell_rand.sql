CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`league` text NOT NULL,
	`channelId` text NOT NULL,
	`teamIds` text NOT NULL,
	`send` text NOT NULL,
	`active` integer DEFAULT true
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_league_channelId_unique` ON `notifications` (`league`,`channelId`);