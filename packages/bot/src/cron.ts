import { RequestMethod, REST, RouteLike } from "@discordjs/rest";
import {
  APIEntitlement,
  APIMessage,
  APIThreadChannel,
  APIUser,
  ChannelType,
  MessageType,
  RESTGetAPIPollAnswerVotersResult,
  RESTPostAPIChannelMessageJSONBody,
  RESTPostAPIChannelThreadsJSONBody,
  Routes,
  ThreadAutoArchiveDuration,
} from "discord-api-types/v10";
import { and, eq, inArray, sql } from "drizzle-orm";
import { GamesByDate } from "hockeytech";
import { DBWithSchema, getDb } from "./db";
import {
  League,
  notifications,
  pickems,
  pickemsPolls,
  pickemsVotes,
} from "./db/schema";
import { getHtClient, HockeyTechLeague } from "./ht/client";
import { getTeamPartialEmoji } from "./util/emojis";
import { isDiscordError } from "./util/errors";
import { getNow } from "./util/time";
import type { Snowflake } from "discord-snowflake";
import { uni } from "./util/l10n";

export type NotificationEntry = Pick<
  typeof notifications.$inferSelect,
  "guildId" | "channelId" | "league" | "teamIds" | "sendConfig"
>;

const paginateDiscordRequest = async <T, R extends Array<unknown> = T[]>(
  rest: REST,
  route: RouteLike,
  query: Record<string, string>,
  options?: {
    /** Before attempting to get the key, this is called on the raw result (for nested arrays) */
    postprocessor?: (result: T) => R;
    /** Resolve `after` from the last result in the response, useful if it isn't `.id` */
    // getAfterKey?: (result: T) => string;
  },
): Promise<R> => {
  if (!query.limit)
    throw Error("Limit (page size) must be provided for pagination");

  const limit = Number(query.limit);
  let after: string | undefined;
  const results = [] as unknown as R;
  while (true) {
    const params = new URLSearchParams({
      ...query,
      limit: String(limit),
    });
    if (after) {
      params.set("after", after);
    }

    const pageRaw = await rest.request({
      method: RequestMethod.Get,
      fullRoute: route,
      query: params,
    });
    // If we have a postprocessor, `R` is not `T[]`. The default behavior is
    // for routes whose responses are a flat array, as opposed to nested
    // pagination routes like `Get Answer Voters`
    const page = options?.postprocessor
      ? options.postprocessor(pageRaw as T)
      : (pageRaw as R);

    if (page.length !== 0) {
      const lastItem = page[page.length - 1] as T;

      // TODO: better typing for this param
      // const key = options?.getAfterKey
      //   ? options.getAfterKey(lastItem)
      //   : (lastItem as { id: string }).id;

      // @ts-expect-error
      const key = lastItem.id;
      if (!key) {
        throw Error(
          "`getAfterKey` must be provided when paginating items without an `id`",
        );
      }
      after = key;
      results.push(...page);
    }
    if (page.length < limit) break;
  }
  return results;
};

