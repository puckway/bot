import {
  ActionRowBuilder,
  ButtonBuilder,
  ChannelSelectMenuBuilder,
  ContainerBuilder,
  EmbedBuilder,
  ModalBuilder,
  SectionBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
} from "@discordjs/builders";
import {
  ButtonStyle,
  ChannelType,
  ComponentType,
  MessageFlags,
  TextInputStyle,
} from "discord-api-types/v10";
import { and, eq } from "drizzle-orm";
import { ChatInputAppCommandCallback } from "../commands";
import {
  ButtonCallback,
  MinimumKVComponentState,
  ModalCallback,
  SelectMenuCallback,
} from "../components";
import { getDb } from "../db";
import { League, makeSnowflake, notifications } from "../db/schema";
import { leagueTeams } from "../ht/teams";
import { InteractionContext } from "../interactions";
import { colors } from "../util/colors";
import { getCustomId, storeComponents } from "../util/components";
import {
  getLeagueLogoUrl,
  getTeamEmoji,
  getTeamPartialEmoji,
} from "../util/emojis";
import { transformLocalizations, uni } from "../util/l10n";
// import { BitField, UserFlagsBitField } from "discord-bitflag";

const features = [
  "preview",
  "threads",
  "lineups",
  "start",
  "periods",
  "goals",
  "penalties",
  "end",
  "final",
] as const;

export type NotificationSendConfig = Partial<
  Record<(typeof features)[number] | "hype", boolean>
>;

// export const FeatureFlags = Object.freeze({
//   Preview: 1n << 0n,
//   Threads: 1n << 1n,
//   Lineups: 1n << 2n,
//   Start: 1n << 3n,
//   Periods: 1n << 4n,
//   Goals: 1n << 5n,
//   Penalties: 1n << 6n,
//   End: 1n << 7n,
//   Final: 1n << 8n,
//   Hype: 1n << 9n,
// });

// export class FeatureFlagsBitField extends BitField {
//   ALL = BitField.resolve(Object.values(FeatureFlags));
// }

export type NotificationMirrorConfig = Record<
  /** team ID */
  string,
  Partial<
    Record<
      keyof NotificationSendConfig,
      {
        /** Messages sent to all of these channels (limit 3) */
        channelIds: string[];
        /** If not provided, the embed is mirrored */
        contentTemplate?: string;
      }
    >
  >
>;

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
    // mirroring
    mirrorSettings: "Mirror Settings",
    selectMirrorFeature: "Select feature to set up",
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

export const emojiBool = (value: boolean) =>
  `<:${value}:${value ? "834927244500533258" : "834927293633527839"}>`;

const getSettingsEmbed = (
  ctx: InteractionContext,
  league: League,
  channelId: string,
  active?: boolean | null,
) =>
  new EmbedBuilder()
    .setAuthor({
      name: uni(ctx, league),
      iconURL: getLeagueLogoUrl(league),
    })
    .setTitle(`${s(ctx, "settings")} (<#${channelId}>)`)
    .setDescription(`${emojiBool(active ?? false)} ${s(ctx, "active")}`)
    .setColor(colors.main)
    .toJSON();

// const getSettingsContainer = (
//   ctx: InteractionContext,
//   league: League,
//   channelId: string,
//   active?: boolean | null,
// ) =>
//   new ContainerBuilder()
//     .addSectionComponents((sc) =>
//       sc
//         .addTextDisplayComponents((t) =>
//           t.setContent(`### ${s(ctx, "settings")} (<#${channelId}>)`),
//         )
//         .addTextDisplayComponents((t) =>
//           t.setContent(`${emojiBool(active ?? false)} ${s(ctx, "active")}`),
//         )
//         .setThumbnailAccessory((t) =>
//           t
//             .setURL(getLeagueLogoUrl(league) ?? "")
//             .setDescription(uni(ctx, league)),
//         ),
//     )
//     .setAccentColor(colors.main)
//     .toJSON();

const getMirrorSettingsEmbed = (
  ctx: InteractionContext,
  league: League,
  channelId: string,
) =>
  new EmbedBuilder()
    .setAuthor({
      name: uni(ctx, league),
      iconURL: getLeagueLogoUrl(league),
    })
    .setTitle(`${s(ctx, "mirrorSettings")} (<#${channelId}>)`)
    .setDescription(
      [
        "Each notifications configuration can set up to three mirroring",
        "channels, which can have unique templated content on a per-team",
        "basis.\n\nSelect a team to get started. Only teams that are enabled",
        "for the main configuration are shown.",
      ].join(" "),
    )
    .setColor(colors.main)
    .toJSON();

