import {
  ActionRowBuilder,
  ButtonBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "@discordjs/builders";
import * as api from "api";
import { ButtonStyle, ChannelType, MessageFlags } from "discord-api-types/v10";
import { and, eq } from "drizzle-orm";
import { ChatInputAppCommandCallback } from "../commands";
import {
  ButtonCallback,
  MinimumKVComponentState,
  SelectMenuCallback,
} from "../components";
import { getDb } from "../db";
import { League, makeSnowflake, notifications } from "../db/schema";
import { getLeagueTeams } from "../ht/team";
import { InteractionContext } from "../interactions";
import { colors } from "../util/colors";
import { storeComponents } from "../util/components";
import { getLeagueLogoUrl, getTeamPartialEmoji } from "../util/emojis";
import { transformLocalizations, uni } from "../util/l10n";

export interface NotificationSendConfig {
  preview?: boolean;
  threads?: boolean;
  lineups?: boolean;
  hype?: boolean;
  start?: boolean;
  periods?: boolean;
  goals?: boolean;
  penalties?: boolean;
  end?: boolean;
  final?: boolean;
}

const s = transformLocalizations({
  en: {
    settings: "Notification Settings",
    selectTeamsPlaceholder: "Select the teams to be posted",
    selectFeatures: "Select features",
    active: "Active",
    activate: "Activate",
    deactivate: "Deactivate",
    channel: "Channel",
    preview: "Preview",
    previewDescription:
      "Sent 6 hours before game time. Shows location, tickets, & records",
    threads: "Threads",
    threadsDescription: "Public chat thread under the preview or start message",
    lineups: "Lineups",
    lineupsDescription:
      "Projected roster for the game. Sent 1 hour before game time",
    hype: "Hype messages",
    hypeDescription: "Sent at intervals before the game starts",
    start: "Game start",
    startDescription: "First period started",
    periods: "Periods",
    periodsDescription: "Any period started",
    goals: "Goals",
    goalsDescription: "A goal was scored by either team",
    penalties: "Penalties",
    penaltiesDescription: "Either team was penalized",
    end: "Game end",
    endDescription: "Last period ended",
    final: "Game final",
    finalDescription:
      "Final score posted online. Stats shouldn't change after this",
  },
  fr: {
    settings: "Paramètres de notification",
    selectTeamsPlaceholder: "Sélectionner les équipes à poster",
    selectFeatures: "Sélectionnez les fonctionnalités",
    active: "Actif",
    activate: "Activer",
    deactivate: "Désactiver",
    channel: "Salon",
    preview: "Aperçu",
    threads: "Fils de discussion",
    lineups: "Formations",
    lineupsDescription:
      "Liste projetée pour le match. Envoyé 1 heure avant le match",
    hype: "Messages d'enthousiasme",
    start: "Début du jeu",
    periods: "Périodes",
    goals: "Buts",
    penalties: "Pénalités",
    end: "Fin du jeu",
    final: "Résultat final du match",
  },
});

const emojiBool = (value: boolean) =>
  `<:${value}:${value ? "834927244500533258" : "834927293633527839"}>`;

const getSettingsEmbed = (
  ctx: InteractionContext,
  league: League,
  channelId: string,
  active?: boolean | null,
) => {
  return new EmbedBuilder()
    .setAuthor({
      name: uni(ctx, league),
      iconURL: getLeagueLogoUrl(league),
    })
    .setTitle(`${s(ctx, "settings")} (<#${channelId}>)`)
    .setDescription(`${emojiBool(active ?? false)} ${s(ctx, "active")}`)
    .setColor(colors.main)
    .toJSON();
};

const getComponents = async (
  ctx: InteractionContext,
  league: League,
  channelId: string,
  channelType: ChannelType,
  sendConfig?: NotificationSendConfig,
  teamIds?: string[],
  active?: boolean,
) => {
  const allFeatures = [
    "preview",
    "threads",
    "lineups",
    "start",
    "periods",
    "goals",
    "penalties",
    "end",
    "final",
  ] satisfies (keyof NotificationSendConfig)[];
  const features = allFeatures;
  // I was going to do this in order to allow announcement channels but I decided
  // against it because the type can be swapped with the same channel ID, rendering
  // thread creation suddenly broken. The only workaround as far as I know would be
  // to get every channel every time to make sure it hasn't changed, which is wasteful.
  // Keeping this snippet for posterity in case I try again.
  // .filter(
  //   (f) => !(channelType === ChannelType.GuildAnnouncement && f === "threads"),
  // );

  const options =
    league === "khl"
      ? api.allTeams.map((team) => ({
          label: team.names.en,
          value: String(team.id),
          default: teamIds?.includes(String(team.id)),
          emoji: getTeamPartialEmoji(league, team.id),
        }))
      : getLeagueTeams(league).map((team) => ({
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
            .setMaxValues(opts.length)
            .addOptions(opts),
          {
            componentRoutingId: "select-notifications-teams",
            componentTimeout: 300,
            componentOnce: true,
            league,
            channelId,
            channelType,
            selectIndex,
          },
        ]),
      ),
    );
    selectIndex += 1;
  }

  return [
    ...optionGroups,
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      await storeComponents(ctx.env.KV, [
        new StringSelectMenuBuilder()
          .setPlaceholder(s(ctx, "selectFeatures"))
          .setMaxValues(features.length)
          .addOptions(
            features.map(
              (feature) =>
                new StringSelectMenuOptionBuilder({
                  label: s(ctx, feature),
                  description: s(ctx, `${feature}Description`),
                  value: feature,
                  default: sendConfig ? sendConfig[feature] : false,
                }),
            ),
          ),
        {
          componentRoutingId: "select-notifications-features",
          componentTimeout: 300,
          componentOnce: true,
          league,
          channelId,
          channelType,
        },
      ]),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      await storeComponents(ctx.env.KV, [
        new ButtonBuilder({
          label: s(ctx, active ? "deactivate" : "activate"),
          style: active ? ButtonStyle.Danger : ButtonStyle.Success,
        }),
        {
          componentRoutingId: "select-notifications-activate-toggle",
          componentTimeout: 300,
          componentOnce: true,
          league,
          channelId,
          channelType,
        },
      ]),
    ),
  ].map((x) => x.toJSON());
};

