DROP INDEX IF EXISTS `pickems_votes_guildId_userId_league_gameId_unique`;--> statement-breakpoint
ALTER TABLE pickems_polls ADD `seasonId` text NOT NULL;--> statement-breakpoint
ALTER TABLE pickems_votes ADD `seasonId` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `pickems_votes_guildId_userId_league_seasonId_gameId_unique` ON `pickems_votes` (`guildId`,`userId`,`league`,`seasonId`,`gameId`);