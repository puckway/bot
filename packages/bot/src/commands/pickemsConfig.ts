import {
  ActionRowBuilder,
  ButtonBuilder,
  ChannelSelectMenuBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from "@discordjs/builders";
import {
  ButtonStyle,
  ChannelType,
  MessageFlags,
  SelectMenuDefaultValueType,
} from "discord-api-types/v10";
import { Snowflake } from "discord-snowflake";
import { and, eq } from "drizzle-orm";
import { ChatInputAppCommandCallback } from "../commands";
import {
  ButtonCallback,
  MinimumKVComponentState,
  SelectMenuCallback,
} from "../components";
import { getDb } from "../db";
import { League, makeSnowflake, pickems } from "../db/schema";
import { leagueTeams } from "../ht/teams";
import { InteractionContext } from "../interactions";
import { colors } from "../util/colors";
import { storeComponents } from "../util/components";
import { getLeagueLogoUrl, getTeamPartialEmoji } from "../util/emojis";
import { transformLocalizations, uni } from "../util/l10n";
import { isPremium } from "../util/premium";
import { emojiBool } from "./notifications";

const s = transformLocalizations({
  en: {
    settings: "Pickems Settings",
    selectTeamsPlaceholder: "Select the teams to be posted",
    selectChannelPlaceholder: "Select the channel to post to",
    active: "Active",
    activate: "Activate",
    deactivate: "Deactivate",
    channel: "Channel",
  },
  fr: {
    settings: "Paramètres de Pickems",
    selectTeamsPlaceholder: "Sélectionner les équipes à poster",
    selectChannelPlaceholder:
      "Sélectionnez le canal sur lequel vous souhaitez publier votre message",
    active: "Actif",
    activate: "Activer",
    deactivate: "Désactiver",
    channel: "Salon",
  },
});

const getSettingsEmbed = (
  ctx: InteractionContext,
  league: League,
  active?: boolean | null,
) => {
  return new EmbedBuilder()
    .setAuthor({
      name: uni(ctx, league),
      iconURL: getLeagueLogoUrl(league),
    })
    .setTitle(`${s(ctx, "settings")}`)
    .setDescription(`${emojiBool(active ?? false)} ${s(ctx, "active")}`)
    .setColor(colors.main)
    .toJSON();
};

const getComponents = async (
  ctx: InteractionContext,
  league: League,
  channelId?: string,
  teamIds?: string[],
  active?: boolean,
) => {
  const options = leagueTeams[league].map((team) => ({
    label: team.name,
    value: team.id,
    default: teamIds?.includes(team.id),
    emoji: getTeamPartialEmoji(league, team.id),
  }));

  const optionGroups = [];
  let selectIndex = 0;
  while (options.length > 0) {
    // Maximum 25 options per select
    const opts = options.splice(0, 25);
    optionGroups.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        await storeComponents(ctx.env.KV, [
          new StringSelectMenuBuilder()
            .setPlaceholder(s(ctx, "selectTeamsPlaceholder"))
            .setMinValues(0)
            .setMaxValues(opts.length)
            .addOptions(opts),
          {
            componentRoutingId: "select-pickems-teams",
            componentTimeout: 300,
            componentOnce: true,
            league,
            selectIndex,
          },
        ]),
      ),
    );
    selectIndex += 1;
  }

  return [
    ...optionGroups,
    new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
      await storeComponents(ctx.env.KV, [
        new ChannelSelectMenuBuilder({
          default_values: channelId
            ? [{ id: channelId, type: SelectMenuDefaultValueType.Channel }]
            : undefined,
        })
          .setPlaceholder(s(ctx, "selectChannelPlaceholder"))
          .setChannelTypes(ChannelType.GuildText),
        {
          componentRoutingId: "select-pickems-channel",
          componentTimeout: 300,
          componentOnce: true,
          league,
        },
      ]),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      (channelId && teamIds && teamIds.length !== 0) || active
        ? await storeComponents(ctx.env.KV, [
            new ButtonBuilder({
              label: s(ctx, active ? "deactivate" : "activate"),
              style: active ? ButtonStyle.Danger : ButtonStyle.Success,
            }),
            {
              componentRoutingId: "select-pickems-activate-toggle",
              componentTimeout: 300,
              componentOnce: true,
              league,
            },
          ])
        : [
            // Don't allow the user to activate unless a
            // channel and a team are selected
            new ButtonBuilder({
              custom_id: "DISABLED",
              label: s(ctx, "activate"),
              style: ButtonStyle.Success,
              disabled: true,
            }),
          ],
    ),
  ].map((x) => x.toJSON());
};

