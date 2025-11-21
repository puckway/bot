import {
  ActionRowBuilder,
  ButtonBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  time,
} from "@discordjs/builders";
import {
  type APIActionRowComponent,
  type APIChatInputApplicationCommandInteraction,
  type APIComponentInMessageActionRow,
  ButtonStyle,
  ComponentType,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  MessageFlags,
  type RESTGetAPIGuildScheduledEventsResult,
  Routes,
} from "discord-api-types/v10";
import { PermissionFlags } from "discord-bitflag";
import { GameStatus, type GamesByDate, type Schedule } from "hockeytech";
import type { ChatInputAppCommandCallback } from "../commands";
import type {
  ButtonCallback,
  MinimumKVComponentState,
  SelectMenuCallback,
} from "../components";
import type { League } from "../db/schema";
import {
  getHtClient,
  type HockeyTechLeague,
  hockeyTechLeagues,
} from "../ht/client";
import { leagueTeams } from "../ht/teams";
import type { InteractionContext } from "../interactions";
import { colors } from "../util/colors";
import { storeComponents } from "../util/components";
import { getLeagueLogoUrl, getTeamEmoji } from "../util/emojis";
import { transformLocalizations, uni } from "../util/l10n";
import { getNow, getOffset, sleep } from "../util/time";

export const DATE_REGEX = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

const s = transformLocalizations({
  en: {
    badDate: "Invalid date. Must follow the format `YYYY-MM-DD`.",
    schedule: "Schedule",
    gameDay: "Game Day",
    noGames: "No games on this date.",
    today: "Today",
    missingPermissions: "You are missing permissions:",
    notGuild: "You must be in a server to do that.",
    noSchedulableGames: "There are no applicable games to import.",
  },
  ru: {
    schedule: "Календарь",
    today: "Сегодня",
  },
  cn: {
    schedule: "赛程",
    today: "今天",
  },
  fr: {
    schedule: "Horaire",
    gameDay: "Jour de match",
    noGames: "Aucun jeux trouvé",
    today: "Aujourd'hui",
  },
});

export const isoDate = (
  game: Pick<
    GamesByDate | Schedule,
    "date_played" | "schedule_time" | "timezone"
  >,
) => `${game.date_played}T${game.schedule_time}${getOffset(game.timezone)}`;

const getPaginatedStrings = <T>(
  data: T[],
  formatter: (item: T) => string,
  options: {
    maxLength: number;
    separator?: string;
  },
): string[] => {
  const sep = options.separator ?? "";
  const pages = [];
  let lines: string[] = [];
  for (const item of data) {
    const formatted = formatter(item);
    if (formatted.length > options.maxLength) {
      // Maybe in the future I'll make this more advanced (roll the string
      // onto the next page) but it's not necessary for now
      throw Error(
        `Single item is longer than max length for an entire page: ${options.maxLength} < ${formatted}`,
      );
    }

    if ([...lines, formatted].join(sep).length > options.maxLength) {
      pages.push(lines.join(sep));
      lines = [formatted];
    } else {
      lines.push(formatted);
    }
  }
  // Remaining data that wasn't too long
  if (lines.length !== 0) {
    pages.push(lines.join(sep));
  }
  return pages;
};

