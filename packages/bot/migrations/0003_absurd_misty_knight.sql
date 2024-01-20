ALTER TABLE games ADD `lastKnownPeriodId` text;--> statement-breakpoint
ALTER TABLE games ADD `postedUnofficialFinal` integer DEFAULT false NOT NULL;