import { ChatInputAppCommandCallback } from "../commands";
import * as api from "api";
import { allTeams } from "../pwhl/team";
import {
  ActionRowBuilder,
  ButtonBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "@discordjs/builders";
import { storeComponents } from "../util/components";
import { ButtonStyle, ChannelType, MessageFlags } from "discord-api-types/v10";
import { transformLocalizations, uni } from "../util/l10n";
import { colors } from "../util/colors";
import { InteractionContext } from "../interactions";
import {
  ButtonCallback,
  MinimumKVComponentState,
  SelectMenuCallback,
} from "../components";
import { League, makeSnowflake, notifications } from "../db/schema";
import { getDb } from "../db";
import { and, eq } from "drizzle-orm";

export interface NotificationSendConfig {
  preview?: boolean;
  threads?: boolean;
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
    hype: "Hype messages",
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
      iconURL: league === "pwhl" ? ctx.env.PWHL_LOGO : undefined,
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
    "start",
    "periods",
    "goals",
    "end",
    "final",
  ] as const;
  const features = allFeatures;
  // I was going to do this in order to allow announcement channels but I decided
  // against it because the type can be swapped with the same channel ID, rendering
  // thread creation suddenly broken. The only workaround as far as I know would be
  // to get every channel every time to make sure it hasn't changed, which is wasteful.
  // Keeping this snippet for posterity in case I try again.
  // .filter(
  //   (f) => !(channelType === ChannelType.GuildAnnouncement && f === "threads"),
  // );

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      await storeComponents(ctx.env.KV, [
        new StringSelectMenuBuilder()
          .setPlaceholder(s(ctx, "selectTeamsPlaceholder"))
          .setMaxValues(
            league === "khl" ? api.allTeams.length : allTeams.length,
          )
          .addOptions(
            league === "khl"
              ? api.allTeams.map((team) => ({
                  label: team.names.en,
                  value: String(team.id),
                  default: teamIds?.includes(String(team.id)),
                }))
              : allTeams.map((team) => ({
                  label: team.name,
                  value: team.id,
                  default: teamIds?.includes(team.id),
                  emoji: {
                    id: ctx.env[
                      `PWHL_TEAM_EMOJI_${team.id}` as keyof typeof ctx.env
                    ],
                  },
                })),
          ),
        {
          componentRoutingId: "select-notifications-teams",
          componentTimeout: 300,
          componentOnce: true,
          league,
          channelId,
          channelType,
        },
      ]),
    ),
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
  };
  const teamIds = ctx.interaction.data.values;

  const db = getDb(ctx.env.DB);
  const settings = await db.query.notifications.findFirst({
    where: eq(notifications.channelId, makeSnowflake(state.channelId)),
    columns: {
      sendConfig: true,
      active: true,
    },
  });
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

  const sendConfig: NotificationSendConfig = {
    preview: false,
    hype: false,
    start: false,
    goals: false,
    penalties: false,
    end: false,
    final: false,
  };
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