const sendScheduleMessage = async (
  ctx: InteractionContext<APIChatInputApplicationCommandInteraction>,
  games: (GamesByDate | Schedule)[],
  displayDate: Date | string,
  page?: number,
) => {
  const league = ctx.getStringOption("league").value as League;
  const teamId = ctx.getStringOption("team")?.value;
  const team = teamId
    ? leagueTeams[league].find((t) => t.id === teamId)
    : undefined;
  const subcommand = ctx.interaction.data.options?.[0].name;

  const title = `${s(ctx, "schedule")}${team ? ` - ${team.nickname}` : ""} - ${
    typeof displayDate === "string"
      ? displayDate
      : displayDate.toLocaleString(ctx.getLocale(), {
          month: "long",
          day: subcommand === "day" ? "numeric" : undefined,
          year: "numeric",
          timeZone: games[0]?.timezone,
        })
  }`;

  const embed = new EmbedBuilder()
    .setAuthor({
      name: uni(ctx, league),
      iconURL: getLeagueLogoUrl(league),
    })
    .setTitle(title)
    .setColor(colors[league]);

  const descriptions = getPaginatedStrings(
    games,
    (game) => {
      const startAt = new Date(isoDate(game));
      const style = subcommand === "day" ? "t" : "d";
      const homeEmoji = getTeamEmoji(league, game.home_team);
      const awayEmoji = getTeamEmoji(league, game.visiting_team);
      return game.status === GameStatus.NotStarted
        ? `🔴 ${time(startAt, style)} ${awayEmoji} ${
            game.visiting_team_code
          } @ ${homeEmoji} ${game.home_team_code}`
        : `${
            game.status === GameStatus.Final ||
            game.status === GameStatus.UnofficialFinal
              ? "🏁"
              : "🟢"
          } ${time(startAt, style)} ${awayEmoji} ${game.visiting_team_code} **${
            game.visiting_goal_count
          }** - **${game.home_goal_count}** ${homeEmoji} ${
            game.home_team_code
          }\n${game.game_status}`;
    },
    {
      // The actual max length is 4096, but I reduced it here because all of
      // the markdown causes the last line to become invisible when rendered
      // in the desktop app due to too many 'nodes'.
      maxLength: 3900,
      separator: games.length > 30 ? "\n" : "\n\n",
    },
  );
  if (descriptions.length === 0) {
    embed.setDescription(s(ctx, "noGames"));
  } else {
    embed.setDescription(descriptions[0]);
  }

  const components: APIActionRowComponent<APIComponentInMessageActionRow>[] =
    [];
  const notStarted = games.filter((g) => g.status === GameStatus.NotStarted);
  if (notStarted.length !== 0) {
    const watch = hockeyTechLeagues[league].watch;
    components.push(
      new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          ...(await storeComponents(ctx.env.KV, [
            new ButtonBuilder()
              .setStyle(ButtonStyle.Primary)
              .setLabel("Create Server Events"),
            {
              componentRoutingId: "add-schedule-events",
              componentTimeout: 600,
              componentOnce: true,
              league,
              games: notStarted.map((game) => ({
                id: game.id,
                title: `${game.visiting_team_nickname} at ${game.home_team_nickname}`,
                location: game.venue_location,
                description: [
                  watch
                    ? `📺 Watch live on ${watch.platform}: ${watch.url}${
                        watch.regions ? ` (${watch.regions.join(", ")})` : ""
                      }`
                    : "",
                  `🏟️ ${game.visiting_team_code} @ ${game.home_team_code} - ${
                    "venue" in game ? game.venue : game.venue_name
                  }`,
                  `🎟️ Buy tickets: ${
                    game.tickets_url || "no link available for this game"
                  }`,
                  `🆔 ${league}:${game.id}`,
                ]
                  .join("\n\n")
                  .trim(),
                date: isoDate(game),
              })),
            } satisfies AddScheduleEventsState,
          ])),
          new ButtonBuilder()
            .setStyle(ButtonStyle.Secondary)
            .setLabel("Remove Buttons")
            .setCustomId("p_remove-message-components"),
        )
        .toJSON(),
    );
  }

  if (descriptions.length > 1) {
    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>()
        .addComponents(
          await storeComponents(ctx.env.KV, [
            new StringSelectMenuBuilder()
              .setPlaceholder("Select Page")
              .addOptions(
                descriptions.slice(0, 25).map((_, i) =>
                  new StringSelectMenuOptionBuilder()
                    .setLabel(`Page ${i + 1}`)
                    .setDefault(page === i)
                    .setValue(String(i)),
                ),
              ),
            {
              componentRoutingId: "select-schedule-page",
              componentTimeout: 600,
              league,
              title,
              descriptions,
            },
          ]),
        )
        .toJSON(),
    );
  }

  await ctx.followup.editOriginalMessage({
    embeds: [embed.toJSON()],
    components,
  });
};