export const pickemsConfigCallback: ChatInputAppCommandCallback = async (
  ctx,
) => {
  const guildId = ctx.interaction.guild_id;
  if (!guildId) throw Error("Guild only");

  if (!isPremium(ctx)) {
    const buttons: ButtonBuilder[] = [];
    if (ctx.env.MONTHLY_SKU) {
      buttons.push(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Premium)
          .setSKUId(ctx.env.MONTHLY_SKU),
      );
    }
    if (ctx.env.LIFETIME_SKU) {
      buttons.push(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Premium)
          .setSKUId(ctx.env.LIFETIME_SKU),
      );
    }

    return ctx.reply({
      content: `Pickems is currently restricted to servers that have Puckway Plus. You can purchase a plan on a ${
        ctx.env.MONTHLY_SKU && ctx.env.LIFETIME_SKU
          ? "monthly or lifetime"
          : ctx.env.MONTHLY_SKU
            ? "monthly"
            : "lifetime"
      } basis.`,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(buttons).toJSON(),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  const league = ctx.getStringOption("league").value as League;

  const db = getDb(ctx.env.DB);
  const settings = await db.query.pickems.findFirst({
    where: and(
      eq(pickems.league, league),
      eq(pickems.guildId, makeSnowflake(guildId)),
    ),
    columns: {
      teamIds: true,
      active: true,
      channelId: true,
    },
  });

  return ctx.reply({
    embeds: [getSettingsEmbed(ctx, league, settings?.active)],
    components: await getComponents(
      ctx,
      league,
      settings?.channelId ?? undefined,
      settings?.teamIds,
      settings?.active ?? undefined,
    ),
    flags: MessageFlags.Ephemeral,
  });
};

export const selectPickemsTeamCallback: SelectMenuCallback = async (ctx) => {
  const guildId = ctx.interaction.guild_id;
  if (!guildId) throw Error("Guild only");

  const state = ctx.state as MinimumKVComponentState & {
    league: League;
    selectIndex: number;
  };

  const db = getDb(ctx.env.DB);
  const settings = await db.query.pickems.findFirst({
    where: and(
      eq(pickems.league, state.league),
      eq(pickems.guildId, makeSnowflake(guildId)),
    ),
    columns: {
      active: true,
      teamIds: true,
      channelId: true,
    },
  });

  const allTeamIds = leagueTeams[state.league].map((team) => team.id);

  // This is a trimmed down mirror of what the user selected from.
  // For leagues with more than 25 teams, this is necessary to determine
  // which team group to overwrite and which to preserve.
  // interaction.message can technically be used for this, but we would have
  // to parse out the components, this is just easier.
  const teamIdGroups: string[][] = [];
  let curIndex = 0;
  while (allTeamIds.length > 0) {
    const opts = allTeamIds.splice(0, 25);
    teamIdGroups.push(
      // Use the user's selection (we have found our select menu), otherwise
      // the team IDs for the group that were already selected
      curIndex === state.selectIndex
        ? ctx.interaction.data.values
        : opts.filter((id) =>
            settings ? settings.teamIds.includes(id) : false,
          ),
    );
    curIndex += 1;
  }

  // Re-combine all team IDs for storage
  const teamIds = teamIdGroups.flat();

  await db
    .insert(pickems)
    .values({ teamIds, league: state.league, guildId: makeSnowflake(guildId) })
    .onConflictDoUpdate({
      target: [pickems.league, pickems.guildId],
      set: { teamIds },
    });

  return ctx.updateMessage({
    embeds: [getSettingsEmbed(ctx, state.league, settings?.active)],
    components: await getComponents(
      ctx,
      state.league,
      settings?.channelId ?? undefined,
      teamIds,
      settings?.active ?? undefined,
    ),
  });
};

export const selectPickemsChannelCallback: SelectMenuCallback = async (ctx) => {
  const guildId = ctx.interaction.guild_id;
  if (!guildId) throw Error("Guild only");

  const state = ctx.state as MinimumKVComponentState & { league: League };
  const channelId = ctx.interaction.data.values[0] as Snowflake;

  const db = getDb(ctx.env.DB);
  const settings = await db.query.pickems.findFirst({
    where: and(
      eq(pickems.league, state.league),
      eq(pickems.guildId, makeSnowflake(guildId)),
    ),
    columns: {
      active: true,
      teamIds: true,
    },
  });

  await db
    .insert(pickems)
    .values({
      channelId,
      league: state.league,
      guildId: makeSnowflake(guildId),
    })
    .onConflictDoUpdate({
      target: [pickems.league, pickems.guildId],
      set: { channelId },
    });

  return ctx.updateMessage({
    components: await getComponents(
      ctx,
      state.league,
      channelId,
      settings?.teamIds,
      settings?.active ?? undefined,
    ),
  });
};

export const togglePickemsActiveButtonCallback: ButtonCallback = async (
  ctx,
) => {
  const guildId = ctx.interaction.guild_id;
  if (!guildId) throw Error("Guild only");

  const state = ctx.state as MinimumKVComponentState & {
    league: League;
  };
  const db = getDb(ctx.env.DB);
  const settings = await db.query.pickems.findFirst({
    where: and(
      eq(pickems.league, state.league),
      eq(pickems.guildId, makeSnowflake(guildId)),
    ),
    columns: {
      teamIds: true,
      active: true,
      channelId: true,
    },
  });
  // The default state is pseudo-false so we assume we should set it to true
  const active = settings ? !settings.active : true;

  await db
    .insert(pickems)
    .values({
      league: state.league,
      guildId: makeSnowflake(guildId),
      active,
    })
    .onConflictDoUpdate({
      target: [pickems.league, pickems.guildId],
      set: { active },
    });

  return ctx.updateMessage({
    embeds: [getSettingsEmbed(ctx, state.league, active)],
    components: await getComponents(
      ctx,
      state.league,
      settings?.channelId ?? undefined,
      settings?.teamIds,
      active,
    ),
  });
};
