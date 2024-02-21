import { Snowflake, isSnowflake } from "discord-snowflake";
import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { NotificationSendConfig } from "../commands/notifications";

const snowflake = (name: string) => text(name).$type<Snowflake>();

export const leagues = ["khl", "pwhl", "ahl"] as const;
export type League = (typeof leagues)[number];

export const hypeMinutes = [5, 10, 20, 30, 60, 120] as const;
export type HypeMinute = (typeof hypeMinutes)[number];

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
    // channelType: integer("channelType").notNull().$type<ChannelType>().default(ChannelType.GuildText),
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

export const players = sqliteTable(
  "players",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    league: text("league").$type<League>().notNull(),
    nativeId: text("nativeId").notNull(),
    epId: text("epId"),
    epSlug: text("epSlug"),
    epImage: text("epImage"),
    fullName: text("fullName").notNull(),
    country: text("country"),
    /** Centimeters */
    height: integer("height"),
    /** Kilograms */
    weight: integer("weight"),
  },
  (table) => ({
    unq: unique().on(table.league, table.nativeId),
  }),
);
