import { ChatInputAppCommandCallback } from "../commands";
import type { APILightPlayer } from "khl-api-types";
import * as api from "api";
import {
  getHtLocale,
  getKhlLocale,
  transformLocalizations,
} from "../util/l10n";
import { APIInteraction } from "discord-api-types/v10";
import {
  ActionRowBuilder,
  EmbedBuilder,
  SelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "@discordjs/builders";
import { InteractionContext } from "../interactions";
import { countryCodeEmoji, khlTeamEmoji, pwhlTeamEmoji } from "../util/emojis";
import { SelectMenuCallback } from "../components";
import { storeComponents } from "../util/components";
import { getPwhlClient } from "../pwhl/client";
import { pwhlTeamLogoUrl } from "../pwhl/team";

type KhlPartialPlayer = Pick<APILightPlayer, "id" | "name" | "shirt_number"> & {
  team: { name: string } | null;
};

const s = transformLocalizations({
  en: {
    players: "Players",
    noPlayer: "No player was found by that name.",
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
    noPlayer: "Il n'y a aucun joueur avec ce nom",
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
        const emoji = khlTeamEmoji(ctx.env, team);
        return {
          name: `${emoji} ${team.name}`,
          value: team.seasons.split(",").join(", ").slice(0, 1024),
          inline: false,
        };
      }),
  );

  return embed;
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
    const embed = await getPwhlPlayerEmbed(ctx, Number(playerId));
    return ctx.reply({ embeds: [embed.toJSON()] });
  }
};

const getPwhlPlayerEmbed = async (
  ctx: InteractionContext<APIInteraction>,
  playerId: number,
) => {
  const locale = getHtLocale(ctx);
  const client = getPwhlClient(locale);
  const data = await client.getPlayerProfileBio(playerId);
  const player = data.SiteKit.Player;

  const teamId = player.current_team || player.most_recent_team_id;
  const embed = new EmbedBuilder()
    .setAuthor({
      name: `${player.name} ${
        player.jersey_number ? `#${player.jersey_number}` : ""
      }`,
      url: `https://thepwhl.com/${locale}/stats/${locale === "fr" ? "joueur" : "player"}/${playerId}`,
      iconURL: teamId ? pwhlTeamLogoUrl(teamId) : undefined,
    })
    .setThumbnail(player.primary_image || null);

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
      birthdayToday ? " 🎉" : ""
    })\n`;
  }
  if (player.birthtown || player.birthprov || player.birthcntry) {
    description += `${
      player.birthtown || player.birthprov || player.birthcntry
    }\n`;
  }
  if (player.position) {
    description += `${s(ctx, "position")} ${player.position} ${
      player.shoots ? `(${player.shoots})` : ""
    }\n`;
  }
  // if (player.height) {
  //   const inches = player.height * 0.39;
  //   const feet = Math.floor(inches / 12);
  //   const imperial = `${feet}' ${Math.floor(inches - feet * 12)}"`;

  //   description += `${s(ctx, "height")} ${player.height} cm / ${imperial}\n`;
  // }
  // const weight = Number(player.weight);
  // if (weight && !Number.isNaN(weight)) {
  //   const pounds = Math.floor(player.weight * 2.2);
  //   // const stones = Math.floor(player.weight * 0.15747);
  //   description += `${s(ctx, "weight")} ${player.weight} kg / ${pounds} lb\n`;
  // }
  if (player.most_recent_team_id && player.most_recent_team_name) {
    description += `\n${pwhlTeamEmoji(ctx.env, player.most_recent_team_id)} ${
      player.most_recent_team_name
    }`;
  }
  embed.setDescription(description.slice(0, 4096));
  // embed.setFooter({
  //   text: data.SiteKit.Copyright.required_copyright.slice(0, 2048),
  // });

  return embed;
};

export const pwhlPlayerCallback: ChatInputAppCommandCallback = async (ctx) => {
  const query = ctx.getStringOption("name").value.toLowerCase();

  return [
    ctx.defer(),
    async () => {
      const locale = getHtLocale(ctx);
      const client = getPwhlClient(locale);
      const data = await client.searchPerson(query);
      const players = data.SiteKit.Searchplayers.filter(
        (p) => p.role_name === "Player",
      );

      if (players.length === 0) {
        await ctx.followup.editOriginalMessage({ content: s(ctx, "noPlayer") });
        return;
      }

      const embed = await getPwhlPlayerEmbed(ctx, Number(players[0].player_id));
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
                      .setValue(`pwhl-${p.person_id}`)
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
