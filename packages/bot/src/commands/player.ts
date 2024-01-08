import { ChatInputAppCommandCallback } from "../commands";
import type { APILightPlayer } from "khl-api-types";
import * as api from "api";
import { getKhlLocale, transformLocalizations } from "../util/l10n";
import { APIInteraction } from "discord-api-types/v10";
import {
  ActionRowBuilder,
  EmbedBuilder,
  SelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "@discordjs/builders";
import { InteractionContext } from "../interactions";
import { countryCodeEmoji, khlTeamEmoji } from "../util/emojis";
import { SelectMenuCallback } from "../components";
import { storeComponents } from "../util/components";

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
    role: "Role:",
    country: "Country:",
    stick: "stick",
  },
  ru: {
    players: "Игроки",
  },
  cn: {
    players: "球员",
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

const getPlayerEmbed = async (
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
      iconURL: player.team?.image,
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
    description += `${s(ctx, "role")} ${player.role} ${
      player.stick ? `(${player.stick.toUpperCase()})` : ""
    }\n`;
  }
  if (player.height) {
    const inches = player.height * 0.39;
    const feet = Math.floor(inches / 12);
    const imperial = `${feet}' ${Math.floor(inches - feet * 12)}"`;

    description += `${s(ctx, "height")} ${player.height} cm / ${imperial}\n`;
  }
  if (player.weight) {
    const pounds = Math.floor(player.weight * 2.2);
    // const stones = Math.floor(player.weight * 0.15747);
    description += `${s(ctx, "weight")} ${player.weight} kg / ${pounds} lb\n`;
  }
  embed.setDescription(description.slice(0, 4096));

  embed.addFields(
    [...player.teams]
      .reverse()
      // Sometimes divisions are included with an empty `location`
      // We could hardcode a list of division IDs or we could just check this
      .filter((t) => !!t.location)
      .slice(0, 5)
      .map((team) => {
        const emoji = khlTeamEmoji(ctx.env, team);
        return {
          name: `${team.name} ${emoji}`,
          value: team.seasons.split(",").join(", ").slice(0, 1024),
          inline: false,
        };
      }),
  );

  return embed;
};

export const khlPlayerCallback: ChatInputAppCommandCallback = async (ctx) => {
  const query = ctx.getStringOption("name").value.toLowerCase();

  const findPlayer = async (
    players: KhlPartialPlayer[],
  ): Promise<APIInteractionResponseCallbackData> => {
    const matches = players.filter((p) => p.name.toLowerCase().includes(query));
    if (matches.length === 0) {
      return { content: s(ctx, "noPlayer") };
    }

      const matches = players.filter((p) =>
        p.name.toLowerCase().includes(query),
      );
      if (matches.length === 0) {
        await ctx.followup.editOriginalMessage({ content: s(ctx, "noPlayer") });
        return;
      }

      const embed = await getPlayerEmbed(ctx, matches[0].id);
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
                      .setValue(String(p.id))
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

export const khlPlayerSearchSelectCallback: SelectMenuCallback = async (
  ctx,
) => {
  const value = ctx.interaction.data.values[0];
  return [
    ctx.defer(),
    async () => {
      const embed = await getPlayerEmbed(ctx, Number(value));
      await ctx.followup.editOriginalMessage({ embeds: [embed.toJSON()] });
    },
  ];
};
