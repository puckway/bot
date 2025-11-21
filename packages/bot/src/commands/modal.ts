import {
  type APIModalInteractionResponseCallbackData,
  MessageFlags,
} from "discord-api-types/v10";
import type { ButtonCallback } from "../components";

export const reopenModalFromStateCallback: ButtonCallback = async (ctx) => {
  const state = ctx.state as {
    modal?: APIModalInteractionResponseCallbackData;
  };
  if (!state.modal) {
    return ctx.reply({
      content:
        "There is no modal to reopen. This may have happened due to expired state.",
      flags: MessageFlags.Ephemeral,
    });
  }
  return ctx.modal(state.modal);
};