const getComponents = async (
  ctx: InteractionContext,
  league: League,
  channelId: string,
  channelType: ChannelType,
  sendConfig?: NotificationSendConfig,
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
      await storeComponents(
        ctx.env.KV,
        [
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
        ],
        [
          new ButtonBuilder({
            label: s(ctx, "mirrorSettings"),
            style: ButtonStyle.Secondary,
          }),
          {
            componentRoutingId: "select-notifications-mirror-settings",
            componentTimeout: 300,
            componentOnce: true,
            league,
            channelId,
            channelType,
          },
        ],
      ),
    ),
  ].map((x) => x.toJSON());
};

const getComponentsMirror = async (
  ctx: InteractionContext,
  league: League,
  channelId: string,
  channelType: ChannelType,
  teamIds?: string[],
  active?: boolean,
) => {
  const state = {
    // mode: "mirror",
    league,
    channelId,
    channelType,
  };

  const buttonsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    await storeComponents(
      ctx.env.KV,
      [
        new ButtonBuilder({
          label: s(ctx, active ? "deactivate" : "activate"),
          style: active ? ButtonStyle.Danger : ButtonStyle.Success,
        }),
        {
          componentRoutingId: "select-notifications-activate-toggle",
          componentTimeout: 300,
          componentOnce: true,
          ...state,
        },
      ],
      [
        new ButtonBuilder({
          label: s(ctx, "settings"),
          style: ButtonStyle.Secondary,
        }),
        {
          componentRoutingId: "select-notifications-default-settings",
          componentTimeout: 300,
          componentOnce: true,
          ...state,
        },
      ],
    ),
  );

  const options = leagueTeams[league]
    .filter((team) => teamIds?.includes(team.id))
    .map((team) => ({
      label: team.name,
      value: team.id,
      emoji: getTeamPartialEmoji(league, team.id),
    }));

  // User has no teams selected. Don't store a component for no reason
  if (options.length === 0) {
    return [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("unselectable")
          .setPlaceholder(s(ctx, "selectTeamsPlaceholder"))
          .addOptions({ label: "unselectable", value: "_" })
          .setDisabled(true),
      ),
      buttonsRow,
    ].map((x) => x.toJSON());
  }

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
            .addOptions(opts),
          {
            componentRoutingId: "select-notifications-mirror-team",
            componentTimeout: 300,
            componentOnce: false,
            selectIndex,
            ...state,
          },
        ]),
      ),
    );
    selectIndex += 1;
  }

  return [...optionGroups, buttonsRow].map((x) => x.toJSON());
};

type State = MinimumKVComponentState & {
  league: League;
  channelId: string;
  channelType: ChannelType;
  selectIndex: number;
};

export const notificationsCallback: ChatInputAppCommandCallback = async (
  ctx,
) => {
  const guildId = ctx.interaction.guild_id;
  if (!guildId) throw Error("Guild only");

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
      guildId: true,
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
      if (!settings || settings.guildId === null) {
        await db
          .insert(notifications)
          .values({
            league,
            channelId: makeSnowflake(channel.id),
            guildId: makeSnowflake(guildId),
          })
          // `guildId` is a new column so we want to fill it in when we can
          .onConflictDoUpdate({
            target: [notifications.league, notifications.channelId],
            set: { guildId: makeSnowflake(guildId) },
          });
      }
    },
  ];
};

export const selectNotificationTeamCallback: SelectMenuCallback = async (
  ctx,
) => {
  const guildId = ctx.interaction.guild_id;
  if (!guildId) throw Error("Guild only");

  const state = ctx.state as State;

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
    .update(notifications)
    .set({ teamIds, guildId: makeSnowflake(guildId) })
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
      settings?.active ?? undefined,
    ),
  });
};

