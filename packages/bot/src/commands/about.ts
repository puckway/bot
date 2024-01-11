import { ButtonBuilder, EmbedBuilder } from "@discordjs/builders";
import { ChatInputAppCommandCallback } from "../commands";
import { transformLocalizations } from "../util/l10n";
import { ButtonStyle } from "discord-api-types/v10";
import { colors } from "../util/colors";

const s = transformLocalizations({
  en: {
    about: "About",
    description:
      "This bot covers various aspects of the PWHL and KHL.",
    site: "Website",
    // site: "Site (+ Mac/iOS app!)",
  },
});

export const aboutCallback: ChatInputAppCommandCallback = async (ctx) => {
  return ctx.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle(s(ctx, "about"))
        .setColor(colors.main)
        .setDescription(s(ctx, "description"))
        .toJSON(),
    ],
    components: [
      {
        type: 1,
        components: [
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
