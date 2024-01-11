import {
  APIGuildScheduledEvent,
  ButtonStyle,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  MessageFlags,
  RESTGetAPIGuildScheduledEventsResult,
  RESTPostAPIGuildScheduledEventResult,
  Routes,
} from "discord-api-types/v10";
import { ChatInputAppCommandCallback } from "../commands";
import { getKhlLocale, transformLocalizations, uni } from "../util/l10n";
import * as api from "api";
import type { APIEvent } from "khl-api-types";
import {
  ActionRowBuilder,
  ButtonBuilder,
  EmbedBuilder,
  time,
} from "@discordjs/builders";
import { khlTeamEmoji, pwhlTeamEmoji } from "../util/emojis";
import { getPwhlClient } from "../pwhl/client";
import { allTeams } from "../pwhl/team";
import { storeComponents } from "../util/components";
import { ButtonCallback, MinimumKVComponentState } from "../components";
import { PermissionFlags } from "discord-bitflag";

export const DATE_REGEX = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

const s = transformLocalizations({
  en: {
    badDate: "Invalid date. Must follow the format `YYYY-MM-DD`.",
    schedule: "Schedule",
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
    noGames: "Aucun jeux trouvé",
    today: "Aujourd'hui",
  },
});

export type KhlListedPartialGame = Pick<
  APIEvent,
  "game_state_key" | "score" | "team_a" | "team_b" | "start_at" | "end_at"
>;

export const khlCalendarCallback: ChatInputAppCommandCallback = async (ctx) => {
  const teamVal = ctx.getStringOption("team")?.value;
  const dateVal = ctx.getStringOption("date")?.value;
  const dateMatch = dateVal ? dateVal.match(DATE_REGEX) : undefined;
  if (dateVal && !dateMatch) {
    return ctx.reply({
      content: s(ctx, "badDate"),
      flags: MessageFlags.Ephemeral,
    });
  }
  const now = new Date();
  const date = dateMatch
    ? new Date(
        Number(dateMatch[1]),
        Number(dateMatch[2]) - 1,
        Number(dateMatch[3]),
        6,
      )
    : new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 6);
  if (Number.isNaN(date.getTime())) {
    return ctx.reply({
      content: s(ctx, "badDate"),
      flags: MessageFlags.Ephemeral,
    });
  }
  const dateDay = date.toISOString().split("T")[0];
  const locale = getKhlLocale(ctx);
  const lowerLocale = locale === "cn" ? "en" : locale;
  const key = `games-khl-${date.toISOString().split("T")[0]}-${locale}`;
  const cachedGames = await ctx.env.KV.get<KhlListedPartialGame[]>(key, "json");

  const buildEmbed = (events: KhlListedPartialGame[]) =>
    new EmbedBuilder()
      .setAuthor({
        name: uni(ctx, "khl"),
        // iconURL: "https://www.khl.ru/img/icons/32x32.png",
      })
      .setTitle(`${s(ctx, "schedule")} - ${time(date, "D")}`)
      .setDescription(
        events
          .filter(
            (game) =>
              dateDay === new Date(game.start_at).toISOString().split("T")[0],
          )
          .sort((a, b) => a.start_at - b.start_at)
          .map((game) => {
            const homeAbbrev =
              api.allTeams.find((t) => t.id === game.team_a.id)?.abbreviations[
                lowerLocale
              ] ?? game.team_a.name;
            const awayAbbrev =
              api.allTeams.find((t) => t.id === game.team_b.id)?.abbreviations[
                lowerLocale
              ] ?? game.team_b.name;
            let homeScore = "";
            let awayScore = "";
            let extraScoreText = "";
            if (game.score) {
              const [h, a] = game.score.split(":");
              homeScore = h;
              awayScore = a.split(" ")[0];
              // Just in case
              extraScoreText = a.split(" ")[1] ?? "";
            }
            const homeEmoji = khlTeamEmoji(ctx.env, game.team_a);
            const awayEmoji = khlTeamEmoji(ctx.env, game.team_b);
            const line =
              game.game_state_key === "not_yet_started"
                ? `🔴 ${time(
                    game.start_at / 1000,
                    "t",
                  )} - ${awayEmoji} ${awayAbbrev} @ ${homeEmoji} ${homeAbbrev}${
                    game.end_at ? ` 🏁 ${time(game.end_at / 1000, "t")}` : ""
                  }`
                : `${
                    game.game_state_key === "finished" ? "🏁" : "🟢"
                  } ${awayEmoji} ${awayAbbrev} **${awayScore}** - **${homeScore}** ${homeEmoji} ${homeAbbrev}`;

            return line;
          })
          .join("\n\n")
          .trim() || s(ctx, "noGames"),
      )
      .toJSON();

  if (cachedGames) {
    return ctx.reply({ embeds: [buildEmbed(cachedGames)] });
  }

  return [
    ctx.defer(),
    async () => {
      // The API accepts a specific timestamp, not a broad day, so we have to
      // make sure our timestamp starts at 0 seconds in order to get all events
      // for the day.
      const sortDate = new Date(date);
      sortDate.setUTCHours(0);
      const games = await api.getGames({ locale, date: sortDate });
      await ctx.env.KV.put(
        key,
        JSON.stringify(
          games.map(
            (game) =>
              ({
                game_state_key: game.game_state_key,
                team_a: game.team_a,
                team_b: game.team_b,
                score: game.score,
                start_at: game.start_at,
                end_at: game.end_at,
              }) as KhlListedPartialGame,
          ),
        ),
        {
          // 3 days
          expirationTtl: 259200,
        },
      );
      await ctx.followup.editOriginalMessage({ embeds: [buildEmbed(games)] });
    },
  ];
};

