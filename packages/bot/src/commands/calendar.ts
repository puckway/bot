import { MessageFlags } from "discord-api-types/v10";
import { ChatInputAppCommandCallback } from "../commands";
import { getKhlLocale, transformLocalizations, uni } from "../l10n";
import * as api from "api";
import { EmbedBuilder, time } from "@discordjs/builders";
import { khlTeamEmoji } from "../util/emojis";

export const DATE_REGEX = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

const s = transformLocalizations({
  en: {
    badDate: "Invalid date. Must follow the format `YYYY-MM-DD`.",
    schedule: "Schedule",
    noGames: "No games on this date.",
  },
  ru: {
    schedule: "Календарь",
  },
  cn: {
    schedule: "赛程",
  },
});

export type KhlListedPartialGame = Pick<
  api.KhlEvent,
  "game_state_key" | "score" | "team_a" | "team_b" | "start_at"
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
  const date = dateMatch
    ? new Date(
        Number(dateMatch[1]),
        Number(dateMatch[2]) - 1,
        Number(dateMatch[3]),
        6,
      )
    : new Date();
  if (Number.isNaN(date.getTime())) {
    return ctx.reply({
      content: s(ctx, "badDate"),
      flags: MessageFlags.Ephemeral,
    });
  }
  const dateDay = date.toISOString().split("T")[0];
  const locale = getKhlLocale(ctx);
  const lowerLocale =
    locale === "CN" ? "en" : (locale.toLowerCase() as "en" | "ru");
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
                  )} - ${awayEmoji} ${awayAbbrev} @ ${homeEmoji} ${homeAbbrev}`
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
      const games = await api.getGames({ locale, date });
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