const runPickems = async (
  env: Env,
  db: DBWithSchema,
  allEntries: {
    league: League;
    guildId: Snowflake;
    channelId: Snowflake;
    teamIds: string[];
  }[],
  league: HockeyTechLeague,
  games: GamesByDate[],
) => {
  if (games.length === 0) return;

  const teamIds = games
    .flatMap((game) => [game.home_team, game.visiting_team])
    // Realistically a team would not play twice in the same day (except maybe
    // NHL prospect games which I don't think would have season associations?)
    .filter((id, i, a) => a.indexOf(id) === i);

  // Only keep entries for teams that are playing on this day
  const entries = allEntries.filter(
    (entry) => entry.teamIds.filter((id) => teamIds.includes(id)).length !== 0,
  );
  if (entries.length === 0) return;

  const sortedGames = [...games].sort((a, b) => {
    return (
      new Date(a.date_played).getTime() - new Date(b.date_played).getTime()
    );
  });
  const firstStart = new Date(sortedGames[0].date_played);

  const pollInsertEntries: (typeof pickemsPolls.$inferInsert)[] = [];
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
          name: `${uni("en", league)} Pickems - ${firstStart.toLocaleDateString(
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
        const hours = Math.ceil((start.getTime() - now.getTime()) / 3_600_000);

        try {
          const pollMsg = (await rest.post(Routes.channelMessages(thread.id), {
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
          pollInsertEntries.push({
            guildId: entry.guildId as Snowflake,
            channelId: pollMsg.channel_id as Snowflake,
            messageId: pollMsg.id as Snowflake,
            league: entry.league,
            seasonId: game.season_id,
            gameId: game.id,
            day: game.date_played,
          });
        } catch (e) {
          console.error(e);
          break;
        }
      }
    } catch (e) {
      console.error(e);
    }
  }
  if (pollInsertEntries.length !== 0) {
    await db
      .insert(pickemsPolls)
      .values(pollInsertEntries)
      .onConflictDoNothing();
  }
};

const savePickemsPredictions = async (
  env: Env,
  db: DBWithSchema,
  allEntries: {
    league: League;
    guildId: Snowflake;
    channelId: Snowflake;
    messageId: Snowflake;
    gameId: string;
  }[],
  league: HockeyTechLeague,
  games: GamesByDate[],
) => {
  if (games.length === 0) return;

  const rest = new REST().setToken(env.DISCORD_TOKEN);

  const processedPollMessageIds = new Set<Snowflake>();
  const channelIds = allEntries
    .map((e) => e.channelId)
    .filter((c, i, a) => a.indexOf(c) === i);
  const pollMessageIds = allEntries
    .map((e) => e.messageId)
    .filter((c, i, a) => a.indexOf(c) === i);
  for (const channelId of channelIds) {
    try {
      const messages = (await rest.get(Routes.channelMessages(channelId), {
        query: new URLSearchParams({ limit: "100" }),
      })) as APIMessage[];

      // Clean up automatic messages stating the poll closed. Normally this
      // wouldn't matter but they're phrased like "x won" which can be kind
      // of confusing
      const pollClosedMsgs = messages.filter(
        (message) =>
          message.author.id === env.DISCORD_APPLICATION_ID &&
          message.type === MessageType.PollResult &&
          message.message_reference?.message_id &&
          pollMessageIds.includes(
            message.message_reference.message_id as Snowflake,
          ),
      );

      if (pollClosedMsgs.length === 1) {
        await rest.delete(
          Routes.channelMessage(channelId, pollClosedMsgs[0].id),
        );
      } else if (pollClosedMsgs.length > 1) {
        await rest.post(Routes.channelBulkDelete(channelId), {
          body: { messages: pollClosedMsgs.map((m) => m.id) },
          reason: `Poll result cleanup (${uni("en", league)})`,
        });
      }
    } catch (e) {
      if (isDiscordError(e)) {
        // Probably a permission error
        continue;
      }
      console.error(e);
    }
  }

  // for (const channelId of channelIds) {
  //   const entries = allEntries.filter((e) => e.channelId === channelId);
  //   // We need to get all the polls at once to get all the answer IDs.
  //   // There are going to be a lot of API requests here.
  //   try {
  //     const messages = (await rest.get(Routes.channelMessages(channelId), {
  //       // There probably won't be 100 games in one day, but this compensates
  //       // for moderators talking in the thread amidst the polls.
  //       query: new URLSearchParams({ limit: "100" }),
  //     })) as APIMessage[];
  //     const pollMsgs = messages.filter(
  //       (
  //         message,
  //       ): message is APIMessage & {
  //         poll: NonNullable<APIMessage["poll"]>;
  //       } => message.author.id === env.DISCORD_APPLICATION_ID && !!message.poll,
  //     );

  //     for (const { id: messageId, poll } of pollMsgs) {
  //       const awayAnswerId = poll.answers[0].answer_id;
  //       const homeAnswerId = poll.answers[1].answer_id;
  //       // Check results
  //     }
  //   } catch (e) {
  //     if (isDiscordError(e)) {
  //       // Probably a permission error
  //       continue;
  //     }
  //     console.error(e);
  //   }
  // }

  const resultsInsertEntries: (typeof pickemsVotes.$inferInsert)[] = [];
  for (const entry of allEntries) {
    try {
      const game = games.find((g) => g.id === entry.gameId);
      // Bad day?
      if (!game) continue;

      // https://discord.dev/resources/poll#poll-answer-object
      // Better to not rely on this sequence, but it saves us a good few API
      // requests, so we're going to do this until it looks like it will be
      // broken. Above is commented code for using the message data instead.
      const awayAnswerId = 1;
      const homeAnswerId = 2;

      const awayVoters = await paginateDiscordRequest<
        RESTGetAPIPollAnswerVotersResult,
        APIUser[]
      >(
        rest,
        Routes.pollAnswerVoters(entry.channelId, entry.messageId, awayAnswerId),
        { limit: "100" },
        { postprocessor: (result) => result.users },
      );
      const homeVoters = await paginateDiscordRequest<
        RESTGetAPIPollAnswerVotersResult,
        APIUser[]
      >(
        rest,
        Routes.pollAnswerVoters(entry.channelId, entry.messageId, homeAnswerId),
        { limit: "100" },
        { postprocessor: (result) => result.users },
      );

      const awayGoals = Object.values(game.visiting_team_goals_by_period)
        .map(Number)
        .reduce((prev, cur) => prev + cur, 0);
      const homeGoals = Object.values(game.home_team_goals_by_period)
        .map(Number)
        .reduce((prev, cur) => prev + cur, 0);
      const winningTeamId =
        homeGoals > awayGoals ? game.home_team : game.visiting_team;

      const resultBase: Pick<
        typeof pickemsVotes.$inferInsert,
        "seasonId" | "gameId" | "guildId" | "league" | "winningTeamId"
      > = {
        guildId: entry.guildId,
        league,
        gameId: game.id,
        seasonId: game.season_id,
        winningTeamId,
      };
      for (const voter of awayVoters) {
        resultsInsertEntries.push({
          ...resultBase,
          voteTeamId: game.visiting_team,
          userId: voter.id as Snowflake,
        });
      }
      for (const voter of homeVoters) {
        resultsInsertEntries.push({
          ...resultBase,
          voteTeamId: game.home_team,
          userId: voter.id as Snowflake,
        });
      }
      processedPollMessageIds.add(entry.messageId);
    } catch (e) {
      if (isDiscordError(e)) {
        // Probably a permission error or the thread was deleted
        continue;
      }
      console.error(e);
    }
  }

  if (resultsInsertEntries.length !== 0) {
    await db
      .insert(pickemsVotes)
      .values(resultsInsertEntries)
      .onConflictDoUpdate({
        target: [
          pickemsVotes.guildId,
          pickemsVotes.userId,
          pickemsVotes.league,
          pickemsVotes.seasonId,
          pickemsVotes.gameId,
        ],
        set: {
          voteTeamId: sql`excluded."voteTeamId"`,
          winningTeamId: sql`excluded."winningTeamId"`,
        },
      });
  }
  if (processedPollMessageIds.size !== 0) {
    await db
      .delete(pickemsPolls)
      .where(
        inArray(pickemsPolls.messageId, Array.from(processedPollMessageIds)),
      );
  }
};

const notificationLeagues = ["pwhl", "ahl"] satisfies HockeyTechLeague[];

export const dailyInitNotifications = async (
  _event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext,
) => {
  const now = getNow();
  const db = getDb(env.DB);
  const allEntries = await db.query.pickems.findMany({
    where: and(
      eq(pickems.active, true),
      inArray(pickems.league, notificationLeagues),
    ),
    columns: {
      league: true,
      channelId: true,
      teamIds: true,
      guildId: true,
    },
  });

  const allGuildIds = allEntries
    .map((entry) => entry.guildId)
    .filter((id, i, a): id is Snowflake => id !== null && a.indexOf(id) === i);
  let premiumGuildIds = new Set<Snowflake>();
  const skus = [env.MONTHLY_SKU, env.LIFETIME_SKU].filter(Boolean);
  if (skus.length !== 0) {
    const rest = new REST().setToken(env.DISCORD_TOKEN);
    const entitlements = await paginateDiscordRequest<APIEntitlement>(
      rest,
      Routes.entitlements(env.DISCORD_APPLICATION_ID),
      { limit: "100", exclude_ended: "true", sku_ids: skus.join(",") },
    );
    for (const entitlement of entitlements) {
      if (entitlement.guild_id) {
        premiumGuildIds.add(entitlement.guild_id as Snowflake);
      }
    }
  } else {
    premiumGuildIds = new Set(allGuildIds);
  }

  const premiumEntries = allEntries.filter(
    (entry) => entry.guildId && premiumGuildIds.has(entry.guildId),
  );

  const weekFromNow = new Date(now.getTime() + 604_800_000);
  const weekFromNowDay = `${weekFromNow.getFullYear()}-${
    weekFromNow.getMonth() + 1
  }-${weekFromNow.getDate()}`;

  const yesterday = new Date(now.getTime() - 86_400_000);
  const yesterdayDay = `${yesterday.getFullYear()}-${
    yesterday.getMonth() + 1
  }-${yesterday.getDate()}`;

  const allPolls =
    premiumGuildIds.size === 0
      ? []
      : await db.query.pickemsPolls.findMany({
          where: and(
            inArray(pickemsPolls.league, notificationLeagues),
            inArray(pickemsPolls.guildId, Array.from(premiumGuildIds)),
            eq(pickemsPolls.day, yesterdayDay),
          ),
          columns: {
            league: true,
            guildId: true,
            channelId: true,
            messageId: true,
            gameId: true,
          },
        });

  const tomorrow = new Date(now.getTime() + 86_400_000);
  for (const league of notificationLeagues) {
    // Notifications (tomorrow; avoid missing early games)
    // The durable object will give itself more precise times to check at
    try {
      const day = `${tomorrow.getFullYear()}-${
        tomorrow.getMonth() + 1
      }-${tomorrow.getDate()}`;
      const stub = env.NOTIFICATIONS.get(
        env.NOTIFICATIONS.idFromName(`${league}-${day}`),
      );
      ctx.waitUntil(
        stub
          .fetch("http://do/", {
            method: "POST",
            body: JSON.stringify({ day, league }),
            headers: { "Content-Type": "application/json" },
          })
          .catch(console.error),
      );
    } catch (e) {
      console.error(
        `[${league}] [${tomorrow}] Error starting notifications:`,
        e,
      );
    }

    // Pickems (7 days from now)
    try {
      const client = getHtClient(league);
      const leagueEntries = premiumEntries.filter(
        (e): e is typeof e & { channelId: Snowflake } =>
          e.league === league && e.channelId !== null,
      );
      if (leagueEntries.length !== 0) {
        // Run next week's game polls
        ctx.waitUntil(
          (async () => {
            try {
              const now = getNow();
              const games = (
                await client.getDailySchedule(weekFromNowDay)
              ).SiteKit.Gamesbydate.filter((game) => {
                const diff =
                  new Date(game.date_played).getTime() - now.getTime();
                // Discord bounds: 1-768 hours
                return diff > 3_600_000 && diff < 2_764_800_000;
              });
              if (games.length === 0) return;

              await runPickems(env, db, leagueEntries, league, games);
            } catch (e) {
              console.error(e);
            }
          })(),
        );
      }
      // Save yesterday's predictions
      // We could move this to the event handler for the final period if we ever
      // have a more reliable-feeling event delivery system.
      const leaguePolls = allPolls.filter((e) => e.league === league);
      if (leaguePolls.length !== 0) {
        ctx.waitUntil(
          (async () => {
            try {
              const games = (await client.getDailySchedule(yesterdayDay))
                .SiteKit.Gamesbydate;
              if (games.length === 0) return;

              await savePickemsPredictions(env, db, leaguePolls, league, games);
            } catch (e) {
              console.error(e);
            }
          })(),
        );
      }
    } catch (e) {
      console.error(`[${league}] [${tomorrow}] Error running pickems:`, e);
    }
  }
};