export const pwhlScheduleCallback: ChatInputAppCommandCallback = async (
  ctx,
) => {
  return [
    ctx.defer(),
    async () => {
      const today = new Date().toISOString().split("T")[0];
      const client = getPwhlClient();
      const teamId = ctx.getStringOption("team")?.value;
      const team = teamId ? allTeams.find((t) => t.id === teamId) : undefined;
      const data = await client.getSeasonSchedule(
        Number(ctx.getStringOption("season")?.value ?? 1),
        teamId ? Number(teamId) : undefined,
      );
      const monthIndex = Number(
        ctx.getStringOption("month")?.value ?? new Date().getUTCMonth(),
      );
      let monthDate = new Date();
      monthDate.setUTCMonth(monthIndex);
      const games = data.SiteKit.Schedule.filter(
        (game) => new Date(game.GameDateISO8601).getUTCMonth() === monthIndex,
      );
      if (games.length !== 0) {
        monthDate = new Date(games[0].GameDateISO8601);
      }

      const embed = new EmbedBuilder()
        .setAuthor({
          name: uni(ctx, "pwhl"),
          iconURL: ctx.env.PWHL_LOGO,
        })
        .setTitle(
          `${s(ctx, "schedule")}${
            team ? ` - ${team.nickname}` : ""
          } - ${monthDate.toLocaleString(ctx.getLocale(), {
            month: "long",
            year: "numeric",
          })}`,
        )
        .setDescription(
          games
            .map((game, i) => {
              const startAt = new Date(game.GameDateISO8601);
              const homeEmoji = pwhlTeamEmoji(ctx.env, game.home_team);
              const awayEmoji = pwhlTeamEmoji(ctx.env, game.visiting_team);
              let line =
                game.status === "1"
                  ? `🔴 ${time(
                      startAt,
                      game.date_played === today ? "t" : "d",
                    )} ${awayEmoji} ${game.visiting_team_code} @ ${homeEmoji} ${
                      game.home_team_code
                    }`
                  : `${
                      game.status === "4" || game.status === "3"
                        ? `🏁 ${time(startAt, "d")}`
                        : `🟢 ${time(startAt, "t")}`
                    } ${awayEmoji} ${game.visiting_team_code} **${
                      game.visiting_goal_count
                    }** - **${game.home_goal_count}** ${homeEmoji} ${
                      game.home_team_code
                    }`;

              if (game.status !== "1") {
                line += `\n${game.game_status}`
              }

              const last = games[i - 1];
              if (
                game.date_played === today &&
                (!last || last.date_played !== game.date_played)
              ) {
                line = `**${s(ctx, "today")}**\n${line}`;
              }

              return line;
            })
            .join("\n\n")
            .trim()
            .slice(0, 4096) || s(ctx, "noGames"),
        )
        // .setFooter({
        //   text: data.SiteKit.Copyright.required_copyright.slice(0, 2048),
        // })
        .toJSON();

      let components;
      if (games.length > 0) {
        components = [
          new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
              // Discord provides this feature natively in events.
              // Might be kind of confusing too.
              // new ButtonBuilder()
              //   .setStyle(ButtonStyle.Link)
              //   .setURL(
              //     `https://lscluster.hockeytech.com/components/calendar/ical_add_games.php?client_code=pwhl&game_ids=${games
              //       .map((g) => g.id)
              //       .join(",")}`,
              //   )
              //   .setLabel("Add to Calendar"),
              ...(await storeComponents(ctx.env.KV, [
                new ButtonBuilder()
                  .setStyle(ButtonStyle.Primary)
                  .setLabel("Add all as server events"),
                {
                  componentRoutingId: "add-schedule-events",
                  componentTimeout: 600,
                  componentOnce: true,
                  league: "pwhl",
                  games: games
                    .filter((game) => game.status === "1")
                    .map((game) => ({
                      id: game.id,
                      title: `${game.visiting_team_nickname} at ${game.home_team_nickname}`,
                      location: game.venue_location,
                      description: [
                        "📺 Watch live on YouTube [@thepwhlofficial](https://youtube.com/@thepwhlofficial/streams)",
                        `🏟️ ${game.visiting_team_code} @ ${game.home_team_code} - [${game.venue_name}](${game.venue_url})`,
                        `🎟️ Buy tickets: ${game.tickets_url}`,
                        `🆔 pwhl:${game.id}`,
                      ].join("\n\n"),
                      date: game.GameDateISO8601,
                    })),
                },
              ])),
            )
            .toJSON(),
        ];
      }
      await ctx.followup.editOriginalMessage({ embeds: [embed], components });
    },
  ];
};

export interface AddScheduleEventsState extends MinimumKVComponentState {
  league: "khl" | "pwhl";
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
      !extantGameIds.includes(game.id) && new Date(game.date) > new Date(),
  );

  if (newGames.length === 0) {
    return ctx.reply({
      content: s(ctx, "noSchedulableGames"),
      flags: MessageFlags.Ephemeral,
    });
  }

  return [
    ctx.reply({
      content: `Importing ${newGames.length} events...`,
    }),
    async () => {
      const events: APIGuildScheduledEvent[] = [];
      for (const game of newGames) {
        const event = (await ctx.rest.post(
          Routes.guildScheduledEvents(guildId),
          {
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
          },
        )) as RESTPostAPIGuildScheduledEventResult;
        events.push(event);
      }

      await ctx.followup.editOriginalMessage({
        content: `Imported ${events.length} events.`,
      });
    },
  ];
};