export const selectNotificationMirrorTeamCallback: SelectMenuCallback = async (
  ctx,
) => {
  const guildId = ctx.interaction.guild_id;
  if (!guildId) throw Error("Guild only");

  const state = ctx.state as State;
  const teamId = ctx.interaction.data.values[0];

  const db = getDb(ctx.env.DB);
  const settings = await db.query.notifications.findFirst({
    where: and(
      eq(notifications.league, state.league),
      eq(notifications.channelId, makeSnowflake(state.channelId)),
    ),
    columns: { sendConfig: true, mirrorConfig: true },
  });

  const enabledFeatures = features.filter((f) => settings?.sendConfig?.[f]);
  if (enabledFeatures.length === 0) {
    return ctx.reply({
      content:
        "In order to set up mirroring, you'll need to enable some features on the main configuration first.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const container = getMirrorConfigContainer({
    ctx,
    league: state.league,
    teamId,
  });
  const menu = await storeComponents(ctx.env.KV, [
    new StringSelectMenuBuilder()
      .setPlaceholder(s(ctx, "selectMirrorFeature"))
      .addOptions(
        enabledFeatures.map(
          (feature) =>
            new StringSelectMenuOptionBuilder({
              label: s(ctx, feature),
              description: s(ctx, `${feature}Description`),
              value: `${teamId}.${feature}`,
            }),
        ),
      ),
    {
      ...state,
      componentRoutingId: "select-notifications-mirror-feature",
      componentTimeout: 300,
      componentOnce: true,
    },
  ]);
  container.spliceComponents(
    1,
    0,
    new TextDisplayBuilder().setContent("**Feature:**"),
    new ActionRowBuilder().addComponents(menu),
  );
  container.addActionRowComponents((row) =>
    row.addComponents(
      new ChannelSelectMenuBuilder()
        .setPlaceholder("Select or search for channels to mirror to")
        .setCustomId("unselectable")
        .setDisabled(true),
    ),
  );
  return ctx.reply({
    components: [container.toJSON()],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  });
};

export const selectNotificationFeaturesCallback: SelectMenuCallback = async (
  ctx,
) => {
  const guildId = ctx.interaction.guild_id;
  if (!guildId) throw Error("Guild only");

  const state = ctx.state as State;
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
        guildId: makeSnowflake(guildId),
        channelId: makeSnowflake(state.channelId),
        sendConfig,
      })
      .onConflictDoUpdate({
        target: [notifications.league, notifications.channelId],
        where: and(
          eq(notifications.league, state.league),
          eq(notifications.channelId, makeSnowflake(state.channelId)),
        ),
        set: { guildId: makeSnowflake(guildId), sendConfig },
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
      settings.active ?? undefined,
    ),
  });
};

const getMirrorTemplateModal = async (
  ctx: InteractionContext,
  state: State,
  teamId: string,
  feature: keyof NotificationSendConfig,
  contentTemplate: string | undefined,
) => {
  const [modal] = await storeComponents(ctx.env.KV, [
    new ModalBuilder().setTitle("Create a template message").addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("content-template")
          .setLabel("Content Template")
          .setValue(contentTemplate ?? "")
          .setRequired(false)
          .setMaxLength(2000)
          .setPlaceholder(
            "Click the help button for examples! Leave blank to use the default.",
          )
          .setStyle(TextInputStyle.Paragraph),
      ),
    ),
    {
      ...state,
      componentRoutingId: "select-notifications-mirror-modal",
      componentTimeout: 900,
      componentOnce: true,
      teamId,
      feature,
    },
  ]);
  return modal;
};

