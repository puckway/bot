import { ButtonBuilder, EmbedBuilder } from "@discordjs/builders";
import { ButtonStyle } from "discord-api-types/v10";
import { ChatInputAppCommandCallback } from "../commands";
import { colors } from "../util/colors";
import { transformLocalizations } from "../util/l10n";

const s = transformLocalizations({
  en: {
    about: "About",
    description: "This bot covers various aspects of the PWHL, AHL, and KHL.",
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
            .setURL("https://puckway.shay.cat")
            .toJSON(),
        ],
      },
    ],
  });
};
