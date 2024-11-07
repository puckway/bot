CREATE TABLE `pickems` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guildId` text NOT NULL,
	`channelId` text,
	`league` text NOT NULL,
	`teamIds` text NOT NULL,
	`active` integer DEFAULT false
);
--> statement-breakpoint
CREATE TABLE `pickems_polls` (
	`guildId` text NOT NULL,
	`channelId` text NOT NULL,
	`messageId` text PRIMARY KEY NOT NULL,
	`league` text NOT NULL,
	`gameId` text NOT NULL,
	`day` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pickems_votes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`league` text NOT NULL,
	`gameId` text NOT NULL,
	`voteTeamId` text NOT NULL,
	`winningTeamId` text NOT NULL,
	`guildId` text NOT NULL,
	`userId` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pickems_league_guildId_unique` ON `pickems` (`league`,`guildId`);--> statement-breakpoint
CREATE UNIQUE INDEX `pickems_votes_guildId_userId_league_gameId_unique` ON `pickems_votes` (`guildId`,`userId`,`league`,`gameId`);