import {
  ActionRowBuilder,
  EmbedBuilder,
  type SelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "@discordjs/builders";
import type {
  APIInteraction,
  APIMessageTopLevelComponent,
} from "discord-api-types/v10";
import type {
  NumericBoolean,
  PlayerSeasonStat,
  PlayerSeasonStatTotal,
  RosterPlayer,
} from "hockeytech";
import { getBorderCharacters, table } from "table";
import type { ChatInputAppCommandCallback } from "../commands";
import type { SelectMenuCallback } from "../components";
import { type DBWithSchema, getDb } from "../db";
import type { League } from "../db/schema";
import { getEpHtPlayer } from "../ep/rest";
import { getHtClient, type HockeyTechLeague, isKhl } from "../ht/client";
import { getHtTeamLogoUrl } from "../ht/team";
import { leagueTeams } from "../ht/teams";
import type { InteractionContext } from "../interactions";
import { getTeamColor } from "../util/colors";
import { storeComponents } from "../util/components";
import { getTeamEmoji } from "../util/emojis";
import { getExternalUtils } from "../util/external";
import { getHtLocale, transformLocalizations } from "../util/l10n";
import { getNow } from "../util/time";

const s = transformLocalizations({
  en: {
    players: "Players",
    noPlayer: "No players were found.",
    born: "Born:",
    height: "Height:",
    weight: "Weight:",
    position: "Position:",
    country: "Country:",
    stick: "stick",
  },
  ru: {
    players: "Игроки",
  },
  cn: {
    players: "球员",
  },
  fr: {
    // This is the feminine form. We're assuming most French-speaking
    // users will be looking at the PWHL and not the KHL
    players: "Joueuses",
    noPlayer: "Aucun joueur n'a pu être trouvé.",
    born: "Date de naissance",
  },
});

export const playerSearchSelectCallback: SelectMenuCallback = async (ctx) => {
  const value = ctx.interaction.data.values[0];
  const [league, playerId] = value.split("-");
  return [
    ctx.defer(),
    async () => {
      const embed = await getPlayerEmbed(
        ctx,
        league as League,
        Number(playerId),
      );
      await ctx.followup.editOriginalMessage({ embeds: [embed.toJSON()] });
    },
  ];
};

const cmToImperialHeight = (cm: number) => {
  const inches = cm * 0.39;
  const feet = Math.floor(inches / 12);
  return `${feet}' ${Math.min(Math.round(inches - feet * 12), 11)}"`;
};

/**
 * Convert a player height value to cm
 * @param height Raw value from the player object
 */
const parseHeight = (height: string): number | null => {
  // already in cm
  if (!Number.isNaN(Number(height))) {
    return Number(height);
  }

  // AHL
  const [feet, inches] = height.split("-").map(Number);
  if (!Number.isNaN(feet) && !Number.isNaN(inches)) {
    return Math.floor((feet * 12 + inches) / 0.39);
  }

  // PWHL
  const match = height.match(/(\d+)' ?(\d+)"?/);
  if (match) {
    const [, feet, inches] = match.map(Number);
    return Math.floor((feet * 12 + inches) / 0.39);
  }
  return null;
};

const getPlayerEmbed = async (
  ctx: InteractionContext<APIInteraction>,
  league: HockeyTechLeague,
  playerInput: number | RosterPlayer,
  db?: DBWithSchema,
) => {
  const locale = getHtLocale(ctx);
  const client = getHtClient(ctx.env, league, locale);
  const player =
    typeof playerInput === "number"
      ? (await client.getPlayerProfileBio(playerInput)).SiteKit.Player
      : playerInput;

  const playerId =
    "player_id" in player ? player.player_id : String(playerInput);
  const teamId =
    player.current_team ||
    ("most_recent_team_id" in player
      ? player.most_recent_team_id
      : player.latest_team_id);
  const teamName =
    "most_recent_team_name" in player
      ? player.most_recent_team_name
      : leagueTeams[league].find((t) => t.id === teamId)?.name;
  const number =
    "jersey_number" in player ? player.jersey_number : player.tp_jersey_number;

  const playerDetails = await getEpHtPlayer(
    playerId,
    player,
    league,
    db ?? getDb(ctx.env.DB),
    teamName,
  );
  const epUrl = playerDetails?.epId
    ? `https://www.eliteprospects.com/player/${playerDetails.epId}/${playerDetails.epSlug}`
    : undefined;

  const allStats = (
    await client.getPlayerProfileStatsBySeason(Number(playerId))
  ).SiteKit.Player;

  // To avoid storing every season for every league, we find the season with
  // the latest start date, determine what type it is, then get the correct pair
  // of season and total columns with that type.
  const statSeasons: Array<PlayerSeasonStat | PlayerSeasonStatTotal> =
    Object.values(allStats).reduce((a, b) => {
      a.push(...b);
      return a;
    });
  const latest = [...statSeasons].sort(
    (a, b) =>
      new Date(b.max_start_date).getTime() -
      new Date(a.max_start_date).getTime(),
  )[0];
  const type = latest
    ? String(latest.playoff) === "1"
      ? "playoff"
      : String(latest.career) === "0"
        ? "exhibition"
        : "regular"
    : "regular";

  const currentStats = allStats[type]?.[0];
  const totalStats = allStats[type]?.find(
    (s, i, a) =>
      typeof s.season_id === "number" ||
      s.season_name === "Total" ||
      i === a.length - 1,
  );

  const utils = getExternalUtils(league, locale);
  const embed = new EmbedBuilder()
    .setAuthor({
      name: `${player.name} ${number ? `#${number}` : ""}`,
      url: utils.player(playerId),
      iconURL: teamId ? getHtTeamLogoUrl(league, teamId) : undefined,
    })
    .setColor(getTeamColor(league, teamId))
    .setThumbnail(
      ("primary_image" in player
        ? player.primary_image
        : player.player_image) ||
        (playerDetails?.epImage
          ? `https://files.eliteprospects.com/layout/players/${playerDetails?.epImage}`
          : null),
    );

  let description = "";
  if (player.birthdate) {
    const today = getNow();
    const birthdate = new Date(player.birthdate);
    const age = Math.floor(
      (today.getTime() - birthdate.getTime()) / 31_556_952_000,
    );
    const birthdayToday =
      birthdate.getUTCMonth() === today.getUTCMonth() &&
      birthdate.getUTCDate() === today.getUTCDate();
    description += `${s(ctx, "born")} ${player.birthdate} (${age}${
      birthdayToday ? " :tada:" : ""
    })\n`;
  }
  const hometown =
    player.birthtown ||
    player.birthprov ||
    player.birthcntry ||
    playerDetails?.country;
  if (hometown) {
    description += `${hometown}\n`;
  }
  if (player.position) {
    description += `${s(ctx, "position")} ${player.position} ${
      player.shoots ? `(${player.shoots})` : ""
    }\n`;
  }
  // Hockeytech returns imperial units but we also deal with metric units
  if (player.height && player.height !== "0") {
    const cm = parseHeight(player.height);
    if (cm !== null) {
      const imperial = cmToImperialHeight(cm);
      description += `${s(ctx, "height")} ${cm} cm / ${imperial}\n`;
    }
  } else if (playerDetails?.height) {
    const cm = playerDetails.height;
    const imperial = cmToImperialHeight(cm);
    description += `${s(ctx, "height")} ${cm} cm / ${imperial}\n`;
  }
  if (player.weight && player.weight !== "0") {
    const kilograms = Math.floor(Number(player.weight) / 2.2);
    description += `${s(ctx, "weight")} ${kilograms} kg / ${
      player.weight
    } lb\n`;
  } else if (playerDetails?.weight) {
    const pounds = Math.floor(playerDetails.weight * 2.2);
    // const stones = Math.floor(player.weight * 0.15747);
    description += `${s(ctx, "weight")} ${
      playerDetails.weight
    } kg / ${pounds} lb\n`;
  }
  if (epUrl) {
    description += `[Elite Prospects](${epUrl})`;
  }

  if ("draft" in player && player.draft[0]) {
    const ordinal = (num: string | number) => {
      const n = String(num);
      return n.endsWith("1")
        ? `${num}st`
        : n.endsWith("2")
          ? `${num}nd`
          : n.endsWith("3")
            ? `${num}rd`
            : `${num}th`;
    };
    const draft = player.draft[0] as {
      id: string;
      draft_league: string;
      draft_team: string;
      draft_team_id: string;
      draft_year: string;
      draft_round: string;
      draft_rank: string;
      draft_junior_team: string;
      draft_logo: string;
      draft_logo_caption: string;
      show_on_roster: NumericBoolean;
      draft_text: string;
    };
    embed.addFields({
      name: "Draft",
      value: [
        `${draft.draft_team} (${draft.draft_league}), ${draft.draft_year}`,
        `Round ${draft.draft_round} - ${ordinal(draft.draft_rank)} overall`,
      ].join("\n"),
      inline: false,
    });
    if (draft.draft_team_id === teamId && draft.draft_logo) {
      // We know this URL will work
      // biome-ignore lint/style/noNonNullAssertion: Already set above
      embed.setAuthor({ ...embed.data.author!, iconURL: draft.draft_logo });
    }
  }

  if (currentStats && totalStats) {
    const dashes = (length: number) => Array(length).fill("-").join("");
    const tableData = [
      ["Stats", totalStats.season_name, currentStats.shortname],
      [
        "-------",
        dashes(totalStats.season_name.length),
        dashes(currentStats.shortname.length),
      ],
      [
        "GP",
        `[ ${totalStats.games_played} ]`,
        `[ ${currentStats.games_played} ]`,
      ],
    ];
    if (
      player.position === "G" &&
      "savepct" in currentStats &&
      "savepct" in totalStats
    ) {
      tableData.push(
        ["SV%", `[ ${totalStats.savepct} ]`, `[ ${currentStats.savepct} ]`],
        [
          "GAA",
          `[ ${totalStats.goals_against_average} ]`,
          `[ ${currentStats.goals_against_average} ]`,
        ],
        ["Wins", `[ ${totalStats.wins} ]`, `[ ${currentStats.wins} ]`],
        ["Losses", `[ ${totalStats.losses} ]`, `[ ${currentStats.losses} ]`],
        ["OTL", `[ ${totalStats.ot_losses} ]`, `[ ${currentStats.ot_losses} ]`],
        ["SO", `[ ${totalStats.shutouts} ]`, `[ ${currentStats.shutouts} ]`],
      );
    } else if ("shots" in currentStats && "shots" in totalStats) {
      tableData.push(
        ["Goals", `[ ${totalStats.goals} ]`, `[ ${currentStats.goals} ]`],
        ["Shots", `[ ${totalStats.shots} ]`, `[ ${currentStats.shots} ]`],
        ["Points", `[ ${totalStats.points} ]`, `[ ${currentStats.points} ]`],
        ["Assists", `[ ${totalStats.assists} ]`, `[ ${currentStats.assists} ]`],
        [
          "+/-",
          `[ ${totalStats.plus_minus} ]`,
          `[ ${currentStats.plus_minus} ]`,
        ],
        [
          "PIM",
          `[ ${totalStats.penalty_minutes} ]`,
          `[ ${currentStats.penalty_minutes} ]`,
        ],
      );
    }
    if (isKhl(league)) {
      // Our KHL proxy is unable to get historical data, so we're going to
      // take out the middle (total) column
      for (const row of tableData) {
        row.splice(1, 1);
      }
    }

    embed.addFields({
      name: "Stats",
      value: `${
        teamId && teamName ? `${getTeamEmoji(league, teamId)} ${teamName}` : ""
      }\n\`\`\`apache\n${table(tableData, {
        border: getBorderCharacters("void"),
        columnDefault: { paddingLeft: 0, paddingRight: 1 },
        drawHorizontalLine: () => false,
      })}\`\`\``,
      inline: false,
    });
  } else if (teamId && teamName) {
    description += `\n${getTeamEmoji(league, teamId)} ${teamName}`;
  }

  embed.setDescription(description.slice(0, 4096));
  embed.setFooter({
    text: [
      "Some data shown may be from eliteprospects.com.",
      isKhl(league) ? "Historical data is unavailable for KHL leagues." : "",
    ]
      .join("\n")
      .trim(),
  });

  return embed;
};

export const playerCallback: ChatInputAppCommandCallback = async (ctx) => {
  const league = ctx.getStringOption("league").value as League;
  const query = ctx.getStringOption("name").value.toLowerCase();

  return [
    ctx.defer(),
    async () => {
      const locale = getHtLocale(ctx);
      const client = getHtClient(ctx.env, league, locale);
      const data = await client.searchPerson(query);
      const players = data.SiteKit.Searchplayers.filter(
        (p) => p.role_name === "Player",
      );

      if (players.length === 0) {
        await ctx.followup.editOriginalMessage({ content: s(ctx, "noPlayer") });
        return;
      }

      const embed = await getPlayerEmbed(
        ctx,
        league,
        Number(players[0].player_id),
      );
      let components: APIMessageTopLevelComponent[] | undefined;
      if (players.length > 1) {
        components = [
          new ActionRowBuilder<SelectMenuBuilder>()
            .addComponents(
              await storeComponents(ctx.env.KV, [
                new StringSelectMenuBuilder().setOptions(
                  players.slice(0, 25).map((p) =>
                    new StringSelectMenuOptionBuilder({
                      description: p.last_team_name
                        ? p.last_team_name.slice(0, 100)
                        : undefined,
                    })
                      .setValue(`${league}-${p.player_id}`)
                      .setLabel(
                        `${p.first_name} ${p.last_name} ${
                          p.jersey_number ? `#${p.jersey_number}` : ""
                        }`.slice(0, 100),
                      ),
                  ),
                ),
                {
                  componentRoutingId: "player-search",
                  componentTimeout: 600,
                },
              ]),
            )
            .toJSON(),
        ];
      }

      await ctx.followup.editOriginalMessage({
        embeds: [embed.toJSON()],
        components,
      });
    },
  ];
};

export const whoisCallback: ChatInputAppCommandCallback = async (ctx) => {
  const league = ctx.getStringOption("league").value as League;
  const playerNumber = ctx.getIntegerOption("number").value;
  const teamId = Number(ctx.getStringOption("team").value);

  return [
    ctx.defer({ ephemeral: true }),
    async () => {
      const client = getHtClient(ctx.env, league, getHtLocale(ctx));
      const seasons = (await client.getSeasonList()).SiteKit.Seasons;
      // All star seasons can behave weirdly
      const season = seasons.find((s) => s.career === "1") ?? seasons[0];
      const roster = (await client.getRoster(Number(season.season_id), teamId))
        .SiteKit.Roster;
      // We assume no duplicates
      const player = roster.find(
        (player) => player.tp_jersey_number === String(playerNumber),
      );
      if (!player) {
        await ctx.followup.editOriginalMessage({ content: s(ctx, "noPlayer") });
        return;
      }

      const embed = await getPlayerEmbed(ctx, league, player);
      await ctx.followup.editOriginalMessage({ embeds: [embed.toJSON()] });
    },
  ];
};