export const selectNotificationMirrorFeatureCallback: SelectMenuCallback =
  async (ctx) => {
    const guildId = ctx.interaction.guild_id;
    if (!guildId) throw Error("Guild only");

    const state = ctx.state as State;
    const [teamId, value] = ctx.interaction.data.values[0].split(".") as [
      string,
      keyof NotificationSendConfig,
    ];

    const db = getDb(ctx.env.DB);
    const settings = await db.query.notifications.findFirst({
      where: and(
        eq(notifications.league, state.league),
        eq(notifications.channelId, makeSnowflake(state.channelId)),
      ),
      columns: {
        mirrorConfig: true,
        teamIds: true,
        active: true,
      },
    });

    const current = settings?.mirrorConfig?.[teamId]?.[value];
    const modal = await getMirrorTemplateModal(
      ctx,
      state,
      teamId,
      value,
      current?.contentTemplate,
    );

    const [channelSelect, modalButton] = (await storeComponents(
      ctx.env.KV,
      [
        new ChannelSelectMenuBuilder()
          .setChannelTypes(
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement,
            ChannelType.PublicThread,
            ChannelType.PrivateThread,
            ChannelType.AnnouncementThread,
          )
          .setPlaceholder("Select or search for channels to mirror to")
          .setDefaultChannels(current?.channelIds ?? [])
          .setMinValues(1)
          .setMaxValues(3),
        {
          ...state,
          componentRoutingId: "select-notifications-mirror-channels",
          componentTimeout: 600,
          componentOnce: false,
          teamId,
          feature: value,
        },
      ],
      [
        new ButtonBuilder()
          .setId(100)
          .setStyle(ButtonStyle.Primary)
          .setLabel("Template Message"),
        {
          ...state,
          modal: modal.toJSON(),
          componentRoutingId: "reopen-modal",
          componentTimeout: 600,
          componentOnce: false,
        },
      ],
    )) as [ChannelSelectMenuBuilder, ButtonBuilder];

    const container = getMirrorConfigContainer({
      ctx,
      league: state.league,
      teamId,
      feature: value,
      config: settings?.mirrorConfig,
      templateAccessory: modalButton,
    });

    container.spliceComponents(
      2,
      0,
      new ActionRowBuilder().addComponents(channelSelect),
    );

    return ctx.updateMessage({
      components: [
        container,
        await getMirrorConfigFooterRow({
          ctx,
          league: state.league,
          channelId: state.channelId,
          teamId,
          feature: value,
        }),
      ].map((x) => x.toJSON()),
    });
  };

const getMirrorConfigFooterRow = async ({
  ctx,
  league,
  channelId,
  teamId,
  feature,
}: {
  ctx: InteractionContext;
  league: League;
  channelId: string;
  teamId: string;
  feature: keyof NotificationSendConfig;
}) => {
  const [deleteButton] = await storeComponents(ctx.env.KV, [
    new ButtonBuilder().setLabel("Delete").setStyle(ButtonStyle.Danger),
    {
      componentRoutingId: "delete-notifications-mirror",
      componentOnce: true,
      componentTimeout: 300,
      league,
      channelId,
      teamId,
      feature,
    },
  ]);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("p_mirror-template-help")
      .setStyle(ButtonStyle.Secondary)
      .setLabel("Help"),
    deleteButton,
  );
};

const getMirrorConfigContainer = ({
  ctx,
  league,
  teamId,
  feature,
  config,
  templateAccessory,
}: {
  ctx: InteractionContext;
  league: League;
  teamId: string;
  feature?: keyof NotificationSendConfig;
  config?: NotificationMirrorConfig;
  templateAccessory?: ButtonBuilder;
}): ContainerBuilder => {
  const team = leagueTeams[league].find((t) => t.id === teamId);
  const configData =
    config && feature ? config[teamId]?.[feature] ?? { channelIds: [] } : null;

  const container = new ContainerBuilder()
    .setAccentColor(colors.main)
    .addSectionComponents((sc) =>
      sc
        .addTextDisplayComponents((t) =>
          t.setContent(`### ${uni(ctx, league)} - ${s(ctx, "mirrorSettings")}`),
        )
        .addTextDisplayComponents((t) =>
          t.setContent(
            [
              `**Team:**\n${getTeamEmoji(league, teamId)} ${
                team?.name ?? "Unknown"
              }`,
              feature ? `**Feature:**\n${s(ctx, feature)}` : "",
            ]
              .join("\n")
              .trim(),
          ),
        )
        .setThumbnailAccessory((t) => t.setURL(getLeagueLogoUrl(league) ?? "")),
    )
    .addTextDisplayComponents((t) => t.setContent("**Channels:**"));
  if (configData) {
    container.addSectionComponents((sc) =>
      sc
        .addTextDisplayComponents((t) => t.setContent("**Content Template:**"))
        .addTextDisplayComponents((t) =>
          t.setContent(
            configData?.contentTemplate
              ? `\`\`\`${configData?.contentTemplate}\`\`\``
              : "None",
          ),
        )
        .setButtonAccessory(
          templateAccessory ??
            ((b) =>
              b
                .setStyle(ButtonStyle.Link)
                .setLabel("Placeholder")
                .setURL("http://localhost")),
        ),
    );
  }
  return container;
};

