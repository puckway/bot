import {
  ActionRowBuilder,
  EmbedBuilder,
  SelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "@discordjs/builders";
import * as api from "api";
import { APIInteraction, MessageFlags } from "discord-api-types/v10";
import { NumericBoolean, RosterPlayer } from "hockeytech";
import type { APILightPlayer } from "khl-api-types";
import { getBorderCharacters, table } from "table";
import { ChatInputAppCommandCallback } from "../commands";
import { SelectMenuCallback } from "../components";
import { InteractionContext } from "../interactions";
import { HockeyTechLeague, getHtClient } from "../ht/client";
import {
  allAhlTeams,
  allPwhlSeasons,
  getHtTeamLogoUrl,
  getLeagueTeams,
} from "../ht/team";
import { colors } from "../util/colors";
import { storeComponents } from "../util/components";
import { countryCodeEmoji, getTeamEmoji } from "../util/emojis";
import {
  getHtLocale,
  getKhlLocale,
  transformLocalizations,
} from "../util/l10n";
import { getEpHtPlayer } from "../ep/rest";
import { DBWithSchema, getDb } from "../db";
import { League } from "../db/schema";
import { getExternalUtils } from "../util/external";

type KhlPartialPlayer = Pick<APILightPlayer, "id" | "name" | "shirt_number"> & {
  team: { name: string } | null;
};

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

// Abramov Mikhail A. -> Mikhail A. Abramov
// We assume nobody has a last name with a space in it here
// (e.g. "van Pelt"), which might happen, TBD
// Also, this might be a sort of Englishism, I'm not sure if
// the default format makes more sense to Russians. If so, we'll
// want to not do this for the Russian locale.
const reverseName = (name: string) => {
  const i = name.indexOf(" ");
  return `${name.slice(i)} ${name.slice(0, i)}`.trim();
};

const getKhlPlayerEmbed = async (
  ctx: InteractionContext<APIInteraction>,
  playerId: number,
) => {
  const locale = getKhlLocale(ctx);
  const player = await api.getPlayer(playerId, { locale, light: false });
  const name = reverseName(player.name);
  const embed = new EmbedBuilder()
    .setAuthor({
      name: `${name} ${player.shirt_number ? `#${player.shirt_number}` : ""}`,
      url: `${api.DocBaseEnum[locale]}/players/${player.khl_id}`,
      iconURL: (player.team ?? player.teams[0])?.image,
    })
    .setColor(colors.khl)
    .setThumbnail(player.image);

  let description = "";
  if (player.birthday && player.age) {
    const birthdate = new Date(player.birthday * 1000)
      .toISOString()
      .split("T")[0];
    description += `${s(ctx, "born")} ${birthdate} (${player.age})\n`;
  }
  if (player.country) {
    let emoji = "";
    if (player.flag_image_url) {
      const match = player.flag_image_url.match(/([A-Z]{2})\.png$/);
      if (match) {
        emoji = countryCodeEmoji(match[1]);
      }
    }
    description += `${emoji} ${player.country}`.trim();
    description += "\n";
  }
  if (player.role) {
    description += `${s(ctx, "position")} ${player.role} ${
      player.stick ? `(${player.stick.toUpperCase()})` : ""
    }\n`;
  }
  if (player.height) {
    const inches = player.height * 0.39;
    const feet = Math.floor(inches / 12);
    const imperial = `${feet}'${Math.floor(inches - feet * 12)}"`;

    description += `${s(ctx, "height")} ${player.height} cm / ${imperial}\n`;
  }
  if (player.weight) {
    const pounds = Math.floor(player.weight * 2.2);
    // const stones = Math.floor(player.weight * 0.15747);
    description += `${s(ctx, "weight")} ${player.weight} kg / ${pounds} lb\n`;
  }
  embed.setDescription(description.slice(0, 4096));

  embed.addFields(
    player.teams
      // Sometimes divisions are included with an empty `location`
      // We could hardcode a list of division IDs or we could just check this
      .filter((t) => !!t.location)
      .slice(0, 5)
      .map((team) => {
        const emoji = getTeamEmoji("khl", team.id);
        return {
          name: `${emoji} ${team.name}`,
          value: team.seasons.split(",").join(", ").slice(0, 1024),
          inline: false,
        };
      }),
  );

  return embed;
};

export const playerCallback: ChatInputAppCommandCallback = (ctx) => {
  if (["khl"].includes(ctx.getStringOption("league").value)) {
    return khlPlayerCallback(ctx);
  } else {
    return htPlayerCallback(ctx);
  }
};

export const khlPlayerCallback: ChatInputAppCommandCallback = async (ctx) => {
  const query = ctx.getStringOption("name").value.toLowerCase();

  return [
    ctx.defer(),
    async () => {
      // This is really how the KHL app does it. There's no endpoint to
      // search players, so the entire players list is cached and then
      // searched. It's really not that much data, especially when reduced
      // for our KV store, so I'm fine with doing this
      const locale = getKhlLocale(ctx);
      const key = `players-khl-${locale}`;
      const players =
        (await ctx.env.KV.get<KhlPartialPlayer[]>(key, "json")) ??
        (await api.getPlayers({ locale, light: true }));
      await ctx.env.KV.put(
        key,
        JSON.stringify(
          players.map(
            (p) =>
              ({
                id: p.id,
                name: reverseName(p.name),
                shirt_number: p.shirt_number,
                team: p.team ? { name: p.team.name } : undefined,
              }) as KhlPartialPlayer,
          ),
        ),
        {
          // 3 days
          expirationTtl: 259200,
        },
      );

      const matches = players.filter((p) =>
        p.name.toLowerCase().includes(query),
      );
      if (matches.length === 0) {
        await ctx.followup.editOriginalMessage({ content: s(ctx, "noPlayer") });
        return;
      }

      const embed = await getKhlPlayerEmbed(ctx, matches[0].id);
      let components;
      if (matches.length > 1) {
        components = [
          new ActionRowBuilder<SelectMenuBuilder>()
            .addComponents(
              await storeComponents(ctx.env.KV, [
                new StringSelectMenuBuilder().setOptions(
                  matches.slice(0, 25).map((p) =>
                    new StringSelectMenuOptionBuilder({
                      description: p.team
                        ? p.team.name.slice(0, 100)
                        : undefined,
                    })
                      .setValue(`khl-${p.id}`)
                      .setLabel(
                        `${p.name} ${
                          p.shirt_number ? `#${p.shirt_number}` : ""
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

export const playerSearchSelectCallback: SelectMenuCallback = async (ctx) => {
  const value = ctx.interaction.data.values[0];
  const [league, playerId] = value.split("-");
  if (league === "khl") {
    return [
      ctx.defer(),
      async () => {
        const embed = await getKhlPlayerEmbed(ctx, Number(playerId));
        await ctx.followup.editOriginalMessage({ embeds: [embed.toJSON()] });
      },
    ];
  } else {
    const embed = await getHtPlayerEmbed(
      ctx,
      league as HockeyTechLeague,
      Number(playerId),
    );
    return ctx.updateMessage({ embeds: [embed.toJSON()] });
  }
};

const getHtPlayerEmbed = async (
  ctx: InteractionContext<APIInteraction>,
  league: HockeyTechLeague,
  playerInput: number | RosterPlayer,
  db?: DBWithSchema,
) => {
  const locale = getHtLocale(ctx);
  const client = getHtClient(league, locale);
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
      : getLeagueTeams(league).find((t) => t.id === teamId)?.name;
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

  const currentSeason = allPwhlSeasons[0];
  const allStats = (
    await client.getPlayerProfileStatsBySeason(Number(playerId))
  ).SiteKit.Player;
  const currentStats = allStats[currentSeason.type]?.find((_, i) => i === 0);
  const totalStats = allStats[currentSeason.type]?.find(
    (_, i, a) => i === a.length - 1,
  );

  const utils = getExternalUtils(league, locale);
  const embed = new EmbedBuilder()
    .setAuthor({
      name: `${player.name} ${number ? `#${number}` : ""}`,
      url: utils.player(playerId),
      iconURL: teamId ? getHtTeamLogoUrl(league, teamId) : undefined,
    })
    .setColor(colors[league])
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
    const today = new Date();
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
  if (playerDetails?.height) {
    const inches = playerDetails.height * 0.39;
    const feet = Math.floor(inches / 12);
    const imperial = `${feet}' ${Math.floor(inches - feet * 12)}"`;

    description += `${s(ctx, "height")} ${
      playerDetails.height
    } cm / ${imperial}\n`;
  } else if (player.height && player.height !== "0") {
    const [feet, inches] = player.height.split("-").map(Number);
    const cm = Math.floor((feet * 12 + inches) / 0.39);

    description += `${s(ctx, "height")} ${cm} cm / ${feet}' ${inches}"\n`;
  }
  if (playerDetails?.weight) {
    const pounds = Math.floor(playerDetails.weight * 2.2);
    // const stones = Math.floor(player.weight * 0.15747);
    description += `${s(ctx, "weight")} ${
      playerDetails.weight
    } kg / ${pounds} lb\n`;
  } else if (player.weight && player.weight !== "0") {
    const kilograms = Math.floor(Number(player.weight) / 2.2);
    description += `${s(ctx, "weight")} ${kilograms} kg / ${
      player.weight
    } lb\n`;
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
    text: "Some data shown may be from eliteprospects.com",
  });

  return embed;
};

export const htPlayerCallback: ChatInputAppCommandCallback = async (ctx) => {
  const league = ctx.getStringOption("league").value as HockeyTechLeague;
  const query = ctx.getStringOption("name").value.toLowerCase();

  return [
    ctx.defer(),
    async () => {
      const locale = getHtLocale(ctx);
      const client = getHtClient(league, locale);
      const data = await client.searchPerson(query);
      const players = data.SiteKit.Searchplayers.filter(
        (p) => p.role_name === "Player",
      );

      if (players.length === 0) {
        await ctx.followup.editOriginalMessage({ content: s(ctx, "noPlayer") });
        return;
      }

      const embed = await getHtPlayerEmbed(
        ctx,
        league,
        Number(players[0].player_id),
      );
      let components;
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

  if (league === "khl") {
    return ctx.reply({
      content: "This league is not supported for this command.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const client = getHtClient(league, getHtLocale(ctx));
  const roster = (await client.getRoster(Number(allPwhlSeasons[0].id), teamId))
    .SiteKit.Roster;
  // We assume no duplicates
  const player = roster.find(
    (player) => player.tp_jersey_number === String(playerNumber),
  );
  if (!player) {
    return ctx.reply({
      content: s(ctx, "noPlayer"),
      flags: MessageFlags.Ephemeral,
    });
  }

  const embed = await getHtPlayerEmbed(ctx, league, player);
  return ctx.reply({ embeds: [embed.toJSON()] });
};
