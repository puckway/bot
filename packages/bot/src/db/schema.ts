import { Snowflake, isSnowflake } from "discord-snowflake";
import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { NotificationSendConfig } from "../commands/notifications";

const snowflake = (name: string) => text(name).$type<Snowflake>();

export type League = "khl" | "pwhl";

/** Assert that `id` is a snowflake and return the appropriately typed value */
export const makeSnowflake = (id: string): Snowflake => {
  if (isSnowflake(id)) return id;
  throw new Error(`${id} is not a snowflake.`);
};

export const notifications = sqliteTable(
  "notifications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    league: text("league").$type<League>().notNull(),
    channelId: snowflake("channelId").notNull(),
    teamIds: text("teamIds", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
    sendConfig: text("send", { mode: "json" })
      .$type<NotificationSendConfig>()
      .notNull()
      .default({}),
    active: integer("active", { mode: "boolean" }).default(true),
  },
  (table) => ({
    unq: unique().on(table.league, table.channelId),
  }),
);