export const selectNotificationMirrorChannelsCallback: SelectMenuCallback =
  async (ctx) => {
    const guildId = ctx.interaction.guild_id;
    if (!guildId) throw Error("Guild only");

    const state = ctx.state as State & {
      teamId: string;
      feature: keyof NotificationSendConfig;
    };
    const channelIds = ctx.interaction.data.values;

    const db = getDb(ctx.env.DB);
    const settings = await db.query.notifications.findFirst({
      where: and(
        eq(notifications.league, state.league),
        eq(notifications.channelId, makeSnowflake(state.channelId)),
      ),
      columns: { mirrorConfig: true },
    });

    // assign new data
    let config = settings?.mirrorConfig;
    if (config) {
      const featureConfig = config[state.teamId]?.[state.feature];
      if (featureConfig) {
        featureConfig.channelIds = channelIds;
      } else if (config[state.teamId]) {
        config[state.teamId][state.feature] = { channelIds };
      } else {
        config[state.teamId] = { [state.feature]: { channelIds } };
      }
    } else {
      config = { [state.teamId]: { [state.feature]: { channelIds } } };
    }

    await db
      .insert(notifications)
      .values({
        league: state.league,
        channelId: makeSnowflake(state.channelId),
        mirrorConfig: config,
      })
      .onConflictDoUpdate({
        target: [notifications.league, notifications.channelId],
        set: { mirrorConfig: config },
      });

    // I wanted to pull the existing custom IDs from the other components using
    // interaction.message but I'm not sure how reliable that would be.
    const modal = await getMirrorTemplateModal(
      ctx,
      state,
      state.teamId,
      state.feature,
      config[state.teamId]?.[state.feature]?.contentTemplate,
    );
    const [modalButton] = await storeComponents(ctx.env.KV, [
      new ButtonBuilder()
        .setId(100)
        .setStyle(ButtonStyle.Primary)
        .setLabel("Template Message"),
      {
        ...state,
        modal: modal.toJSON(),
        componentRoutingId: "reopen-modal",
        componentTimeout: 600,
        componentOnce: false,
      },
    ]);

    const container = getMirrorConfigContainer({
      ctx,
      league: state.league,
      teamId: state.teamId,
      feature: state.feature,
      config,
      templateAccessory: modalButton,
    });

    container.spliceComponents(
      2,
      0,
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(ctx.interaction.data.custom_id)
          .setChannelTypes(
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement,
            ChannelType.PublicThread,
            ChannelType.PrivateThread,
            ChannelType.AnnouncementThread,
          )
          .setPlaceholder("Select or search for channels to mirror to")
          .setDefaultChannels(channelIds)
          .setMinValues(1)
          .setMaxValues(3),
      ),
    );

    return ctx.updateMessage({
      components: [
        container,
        await getMirrorConfigFooterRow({
          ctx,
          league: state.league,
          channelId: state.channelId,
          teamId: state.teamId,
          feature: state.feature,
        }),
      ].map((x) => x.toJSON()),
    });
  };