export const notificationsCallback: ChatInputAppCommandCallback = async (
  ctx,
) => {
  const league = ctx.getStringOption("league").value as League;
  // biome-ignore lint/style/noNonNullAssertion: Required in command schema
  const channel = ctx.getChannelOption("channel")!;

  const db = getDb(ctx.env.DB);
  const settings = await db.query.notifications.findFirst({
    where: and(
      eq(notifications.channelId, makeSnowflake(channel.id)),
      eq(notifications.league, league),
    ),
    columns: {
      sendConfig: true,
      teamIds: true,
      active: true,
    },
  });

  return [
    ctx.reply({
      embeds: [getSettingsEmbed(ctx, league, channel.id, settings?.active)],
      components: await getComponents(
        ctx,
        league,
        channel.id,
        channel.type,
        settings?.sendConfig,
        settings?.teamIds,
        settings?.active ?? undefined,
      ),
      flags: MessageFlags.Ephemeral,
    }),
    async () => {
      if (!settings) {
        await db
          .insert(notifications)
          .values({
            league,
            channelId: makeSnowflake(channel.id),
          })
          .onConflictDoNothing();
      }
    },
  ];
};

export const selectNotificationTeamCallback: SelectMenuCallback = async (
  ctx,
) => {
  const state = ctx.state as MinimumKVComponentState & {
    league: League;
    channelId: string;
    channelType: ChannelType;
    selectIndex: number;
  };

  const db = getDb(ctx.env.DB);
  const settings = await db.query.notifications.findFirst({
    where: and(
      eq(notifications.league, state.league),
      eq(notifications.channelId, makeSnowflake(state.channelId)),
    ),
    columns: {
      sendConfig: true,
      active: true,
      teamIds: true,
    },
  });

  const allTeamIds =
    state.league === "khl"
      ? api.allTeams.map((team) => String(team.id))
      : getLeagueTeams(state.league).map((team) => team.id);

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
  const teamIds = teamIdGroups.reduce((a, b) => {
    a.push(...b);
    return a;
  }, []);

  await db
    .update(notifications)
    .set({ teamIds })
    .where(
      and(
        eq(notifications.league, state.league),
        eq(notifications.channelId, makeSnowflake(state.channelId)),
      ),
    );

  return ctx.updateMessage({
    components: await getComponents(
      ctx,
      state.league,
      state.channelId,
      state.channelType,
      settings?.sendConfig,
      teamIds,
    ),
  });
};

export const selectNotificationFeaturesCallback: SelectMenuCallback = async (
  ctx,
) => {
  const state = ctx.state as MinimumKVComponentState & {
    league: League;
    channelId: string;
    channelType: ChannelType;
  };
  const featureValues = ctx.interaction.data
    .values as (keyof NotificationSendConfig)[];

  const sendConfig: NotificationSendConfig = {};
  for (const f of featureValues) {
    sendConfig[f] = true;
  }

  const db = getDb(ctx.env.DB);
  const settings = (
    await db
      .insert(notifications)
      .values({
        league: state.league,
        channelId: makeSnowflake(state.channelId),
        sendConfig,
      })
      .onConflictDoUpdate({
        target: [notifications.league, notifications.channelId],
        where: and(
          eq(notifications.league, state.league),
          eq(notifications.channelId, makeSnowflake(state.channelId)),
        ),
        set: { sendConfig },
      })
      .returning({
        sendConfig: notifications.sendConfig,
        teamIds: notifications.teamIds,
        active: notifications.active,
      })
  )[0];

  return ctx.updateMessage({
    embeds: [
      getSettingsEmbed(ctx, state.league, state.channelId, settings.active),
    ],
    components: await getComponents(
      ctx,
      state.league,
      state.channelId,
      state.channelType,
      settings.sendConfig,
      settings.teamIds,
    ),
  });
};

export const toggleNotificationActiveButtonCallback: ButtonCallback = async (
  ctx,
) => {
  const state = ctx.state as MinimumKVComponentState & {
    league: League;
    channelId: string;
    channelType: ChannelType;
  };
  const db = getDb(ctx.env.DB);
  const settings = await db.query.notifications.findFirst({
    where: and(
      eq(notifications.league, state.league),
      eq(notifications.channelId, makeSnowflake(state.channelId)),
    ),
    columns: {
      sendConfig: true,
      teamIds: true,
      active: true,
    },
  });
  // The default state is pseudo-false so we assume we should set it to true
  const active = settings ? !settings.active : true;

  await db
    .insert(notifications)
    .values({
      league: state.league,
      channelId: makeSnowflake(state.channelId),
      active,
    })
    .onConflictDoUpdate({
      target: [notifications.league, notifications.channelId],
      where: and(
        eq(notifications.league, state.league),
        eq(notifications.channelId, makeSnowflake(state.channelId)),
      ),
      set: { active },
    });

  return ctx.updateMessage({
    embeds: [getSettingsEmbed(ctx, state.league, state.channelId, active)],
    components: await getComponents(
      ctx,
      state.league,
      state.channelId,
      state.channelType,
      settings?.sendConfig,
      settings?.teamIds,
      active,
    ),
  });
};
