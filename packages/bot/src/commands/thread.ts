import {
  APIMessage,
  ChannelType,
  MessageFlags,
  RESTPatchAPIChannelJSONBody,
  RESTPatchAPIChannelMessageJSONBody,
  Routes,
} from "discord-api-types/v10";
import { ChatInputAppCommandCallback } from "../commands";
import {
  GLOBAL_GAME_ID_REGEX,
  HockeyTechLeague,
  getHtClient,
} from "../ht/client";
import {
  getHtGamePreviewFinalEmbed,
  getHtGoalsEmbed,
  getHtStatusEmbed,
} from "../notifications";
import { getHtLocale } from "../util/l10n";

export const threadCloseCallback: ChatInputAppCommandCallback = async (ctx) => {
  const { channel } = ctx.interaction;
  if (
    (channel.type !== ChannelType.PublicThread &&
      channel.type !== ChannelType.PrivateThread) ||
    !channel.parent_id
  ) {
    return ctx.reply({
      content: "This channel is not a thread.",
      flags: MessageFlags.Ephemeral,
    });
  }
  const parentId = channel.parent_id;
  let message;
  try {
    message = (await ctx.rest.get(
      Routes.channelMessage(parentId, channel.id),
    )) as APIMessage;
  } catch {
    return ctx.reply({
      content:
        "Failed to find thread starter message - this channel is likely not a gameday thread.",
      flags: MessageFlags.Ephemeral,
    });
  }

  let league: HockeyTechLeague | undefined;
  let gameId: number | undefined;
  if (
    // Not compatible with older applications (pre-2017?)
    message.author?.id === ctx.env.DISCORD_APPLICATION_ID &&
    message.embeds?.[0]?.footer?.text
  ) {
    const footer = message.embeds[0].footer.text;
    const match = footer.match(GLOBAL_GAME_ID_REGEX);
    if (match) {
      league = match[1] as HockeyTechLeague;
      gameId = Number(match[2]);
    }
  }

  if (!league || !gameId) {
    return ctx.reply({
      content:
        "Failed to find thread starter message - this channel is likely not a gameday thread.",
      flags: MessageFlags.Ephemeral,
    });
  }

  return [
    ctx.defer({ ephemeral: false, thinking: true }),
    async () => {
      const client = getHtClient(ctx.env, league, getHtLocale(ctx));
      const summary = (await client.getGameSummary(gameId)).GC.Gamesummary;

      await ctx.followup.editOriginalMessage({
        embeds: [
          getHtStatusEmbed(league, summary),
          getHtGoalsEmbed(league, summary),
        ],
      });

      await ctx.rest.patch(Routes.channelMessage(parentId, channel.id), {
        body: {
          embeds: [getHtGamePreviewFinalEmbed(league, summary)],
        } satisfies RESTPatchAPIChannelMessageJSONBody,
      });

      try {
        await ctx.rest.patch(Routes.channel(channel.id), {
          body: {
            archived: true,
            locked: true,
          } satisfies RESTPatchAPIChannelJSONBody,
          reason: `Closed by ${ctx.user.username}${
            ctx.user.discriminator !== "0" ? `#${ctx.user.discriminator}` : ""
          } (${ctx.user.id})`,
        });
      } catch {
        await ctx.followup.send({
          content:
            "Failed to close the thread. Ensure I have proper permissions (Send Messages, Manage Threads).",
          flags: MessageFlags.Ephemeral,
        });
      }
    },
  ];
};
