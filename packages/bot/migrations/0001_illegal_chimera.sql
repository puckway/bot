CREATE TABLE `games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`league` text NOT NULL,
	`nativeId` text NOT NULL,
	`lastKnownAwayGoals` integer DEFAULT 0,
	`lastKnownHomeGoals` integer DEFAULT 0,
	`postedPreview` integer DEFAULT false NOT NULL,
	`postedFinal` integer DEFAULT false NOT NULL
);
CREATE UNIQUE INDEX `games_league_nativeId_unique` ON `games` (`league`,`nativeId`);