import { EmbedBuilder } from "@discordjs/builders";
import { ChatInputAppCommandCallback } from "../commands";
import { League } from "../db/schema";
import {
  getHtLocale,
  getKhlLocale,
  transformLocalizations,
  uni,
} from "../util/l10n";
import { InteractionContext } from "../interactions";
import { getLeagueLogoUrl } from "../util/emojis";
import { getHtClient } from "../ht/client";
import { getBorderCharacters, table } from "table";
import { getExternalUtils } from "../util/external";
import { colors } from "../util/colors";
import { MessageFlags } from "discord-api-types/v10";

interface HockeyTechTeamStanding {
  team_id: string;
  name: string;
  nickname: string;
  city: string;
  team_code: string;
  placeholder: string;
  division_id: string;
  wins: string;
  losses: string;
  ties: string;
  ot_losses: string;
  reg_ot_losses: string;
  ot_wins: string;
  shootout_wins: string;
  shootout_losses: string;
  regulation_wins: string;
  row: string;
  points: string;
  bench_minutes: string;
  penalty_minutes: string;
  past_10_wins: string;
  past_10_losses: string;
  past_10_ties: string;
  past_10_ot_losses: string;
  past_10_shootout_losses: string;
  goals_for: string;
  goals_against: string;
  goals_diff: string;
  power_play_goals: string;
  power_play_goals_against: string;
  shootout_goals: string;
  shootout_goals_against: string;
  shootout_attempts: string;
  shootout_attempts_against: string;
  short_handed_goals_for: string;
  short_handed_goals_against: string;
  percentage: string;
  percentage_full: string;
  clinched_playoff_spot: string;
  clinched_group_title: string;
  overall_rank: string;
  shootout_games_played: string;
  games_played: string;
  shootout_pct: string;
  power_play_pct: string;
  shootout_pct_goals_for: string;
  shootout_pct_goals_against: string;
  penalty_kill_pct: string;
  pim_pg: string;
  power_plays: string;
  win_percentage: string;
  times_short_handed: string;
  divisname: string;
  games_remaining: string;
  conference_name: string;
  streak: string;
  rank: number;
  shootout_record: string;
  home_record: string;
  visiting_record: string;
  past_10: string;
  clinched: string;
  team_name: string;
  teamname: string;
  division_name: string;
}

const s = transformLocalizations({
  en: {
    noSeasons: "There are no seasons to display standings for.",
  },
});

const getStandingsEmbed = (
  ctx: InteractionContext,
  league: League,
  headers: string[],
  stats: {
    teamCode: string;
    values: string[];
  }[],
) => {
  const embed = new EmbedBuilder()
    .setAuthor({
      name: `${uni(ctx, league)} Standings`,
      iconURL: getLeagueLogoUrl(league),
    })
    .setColor(colors[league]);

  const dashes = (length: number) => Array(length).fill("-").join("");
  const tableData = [["Rank", "Team", ...headers]];
  tableData.push(tableData[0].map((e) => dashes(e.length + 1)));

  tableData.push(
    ...stats.map((stat, i) => [String(i + 1), stat.teamCode, ...stat.values]),
  );

  embed.setDescription(
    `\`\`\`apache\n${table(tableData, {
      border: getBorderCharacters("void"),
      columnDefault: { paddingLeft: 0, paddingRight: 1 },
      drawHorizontalLine: () => false,
    })}\`\`\``,
  );

  return embed.toJSON();
};

export const standingsCallback: ChatInputAppCommandCallback = async (ctx) => {
  const league = ctx.getStringOption("league").value as League;
  if (league === "khl") {
    const utils = getExternalUtils(league, getKhlLocale(ctx));
    // biome-ignore lint/style/noNonNullAssertion: Present for KHL leagues
    return ctx.reply(utils.standings!());
  }
  const sort = (ctx.getStringOption("sort").value || undefined) as
    | "games_played"
    | "games_remaining"
    | "points"
    | "wins"
    | "ot_wins"
    | "ot_losses"
    | "losses"
    | "percentage"
    | undefined;

  const client = getHtClient(league, getHtLocale(ctx));
  const seasons = (await client.getSeasonList()).SiteKit.Seasons;
  if (seasons.length === 0) {
    return ctx.reply({
      content: s(ctx, "noSeasons"),
      flags: MessageFlags.Ephemeral,
    });
  }

  const standings = (
    (
      await client.getStandings(
        Number((seasons.find((s) => s.career !== "0") ?? seasons[0]).season_id),
        "conference",
        "standings",
      )
    ).SiteKit.Statviewtype as HockeyTechTeamStanding[]
  )
    .filter((team) => !!team.team_code)
    .sort((a, b) => (sort ? Number(b[sort] ?? 0) - Number(a[sort] ?? 0) : 0));

  const embed = getStandingsEmbed(
    ctx,
    league,
    [
      "GP",
      // "GR",
      "PTS",
      "W",
      // "OTW",
      "OTL",
      "L",
      "PCT",
    ],
    standings

    .map((team) => ({
      teamCode: team.team_code,
      values: [
        team.games_played,
        // team.games_remaining,
        team.points,
        team.wins,
        // team.ot_wins,
        team.ot_losses,
        team.losses,
        team.percentage,
      ],
    })),
  );

  return ctx.reply({ embeds: [embed] });
};
