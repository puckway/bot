CREATE TABLE `games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`league` text NOT NULL,
	`nativeId` text NOT NULL,
	`lastKnownAwayGoals` integer DEFAULT 0,
	`lastKnownHomeGoals` integer DEFAULT 0,
	`postedPreview` integer DEFAULT false NOT NULL,
	`postedFinal` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
/*
 SQLite does not support "Set default to column" out of the box, we do not generate automatic migration for that, so it has to be done manually
 Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php
                  https://www.sqlite.org/lang_altertable.html
                  https://stackoverflow.com/questions/2083543/modify-a-columns-type-in-sqlite3

 Due to that we don't generate migration automatically and it has to be done manually
*/--> statement-breakpoint
CREATE UNIQUE INDEX `games_league_nativeId_unique` ON `games` (`league`,`nativeId`);