export const notificationsMirrorModalCallback: ModalCallback = async (ctx) => {
  const state = ctx.state as State & {
    teamId: string;
    feature: keyof NotificationSendConfig;
  };
  const contentTemplate =
    ctx.getModalComponent("content-template").value?.trim() || undefined;

  const db = getDb(ctx.env.DB);
  const settings = await db.query.notifications.findFirst({
    where: and(
      eq(notifications.league, state.league),
      eq(notifications.channelId, makeSnowflake(state.channelId)),
    ),
    columns: { mirrorConfig: true },
  });

  // assign new data
  let config = settings?.mirrorConfig;
  if (config) {
    const featureConfig = config[state.teamId]?.[state.feature];
    if (featureConfig) {
      featureConfig.contentTemplate = contentTemplate;
    } else if (config[state.teamId]) {
      config[state.teamId][state.feature] = { channelIds: [], contentTemplate };
    } else {
      config[state.teamId] = {
        [state.feature]: {
          channelIds: [],
          contentTemplate,
        },
      };
    }
  } else {
    config = {
      [state.teamId]: {
        [state.feature]: {
          channelIds: [],
          contentTemplate,
        },
      },
    };
  }

  await db
    .insert(notifications)
    .values({
      league: state.league,
      channelId: makeSnowflake(state.channelId),
      mirrorConfig: config,
    })
    .onConflictDoUpdate({
      target: [notifications.league, notifications.channelId],
      set: { mirrorConfig: config },
    });

  // I wanted to pull the existing custom IDs from the other components using
  // interaction.message but I'm not sure how reliable that would be.
  const modal = await getMirrorTemplateModal(
    ctx,
    state,
    state.teamId,
    state.feature,
    config[state.teamId]?.[state.feature]?.contentTemplate,
  );
  const [channelSelect, modalButton] = (await storeComponents(
    ctx.env.KV,
    [
      new ChannelSelectMenuBuilder()
        .setChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement,
          ChannelType.PublicThread,
          ChannelType.PrivateThread,
          ChannelType.AnnouncementThread,
        )
        .setPlaceholder("Select or search for channels to mirror to")
        .setDefaultChannels(
          config[state.teamId]?.[state.feature]?.channelIds ?? [],
        )
        .setMinValues(1)
        .setMaxValues(3),
      {
        ...state,
        componentRoutingId: "select-notifications-mirror-channels",
        componentTimeout: 600,
        componentOnce: false,
        teamId: state.teamId,
        feature: state.feature,
      },
    ],
    [
      new ButtonBuilder()
        .setId(100)
        .setStyle(ButtonStyle.Primary)
        .setLabel("Template Message"),
      {
        ...state,
        modal: modal.toJSON(),
        componentRoutingId: "reopen-modal",
        componentTimeout: 600,
        componentOnce: false,
      },
    ],
  )) as [ChannelSelectMenuBuilder, ButtonBuilder];

  const container = getMirrorConfigContainer({
    ctx,
    league: state.league,
    teamId: state.teamId,
    feature: state.feature,
    config,
    templateAccessory: modalButton,
  });
  container.spliceComponents(
    2,
    0,
    new ActionRowBuilder().addComponents(channelSelect),
  );

  return ctx.updateMessage({
    components: [
      container,
      await getMirrorConfigFooterRow({
        ctx,
        league: state.league,
        channelId: state.channelId,
        teamId: state.teamId,
        feature: state.feature,
      }),
    ].map((x) => x.toJSON()),
  });
};

