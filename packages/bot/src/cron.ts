import { REST } from "@discordjs/rest";
import {
  APIEntitlement,
  APIMessage,
  APIThreadChannel,
  ChannelType,
  RESTPostAPIChannelMessageJSONBody,
  RESTPostAPIChannelThreadsJSONBody,
  Routes,
  ThreadAutoArchiveDuration,
} from "discord-api-types/v10";
import { and, eq, inArray } from "drizzle-orm";
import { GamesByDate } from "hockeytech";
import { getDb } from "./db";
import { notifications } from "./db/schema";
import { getHtClient, HockeyTechLeague } from "./ht/client";
import { getTeamPartialEmoji } from "./util/emojis";
import { isDiscordError } from "./util/errors";
import { getNow } from "./util/time";

export type NotificationEntry = Pick<
  typeof notifications.$inferSelect,
  "guildId" | "channelId" | "league" | "teamIds" | "sendConfig"
>;

const runPickems = async (
  env: Env,
  allEntries: NotificationEntry[],
  league: HockeyTechLeague,
  games: GamesByDate[],
) => {
  if (games.length === 0) return;

  const teamIds = games
    .flatMap((game) => [game.home_team, game.visiting_team])
    // Realistically a team would not play twice in the same day
    .filter((id, i, a) => a.indexOf(id) === i);

  const entries = allEntries.filter(
    (entry) =>
      // Only keep entries for teams that are playing on this day
      entry.teamIds.filter((id) => teamIds.includes(id)).length !== 0 &&
      // ... and have pickems enabled
      entry.sendConfig.pickems === true,
  );
  if (entries.length === 0) return;

  const sortedGames = [...games].sort((a, b) => {
    return (
      new Date(a.date_played).getTime() - new Date(b.date_played).getTime()
    );
  });
  const firstStart = new Date(sortedGames[0].date_played);

  const rest = new REST().setToken(env.DISCORD_TOKEN);
  for (const entry of entries) {
    const entryGames = games.filter(
      (game) =>
        entry.teamIds.includes(game.home_team) ||
        entry.teamIds.includes(game.visiting_team),
    );
    // This shouldn't happen
    if (entryGames.length === 0) continue;

    try {
      const thread = (await rest.post(Routes.threads(entry.channelId), {
        body: {
          name: `${league.toUpperCase()} Pickems - ${firstStart.toLocaleDateString(
            "en-US",
            {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            },
          )}`,
          auto_archive_duration: ThreadAutoArchiveDuration.OneWeek,
          type: ChannelType.PublicThread,
        } satisfies RESTPostAPIChannelThreadsJSONBody,
      })) as APIThreadChannel;

      for (const game of entryGames) {
        const homeEmoji = getTeamPartialEmoji(league, game.home_team);
        const awayEmoji = getTeamPartialEmoji(league, game.visiting_team);

        const now = getNow();
        const start = new Date(game.date_played);
        const hours = Math.round((start.getTime() - now.getTime()) / 3_600_000);

        // TODO: store poll message ID and refer to it later for points/leaderboards
        (await rest.post(Routes.channelMessages(thread.id), {
          body: {
            // I want to include the game start time here somehow
            // without making the thread preview ugly
            // content: `<t:${Math.floor(start.getTime() / 1000)}:f>`,
            poll: {
              question: {
                text: `${game.visiting_team_nickname} @ ${game.home_team_nickname}`.slice(
                  0,
                  300,
                ),
              },
              allow_multiselect: false,
              duration: hours,
              answers: [
                {
                  poll_media: {
                    emoji: {
                      id: awayEmoji.id ?? null,
                      name: awayEmoji.name ?? null,
                      animated: awayEmoji.animated,
                    },
                    text: game.visiting_team_name.slice(0, 55),
                  },
                },
                {
                  poll_media: {
                    emoji: {
                      id: homeEmoji.id ?? null,
                      name: homeEmoji.name ?? null,
                      animated: homeEmoji.animated,
                    },
                    text: game.home_team_name.slice(0, 55),
                  },
                },
              ],
            },
          } satisfies RESTPostAPIChannelMessageJSONBody,
        })) as APIMessage;
      }
    } catch (e) {
      if (isDiscordError(e)) {
        // Probably a permission error
        return;
      }
      console.error(e);
    }
  }
};

const notificationLeagues = ["pwhl", "ahl"] satisfies HockeyTechLeague[];

export const dailyInitNotifications = async (
  _event: ScheduledEvent,
  env: Env,
  _ctx: ExecutionContext,
) => {
  const now = getNow();
  const tomorrow = new Date(now.getTime() + 86_400_000);
  const weekFromNow = new Date(now.getTime() + 604_800_000);
  const weekFromNowDay = `${weekFromNow.getFullYear()}-${
    weekFromNow.getMonth() + 1
  }-${weekFromNow.getDate()}`;

  const db = getDb(env.DB);
  const allEntries = (await db.query.notifications.findMany({
    where: and(
      eq(notifications.active, true),
      inArray(notifications.league, notificationLeagues),
    ),
    columns: {
      league: true,
      channelId: true,
      teamIds: true,
      sendConfig: true,
      guildId: true,
    },
  })) satisfies NotificationEntry[];

  const allGuildIds = allEntries
    .map((entry) => entry.guildId)
    .filter(
      (id, i, a): id is `${bigint}` => id !== null && a.indexOf(id) === i,
    );
  let premiumGuildIds = new Set<string>();
  const skus = [env.MONTHLY_SKU, env.LIFETIME_SKU].filter(Boolean);
  if (skus.length !== 0) {
    const rest = new REST().setToken(env.DISCORD_TOKEN);

    let after: string | undefined;
    const limit = 100;
    while (true) {
      const page = (await rest.get(
        Routes.entitlements(env.DISCORD_APPLICATION_ID),
        {
          query: new URLSearchParams({
            after: after ?? "",
            limit: String(limit),
            exclude_ended: "true",
            sku_ids: skus.join(","),
          }),
        },
      )) as APIEntitlement[];
      if (page.length !== 0) {
        after = page[page.length - 1].id;
        for (const entitlement of page) {
          if (entitlement.guild_id) {
            premiumGuildIds.add(entitlement.guild_id);
          }
        }
      }
      if (page.length < limit) break;
    }
  } else {
    premiumGuildIds = new Set(allGuildIds);
  }

  const premiumEntries = allEntries.filter(
    (entry) => entry.guildId && premiumGuildIds.has(entry.guildId),
  );

  for (const league of notificationLeagues) {
    // Notifications (tomorrow; avoid missing early games)
    // The durable object will give itself more precise times to check at
    const day = `${tomorrow.getFullYear()}-${
      tomorrow.getMonth() + 1
    }-${tomorrow.getDate()}`;
    const stub = env.NOTIFICATIONS.get(
      env.NOTIFICATIONS.idFromName(`${league}-${day}`),
    );
    await stub.fetch("http://do/", {
      method: "POST",
      body: JSON.stringify({ day, league }),
      headers: { "Content-Type": "application/json" },
    });

    // Pickems (7 days from now)
    if (premiumEntries.length !== 0) {
      const client = getHtClient(league);
      try {
        const now = getNow();
        const games = (
          await client.getDailySchedule(weekFromNowDay)
        ).SiteKit.Gamesbydate.filter((game) => {
          const diff = new Date(game.date_played).getTime() - now.getTime();
          // Discord bounds: 1-768 hours
          return diff > 3_600_000 && diff < 2_764_800_000;
        });
        if (games.length === 0) continue;

        await runPickems(env, premiumEntries, league, games);
      } catch (e) {
        console.error(e);
      }
    }
  }
};
