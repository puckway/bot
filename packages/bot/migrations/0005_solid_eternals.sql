CREATE TABLE `players` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`league` text NOT NULL,
	`nativeId` text NOT NULL,
	`epId` text,
	`epSlug` text,
	`fullName` text NOT NULL,
	`country` text,
	`height` integer,
	`weight` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `players_league_nativeId_unique` ON `players` (`league`,`nativeId`);