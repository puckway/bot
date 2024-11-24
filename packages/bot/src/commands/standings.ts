import { EmbedBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord-api-types/v10";
import HockeyTech from "hockeytech";
import { getBorderCharacters, table } from "table";
import { ChatInputAppCommandCallback } from "../commands";
import { League } from "../db/schema";
import {
  HockeyTechLeague,
  getHtClient,
  getPointsPct,
  isKhl,
} from "../ht/client";
import { InteractionContext } from "../interactions";
import { colors } from "../util/colors";
import { getLeagueLogoUrl } from "../util/emojis";
import { getExternalUtils } from "../util/external";
import {
  getHtLocale,
  getKhlLocale,
  transformLocalizations,
  uni,
} from "../util/l10n";

export interface HockeyTechTeamStanding {
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
  league: HockeyTechLeague,
  headers: string[],
  stats: {
    teamCode: string;
    clinch?: string;
    values: string[];
  }[],
) => {
  const embed = new EmbedBuilder()
    .setAuthor({
      name: `${uni(ctx, league)} Standings`,
      iconURL: getLeagueLogoUrl(league),
      url: getExternalUtils(league).standings(),
    })
    .setColor(colors[league]);

  const dashes = (length: number) => Array(length).fill("-").join("");
  const tableData = [["Rank", "Team", ...headers]];
  tableData.push(tableData[0].map((e) => dashes(e.length + 1)));

  tableData.push(
    ...stats.map((stat, i) => [
      String(i + 1),
      `${stat.teamCode}${stat.clinch ? ` (${stat.clinch})` : ""}`,
      ...stat.values,
    ]),
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

export const getHtStandings = async (
  client: HockeyTech,
  sort?: string,
  seasonId?: number,
) => {
  let sid: "latest" | number | undefined = seasonId;
  if (
    seasonId === undefined &&
    isKhl(client.getClientCode() as HockeyTechLeague)
  ) {
    // The KHL proxy won't return non-career seasons so
    //  we can just use the latest one
    sid = "latest";
  } else if (seasonId === undefined) {
    const seasons = (await client.getSeasonList()).SiteKit.Seasons;
    if (seasons.length === 0 && seasonId === undefined) {
      return null;
    } else if (seasons.length) {
      sid = Number(
        (seasons.find((s) => s.career !== "0") ?? seasons[0]).season_id,
      );
    }
  }
  if (!sid) {
    return null;
  }

  const sortVal = sort as
    | "games_played"
    | "games_remaining"
    | "points"
    | "wins"
    | "ot_wins"
    | "ot_losses"
    | "losses"
    | "percentage"
    | undefined;

  const standings = (
    (
      await client.getStandings(
        // @ts-expect-error
        sid,
        "conference",
        "standings",
      )
    ).SiteKit.Statviewtype as HockeyTechTeamStanding[]
  )
    .filter((team) => !!team.team_code)
    .sort((a, b) =>
      sortVal ? Number(b[sortVal] ?? 0) - Number(a[sortVal] ?? 0) : 0,
    );
  return standings;
};

export const standingsCallback: ChatInputAppCommandCallback = async (ctx) => {
  const league = ctx.getStringOption("league").value as League;
  if (league === "khl") {
    const utils = getExternalUtils(league, getKhlLocale(ctx));
    // biome-ignore lint/style/noNonNullAssertion: Present for KHL leagues
    return ctx.reply(utils.standings!());
  }
  const sort = ctx.getStringOption("sort").value || undefined;
  const seasonId = ctx.getStringOption("season").value || undefined;

  const client = getHtClient(league, getHtLocale(ctx));
  const standings = await getHtStandings(
    client,
    sort,
    seasonId ? Number(seasonId) : undefined,
  );
  if (!standings) {
    return ctx.reply({
      content: s(ctx, "noSeasons"),
      flags: MessageFlags.Ephemeral,
    });
  }

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
    standings.map((team) => ({
      teamCode: team.team_code,
      clinch: team.clinched || undefined,
      values: [
        team.games_played,
        // team.games_remaining,
        team.points,
        team.wins,
        // team.ot_wins,
        team.ot_losses,
        team.losses,
        getPointsPct(
          league as HockeyTechLeague,
          Number(team.points),
          Number(team.games_played),
        ),
      ],
    })),
  );

  return ctx.reply({ embeds: [embed] });
};