export const selectSchedulePageCallback: SelectMenuCallback = async (ctx) => {
  const { league, title, descriptions } = ctx.state as {
    league: League;
    title: string;
    descriptions: string[];
  };
  const { message } = ctx.interaction;
  const page = Number(ctx.interaction.data.values[0]);

  const embed = new EmbedBuilder()
    .setAuthor({
      name: uni(ctx, league),
      iconURL: getLeagueLogoUrl(league),
    })
    .setTitle(title)
    .setColor(colors[league])
    .setDescription(descriptions[page]);

  const components = message.components ?? [];
  return ctx.updateMessage({
    embeds: [embed.toJSON()],
    components: components.map((row, i) => {
      if (
        i === components.length - 1 &&
        row.type === ComponentType.ActionRow &&
        row.components[0].type === ComponentType.StringSelect
      ) {
        row.components[0].options = row.components[0].options.map(
          (opt, pageI) => {
            opt.default = pageI === page;
            return opt;
          },
        );
      }
      return row;
    }),
  });
};

export const scheduleDayCallback: ChatInputAppCommandCallback = async (ctx) => {
  const league = ctx.getStringOption("league").value as League;
  const client = getHtClient(ctx.env, league);
  const teamId = ctx.getStringOption("team")?.value;

  const dateVal = ctx.getStringOption("date")?.value;
  const dateMatch = dateVal ? dateVal.match(DATE_REGEX) : undefined;
  if (dateVal && !dateMatch) {
    return ctx.reply({
      content: s(ctx, "badDate"),
      flags: MessageFlags.Ephemeral,
    });
  }
  const date = dateMatch
    ? new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`)
    : getNow();
  if (Number.isNaN(date.getTime())) {
    return ctx.reply({
      content: s(ctx, "badDate"),
      flags: MessageFlags.Ephemeral,
    });
  }
  const dateDay = date.toISOString().split("T")[0];

  return [
    ctx.defer(),
    async () => {
      const games = (
        await client.getDailySchedule(dateDay)
      ).SiteKit.Gamesbydate.filter((game) =>
        teamId
          ? game.home_team === teamId || game.visiting_team === teamId
          : true,
      );

      await sendScheduleMessage(ctx, games, date);
    },
  ];
};

export const scheduleMonthCallback: ChatInputAppCommandCallback = async (
  ctx,
) => {
  const league = ctx.getStringOption("league").value as League;

  const client = getHtClient(ctx.env, league);
  const teamId = ctx.getStringOption("team")?.value || undefined;
  const monthVal = ctx.getStringOption("month")?.value || undefined;
  const seasonId = ctx.getStringOption("season")?.value || undefined;
  const excludeFinishedGames = ctx.getBooleanOption(
    "exclude-finished-games",
  ).value;

  const now = getNow();
  const month = monthVal ? Number(monthVal) : now.getUTCMonth();

  return [
    ctx.defer(),
    async () => {
      const games = (
        await client.getSeasonSchedule(
          // @ts-expect-error
          seasonId ? Number(seasonId) : "latest",
          teamId ? Number(teamId) : undefined,
        )
      ).SiteKit.Schedule.filter(
        (game) =>
          (teamId
            ? game.home_team === teamId || game.visiting_team === teamId
            : true) &&
          Number(
            new Date(game.GameDateISO8601).toLocaleDateString("en-US", {
              month: "numeric",
              timeZone: game.timezone,
            }),
          ) ===
            month + 1 &&
          (excludeFinishedGames
            ? ![GameStatus.Final, GameStatus.UnofficialFinal].includes(
                game.status,
              )
            : true),
      );

      try {
        await sendScheduleMessage(
          ctx,
          games,
          games.length === 0
            ? new Date(
                // It's currently the first half of the season and the month
                // provided is in the last half, so add 1 year to the display
                // date. Assumes winter leagues
                now.getUTCFullYear() +
                  (month < 6 && now.getUTCMonth() >= 6 ? 1 : 0),
                month,
                5,
              )
            : new Date(isoDate(games[0])),
        );
      } catch (e) {
        console.error(e);
      }
    },
  ];
};

export const scheduleAllCallback: ChatInputAppCommandCallback = async (ctx) => {
  const league = ctx.getStringOption("league").value as League;

  const client = getHtClient(ctx.env, league);
  const teamId = ctx.getStringOption("team")?.value || undefined;
  const seasonId = ctx.getStringOption("season")?.value || undefined;
  const excludeFinishedGames = ctx.getBooleanOption(
    "exclude-finished-games",
  ).value;

  return [
    ctx.defer(),
    async () => {
      const seasons = (await client.getSeasonList()).SiteKit.Seasons;
      const season = seasonId
        ? seasons.find((s) => s.season_id === seasonId)
        : seasons[0];
      const games = (
        await client.getSeasonSchedule(
          // @ts-expect-error
          season?.season_id ?? "latest",
          teamId ? Number(teamId) : undefined,
        )
      ).SiteKit.Schedule.filter(
        (game) =>
          (teamId
            ? game.home_team === teamId || game.visiting_team === teamId
            : true) &&
          (excludeFinishedGames
            ? ![GameStatus.Final, GameStatus.UnofficialFinal].includes(
                game.status,
              )
            : true),
      );

      try {
        await sendScheduleMessage(
          ctx,
          games,
          season?.season_name ?? new Date(),
        );
      } catch (e) {
        console.error(e);
      }
    },
  ];
};

export const htGamedayCallback: ChatInputAppCommandCallback = async (ctx) => {
  const today = getNow();
  today.setUTCHours(6, 0, 0, 0);
  const league = ctx.getStringOption("league").value as HockeyTechLeague;
  const client = getHtClient(ctx.env, league);
  const teamId = ctx.getStringOption("team")?.value;
  const team = teamId
    ? leagueTeams[league].find((t) => t.id === teamId)
    : undefined;
  // The PWHL doesn't play many games so we can request an extra day
  const scorebarData = await client.getScorebar(1, league === "pwhl" ? 1 : 0);
  const games =
    scorebarData.SiteKit.Scorebar?.filter((game) =>
      teamId ? [game.HomeID, game.VisitorID].includes(teamId) : true,
    ) ?? [];

  const embed = new EmbedBuilder()
    .setAuthor({
      name: uni(ctx, league),
      iconURL: getLeagueLogoUrl(league),
    })
    .setTitle(
      `${s(ctx, "gameDay")}${team ? ` - ${team.nickname}` : ""} - ${time(
        getNow(),
        "d",
      )}`,
    )
    .setColor(colors[league])
    .setDescription(
      games
        .map((game) => {
          const startAt = new Date(game.GameDateISO8601);
          const homeEmoji = getTeamEmoji(league, game.HomeID);
          const awayEmoji = getTeamEmoji(league, game.VisitorID);
          let line =
            game.GameStatus === GameStatus.NotStarted
              ? `🔴 ${time(
                  startAt,
                  game.Date === today.toISOString().split("T")[0] ? "t" : "d",
                )} ${awayEmoji} ${game.VisitorCode} @ ${homeEmoji} ${
                  game.HomeCode
                }`
              : `${
                  game.GameStatus === GameStatus.Final ||
                  game.GameStatus === GameStatus.UnofficialFinal
                    ? `🏁 ${time(startAt, "d")}`
                    : `🟢 ${time(startAt, "t")}`
                } ${awayEmoji} ${game.VisitorCode} **${
                  game.VisitorGoals
                }** - **${game.HomeGoals}** ${homeEmoji} ${game.HomeCode}`;

          if (game.GameStatus !== GameStatus.NotStarted) {
            line += `\n${game.GameStatusString}`;
          }

          return line;
        })
        .join("\n\n")
        .trim()
        .slice(0, 4096) || s(ctx, "noGames"),
    )
    .toJSON();

  return ctx.reply({ embeds: [embed] });
};

export interface AddScheduleEventsState extends MinimumKVComponentState {
  league: League;
  games: {
    id: string;
    title: string;
    location: string;
    description: string;
    date: string;
  }[];
}

export const removeMessageComponentsCallback: ButtonCallback = async (ctx) => {
  if (!ctx.userPermissons.has(PermissionFlags.ManageMessages)) {
    return ctx.reply({
      content: `${s(ctx, "missingPermissions")} **Manage Messages**`,
      flags: MessageFlags.Ephemeral,
    });
  }
  return ctx.updateMessage({ components: [] });
};

export const addScheduleEventsCallback: ButtonCallback = async (ctx) => {
  const state = ctx.state as AddScheduleEventsState;
  const { guild_id: guildId, message } = ctx.interaction;

  if (!ctx.userPermissons.has(PermissionFlags.ManageEvents)) {
    return ctx.reply({
      content: `${s(ctx, "missingPermissions")} **Manage Events**`,
      flags: MessageFlags.Ephemeral,
    });
  }
  if (!guildId) {
    return ctx.reply({
      content: s(ctx, "notGuild"),
      flags: MessageFlags.Ephemeral,
    });
  }
  if (state.games.length === 0) {
    return ctx.reply({
      content: s(ctx, "noSchedulableGames"),
      flags: MessageFlags.Ephemeral,
    });
  }

  // Don't add duplicate events
  const extantEvents = (await ctx.rest.get(
    Routes.guildScheduledEvents(guildId),
  )) as RESTGetAPIGuildScheduledEventsResult;
  const extantGameIds = state.games
    .map((game) =>
      extantEvents.find(
        (e) =>
          !!e.description &&
          e.description.endsWith(`${state.league}:${game.id}`),
      )
        ? game.id
        : undefined,
    )
    .filter((e) => !!e)
    .map((e) => e as string);

  const perPage = 5;
  const newGames = state.games.filter(
    (game) =>
      !extantGameIds.includes(game.id) && new Date(game.date) > getNow(),
  );

  if (newGames.length === 0) {
    return ctx.reply({
      content: s(ctx, "noSchedulableGames"),
      flags: MessageFlags.Ephemeral,
    });
  }

  const cursor = Math.max(
    state.games.findIndex((g) => g.id === newGames[0]?.id),
    0,
  );
  return [
    ctx.reply({
      content: `<:loading:1436003811553448018> Importing ${Math.min(
        newGames.length,
        perPage,
      )} events`,
      flags: MessageFlags.Ephemeral,
    }),
    async () => {
      const willContinue = newGames.length > perPage;
      await ctx.followup.editMessage(message.id, {
        components: willContinue
          ? message.components?.map((row, i) => {
              if (i === 0 && row.type === ComponentType.ActionRow) {
                // Make it clear they can't use this button while processing
                row.components[0].disabled = true;
              }
              return row;
            })
          : [],
      });

      let imported = 0;
      let failures = 0;
      for (const game of newGames.slice(0, perPage)) {
        try {
          await ctx.rest.post(Routes.guildScheduledEvents(guildId), {
            body: {
              name: game.title,
              privacy_level: GuildScheduledEventPrivacyLevel.GuildOnly,
              scheduled_start_time: new Date(game.date).toISOString(),
              scheduled_end_time: new Date(
                new Date(game.date).getTime() + 3600000 * 3,
              ).toISOString(),
              description: game.description,
              entity_type: GuildScheduledEventEntityType.External,
              entity_metadata: { location: game.location },
            },
          });
          imported += 1;
        } catch (e) {
          failures += 1;
          console.error(e);
        }
        // await sleep(1000);
      }

      const waitTime = 10000;
      const updatedAt = Math.round((Date.now() + waitTime) / 1000);
      await ctx.followup.editOriginalMessage({
        content: `Imported ${imported} events${
          failures > 0 ? ` with ${failures} failures` : ""
        }. Feel free to edit these, just don't change the last line of the description.${
          willContinue
            ? `\n\nThe schedule message will be updated <t:${updatedAt}:R> so you can add more events. This delay is due to rate limits.`
            : ""
        }`,
      });
      if (!willContinue) return;

      await sleep(waitTime);
      await ctx.followup.deleteOriginalMessage();

      const newCursor = cursor + 1 + newGames.length;
      await ctx.followup.editMessage(message.id, {
        components: [
          new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
              ...(await storeComponents(ctx.env.KV, [
                new ButtonBuilder()
                  .setStyle(ButtonStyle.Primary)
                  .setLabel(
                    `Create ${newCursor}-${
                      newCursor + Math.min(perPage, newGames.length)
                    } (${newGames.length - perPage} remaining)`,
                  ),
                {
                  componentRoutingId: state.componentRoutingId,
                  componentTimeout: state.componentTimeout,
                  componentOnce: true,
                  league: state.league,
                  games: state.games,
                } satisfies AddScheduleEventsState,
              ])),
              new ButtonBuilder()
                .setStyle(ButtonStyle.Secondary)
                .setLabel("Remove Buttons")
                .setCustomId("p_remove-message-components"),
            )
            .toJSON(),
        ],
      });
    },
  ];
};
