import {
  ActionRowBuilder,
  ButtonBuilder,
  EmbedBuilder,
  time,
} from "@discordjs/builders";
import {
  APIActionRowComponent,
  APIButtonComponent,
  APIChatInputApplicationCommandInteraction,
  ButtonStyle,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  MessageFlags,
  RESTGetAPIGuildScheduledEventsResult,
  Routes,
} from "discord-api-types/v10";
import { PermissionFlags } from "discord-bitflag";
import { GameStatus, GamesByDate, Schedule } from "hockeytech";
import { type APIEvent } from "khl-api-types";
import { ChatInputAppCommandCallback } from "../commands";
import { ButtonCallback, MinimumKVComponentState } from "../components";
import { League } from "../db/schema";
import { HockeyTechLeague, getHtClient, hockeyTechLeagues } from "../ht/client";
import { leagueTeams } from "../ht/teams";
import { InteractionContext } from "../interactions";
import { colors } from "../util/colors";
import { storeComponents } from "../util/components";
import { getLeagueLogoUrl, getTeamEmoji } from "../util/emojis";
import { transformLocalizations, uni } from "../util/l10n";
import { getOffset, sleep } from "../util/time";
import { getNow } from "../util/time";

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

export type KhlListedPartialGame = Pick<
  APIEvent,
  "game_state_key" | "score" | "team_a" | "team_b" | "start_at" | "end_at"
>;

export const isoDate = (game: GamesByDate | Schedule) =>
  `${game.date_played}T${game.schedule_time}${getOffset(game.timezone)}`;

const sendScheduleMessage = async (
  ctx: InteractionContext<APIChatInputApplicationCommandInteraction>,
  games: (GamesByDate | Schedule)[],
  displayDate: Date,
) => {
  const league = ctx.getStringOption("league").value as League;
  const teamId = ctx.getStringOption("team")?.value;
  const team = teamId
    ? leagueTeams[league].find((t) => t.id === teamId)
    : undefined;
  const subcommand = ctx.interaction.data.options?.[0].name;

  const title = `${s(ctx, "schedule")}${
    team ? ` - ${team.nickname}` : ""
  } - ${displayDate.toLocaleString(ctx.getLocale(), {
    month: "long",
    day: subcommand === "day" ? "numeric" : undefined,
    year: "numeric",
    timeZone: games[0]?.timezone,
  })}`;

  const embed = new EmbedBuilder()
    .setAuthor({
      name: uni(ctx, league),
      iconURL: getLeagueLogoUrl(league),
    })
    .setTitle(title)
    .setColor(colors[league])
    .setDescription(
      games
        .map((game) => {
          const startAt = new Date(isoDate(game));
          const style = subcommand === "day" ? "t" : "d";
          const homeEmoji = getTeamEmoji(league, game.home_team);
          const awayEmoji = getTeamEmoji(league, game.visiting_team);
          const line =
            game.status === GameStatus.NotStarted
              ? `🔴 ${time(startAt, style)} ${awayEmoji} ${
                  game.visiting_team_code
                } @ ${homeEmoji} ${game.home_team_code}`
              : `${
                  game.status === GameStatus.Final ||
                  game.status === GameStatus.UnofficialFinal
                    ? "🏁"
                    : "🟢"
                } ${time(startAt, style)} ${awayEmoji} ${
                  game.visiting_team_code
                } **${game.visiting_goal_count}** - **${
                  game.home_goal_count
                }** ${homeEmoji} ${game.home_team_code}\n${game.game_status}`;

          return line;
        })
        .join(games.length > 30 ? "\n" : "\n\n")
        .trim()
        .slice(0, 4096) || s(ctx, "noGames"),
    )
    .toJSON();

  let components: APIActionRowComponent<APIButtonComponent>[] = [];
  if (games.length > 0) {
    components = [
      new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          ...(await storeComponents(ctx.env.KV, [
            new ButtonBuilder()
              .setStyle(ButtonStyle.Primary)
              .setLabel("Add all as server events")
              .setDisabled(
                games.filter((g) => g.status === GameStatus.NotStarted)
                  .length === 0,
              ),
            {
              componentRoutingId: "add-schedule-events",
              componentTimeout: 600,
              componentOnce: true,
              league,
              games: games
                .filter((game) => game.status === GameStatus.NotStarted)
                .map((game) => {
                  const watch = hockeyTechLeagues[league].watch;
                  return {
                    id: game.id,
                    title: `${game.visiting_team_nickname} at ${game.home_team_nickname}`,
                    location: game.venue_location,
                    description: [
                      watch
                        ? `📺 Watch live on ${watch.platform}: ${watch.url}${
                            watch.regions
                              ? ` (${watch.regions.join(", ")})`
                              : ""
                          }`
                        : "",
                      `🏟️ ${game.visiting_team_code} @ ${
                        game.home_team_code
                      } - ${"venue" in game ? game.venue : game.venue_name}`,
                      `🎟️ Buy tickets: ${
                        game.tickets_url || "no link available for this game"
                      }`,
                      `🆔 ${league}:${game.id}`,
                    ]
                      .join("\n\n")
                      .trim(),
                    date: isoDate(game),
                  };
                }),
            },
          ])),
        )
        .toJSON(),
    ];
  }
  await ctx.followup.editOriginalMessage({ embeds: [embed], components });
};

export const scheduleDayCallback: ChatInputAppCommandCallback = async (ctx) => {
  const league = ctx.getStringOption("league").value as League;
  const client = getHtClient(league);
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

  const client = getHtClient(league);
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
          new Date(game.GameDateISO8601).getUTCMonth() === month &&
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

export const htGamedayCallback: ChatInputAppCommandCallback = async (ctx) => {
  const today = getNow();
  today.setUTCHours(6, 0, 0, 0);
  const league = ctx.getStringOption("league").value as HockeyTechLeague;
  const client = getHtClient(league);
  const teamId = ctx.getStringOption("team")?.value;
  const team = teamId
    ? leagueTeams[league].find((t) => t.id === teamId)
    : undefined;
  const games =
    // The PWHL doesn't play many games
    (
      await client.getScorebar(1, league === "pwhl" ? 1 : 0)
    ).SiteKit.Scorebar.filter((game) =>
      teamId ? [game.HomeID, game.VisitorID].includes(teamId) : true,
    );

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

export const addScheduleEventsCallback: ButtonCallback = async (ctx) => {
  const state = ctx.state as AddScheduleEventsState;
  const guildId = ctx.interaction.guild_id;

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

  return [
    ctx.reply({
      content: `Importing ${newGames.length} events, this might take a while!`,
    }),
    async () => {
      let imported = 0;
      let failures = 0;
      for (const game of newGames) {
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
        if (imported % 5 === 0) {
          try {
            await ctx.followup.editOriginalMessage({
              content: `Imported ${imported}/${newGames.length} events, ${
                newGames.length - imported <= 1
                  ? "almost finished..."
                  : "this might take a while. If it appears stuck, it probably isn't!"
              }`,
            });
          } catch {
            // We don't really care if this succeeds
          }
        }
        await sleep(1500);
      }

      await ctx.followup.editOriginalMessage({
        content: `Imported ${imported} events${
          failures > 0 ? ` with ${failures} failures` : ""
        }. Feel free to edit these, just don't change the last line of the description.`,
      });
    },
  ];
};
