import { ButtonBuilder, EmbedBuilder } from "@discordjs/builders";
import { ChatInputAppCommandCallback } from "../commands";
import { transformLocalizations } from "../l10n";
import { ButtonStyle } from "discord-api-types/v10";
import { PermissionFlags, PermissionsBitField } from "discord-bitflag";

const s = transformLocalizations({
  en: {
    about: "About",
    description:
      "This bot covers various aspects of the KHL, including live game updates.",
    invite: "Invite",
    site: "Site",
    // site: "Site (+ Mac/iOS app!)",
  },
});

export const aboutCallback: ChatInputAppCommandCallback = async (ctx) => {
  const inviteUrl = new URL("https://discord.com/oauth2/authorize");
  inviteUrl.searchParams.set("client_id", ctx.interaction.application_id);
  inviteUrl.searchParams.set("scope", "bot");
  inviteUrl.searchParams.set(
    "permissions",
    new PermissionsBitField()
      .set(PermissionFlags.SendMessages, true)
      .set(PermissionFlags.ViewChannel, true)
      .set(PermissionFlags.EmbedLinks, true)
      .set(PermissionFlags.UseExternalEmojis, true)
      .set(PermissionFlags.AttachFiles, true)
      .set(PermissionFlags.CreatePublicThreads, true)
      .set(PermissionFlags.ManageEvents, true)
      .toString(),
  );

  return ctx.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle(s(ctx, "about"))
        .setDescription(s(ctx, "description"))
        .toJSON(),
    ],
    components: [
      {
        type: 1,
        components: [
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel(s(ctx, "invite"))
            .setURL(inviteUrl.href)
            .toJSON(),
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel(s(ctx, "site"))
            .setURL("https://shay.cat")
            .toJSON(),
        ],
      },
    ],
  });
};