export const deleteNotificationsMirrorCallback: ButtonCallback = async (
  ctx,
) => {
  // this is in an ephemeral message spawned from a permission-checked
  // command so we don't need to check permissions

  const state = ctx.state as State & {
    teamId: string;
    feature: keyof NotificationSendConfig;
  };
  const db = getDb(ctx.env.DB);
  const settings = await db.query.notifications.findFirst({
    where: (table, { and, eq }) =>
      and(
        eq(table.league, state.league),
        eq(table.channelId, makeSnowflake(state.channelId)),
      ),
  });
  if (!settings || !settings.mirrorConfig) {
    // this shouldn't happen
    return ctx.reply({
      content: "There's nothing to delete.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const { mirrorConfig } = settings;
  if (mirrorConfig[state.teamId]?.[state.feature]) {
    delete mirrorConfig[state.teamId][state.feature];
    if (Object.keys(mirrorConfig[state.teamId]).length === 0) {
      delete mirrorConfig[state.teamId];
    }
  }

  await db
    .update(notifications)
    .set({ mirrorConfig })
    .where(
      and(
        eq(notifications.league, state.league),
        eq(notifications.channelId, makeSnowflake(state.channelId)),
      ),
    );

  return ctx.updateMessage({
    components: [
      new TextDisplayBuilder()
        .setContent(
          `The mirror configuration for ${getTeamEmoji(
            state.league,
            state.teamId,
          )} ${
            leagueTeams[state.league].find((t) => t.id === state.teamId)
              ?.name ?? "Unknown"
          } (${state.feature}) has been deleted.`,
        )
        .toJSON(),
    ],
  });
};

export const toggleNotificationActiveButtonCallback: ButtonCallback = async (
  ctx,
) => {
  const guildId = ctx.interaction.guild_id;
  if (!guildId) throw Error("Guild only");

  const state = ctx.state as State;
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

  if (!settings) {
    await db
      .insert(notifications)
      .values({
        league: state.league,
        guildId: makeSnowflake(guildId),
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
  }

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

export const notificationsEnterDefaultSettings: ButtonCallback = async (
  ctx,
) => {
  const guildId = ctx.interaction.guild_id;
  if (!guildId) throw Error("Guild only");

  const { league, channelId, channelType } = ctx.state as State;

  const db = getDb(ctx.env.DB);
  const settings = await db.query.notifications.findFirst({
    where: and(
      eq(notifications.channelId, makeSnowflake(channelId)),
      eq(notifications.league, league),
    ),
    columns: {
      sendConfig: true,
      teamIds: true,
      active: true,
      guildId: true,
    },
  });

  return ctx.updateMessage({
    embeds: [getSettingsEmbed(ctx, league, channelId, settings?.active)],
    components: await getComponents(
      ctx,
      league,
      channelId,
      channelType,
      settings?.sendConfig,
      settings?.teamIds,
      settings?.active ?? undefined,
    ),
  });
};

export const notificationsEnterMirrorSettings: ButtonCallback = async (ctx) => {
  const guildId = ctx.interaction.guild_id;
  if (!guildId) throw Error("Guild only");

  const state = ctx.state as State;
  const db = getDb(ctx.env.DB);
  const settings = await db.query.notifications.findFirst({
    where: and(
      eq(notifications.league, state.league),
      eq(notifications.channelId, makeSnowflake(state.channelId)),
    ),
    columns: {
      sendConfig: true,
      mirrorConfig: true,
      teamIds: true,
      active: true,
    },
  });
  // The default state is pseudo-false so we assume we should set it to true
  const active = settings ? !settings.active : true;

  if (!settings) {
    await db
      .insert(notifications)
      .values({
        league: state.league,
        guildId: makeSnowflake(guildId),
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
  }

  const embed = getMirrorSettingsEmbed(ctx, state.league, state.channelId);
  return ctx.updateMessage({
    embeds: [embed],
    components: await getComponentsMirror(
      ctx,
      state.league,
      state.channelId,
      state.channelType,
      settings?.teamIds,
      active,
    ),
  });
};

export const mirrorTemplateHelpCallback: ButtonCallback = async (ctx) => {
  const container = new ContainerBuilder()
    .setAccentColor(colors.main)
    .addTextDisplayComponents((t) =>
      t.setContent(
        [
          "### Template Examples\nThe data available to a content template ",
          "varies depending on the feature message being mirrored, but they ",
          "all share a select few related to the ongoing game itself. ",
          "Add template values to your message with double curly brackets, as ",
          "shown below.",
        ].join(""),
      ),
    )
    .addSeparatorComponents((s) => s.setDivider())
    .addTextDisplayComponents((t) =>
      t.setContent(
        [
          "**Preview**",
          "⬇️ `{{game.matchup}} starts <t:{{game.start_timestamp}}}:R>!`",
          "➡️ Montréal Victoire @ Ottawa Charge starts in 6 hours!",
        ].join("\n"),
      ),
    )
    .addSeparatorComponents((s) => s.setDivider())
    .addTextDisplayComponents((t) =>
      t.setContent(
        [
          "**Thread**",
          "⬇️ `Check out the gameday thread for {{game.matchup_emojis}} in <#{{thread.id}}>`",
          `➡️ Check out the gameday thread for ${getTeamEmoji(
            "pwhl",
            3,
          )} Montréal Victoire @ ${getTeamEmoji(
            "pwhl",
            5,
          )} Ottawa Charge in #MTL @ OTT - Tue, May 13, 2025`,
        ].join("\n"),
      ),
    )
    .addSeparatorComponents((s) => s.setDivider())
    .addTextDisplayComponents((t) =>
      t.setContent(
        [
          "**All Options**",
          "There are way too many to list here, so in the future there will " +
            "be a webpage displaying all of them. Here are a selection of " +
            "the most useful options!",
          "- `{{game.home_name}}`",
          "- `{{game.home_emoji}}`",
          "- `{{game.away_name}}`",
          "- `{{game.away_emoji}}`",
          "- `{{game.matchup}}` - away name @ home name",
          "- `{{game.matchup_emojis}}` - matchup w/ emojis",
          "- `{{game.start_timestamp}}` - useful for [timestamps](https://discord.dev/reference#message-formatting)",
          "- `{{links.gamecenter}}` - URL to the gamecenter for this game",
          "- `{{links.standings}}` - URL to the current standings page",
          "- `{{channel_id}}` - the channel being mirrored from (mention like `<#{{channel_id}}>`)",
          "- [`{{thread}}`](https://discord.dev/resources/channel#channel-object) (optional)",
        ].join("\n"),
      ),
    );

  return ctx.reply({
    components: [container.toJSON()],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  });
};
