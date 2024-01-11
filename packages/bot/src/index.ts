import { Router } from "itty-router";
import { PlatformAlgorithm, isValidRequest } from "discord-verify";
import { AppCommandCallbackT, appCommands, respond } from "./commands";
import {
  InteractionType,
  InteractionResponseType,
  APIInteraction,
  APIApplicationCommandInteractionDataOption,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  APIMessageComponentInteraction,
} from "discord-api-types/v10";
import { REST } from "@discordjs/rest";
import { InteractionContext } from "./interactions";
import { getErrorMessage, isDiscordError } from "./util/errors.js";
import {
  ComponentCallbackT,
  ComponentRoutingId,
  MinimumKVComponentState,
  ModalRoutingId,
  componentStore,
  modalStore,
} from "./components";

export interface Env {
  // DB: D1Database;
  KV: KVNamespace;
  DISCORD_APPLICATION_ID: string;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_TOKEN: string;
  KHL_TEAM_EMOJI_61: string;
  KHL_TEAM_EMOJI_40: string;
  KHL_TEAM_EMOJI_12: string;
  KHL_TEAM_EMOJI_10: string;
  KHL_TEAM_EMOJI_56: string;
  KHL_TEAM_EMOJI_46: string;
  KHL_TEAM_EMOJI_16: string;
  KHL_TEAM_EMOJI_38: string;
  KHL_TEAM_EMOJI_8: string;
  KHL_TEAM_EMOJI_315: string;
  KHL_TEAM_EMOJI_105: string;
  KHL_TEAM_EMOJI_26: string;
  KHL_TEAM_EMOJI_30: string;
  KHL_TEAM_EMOJI_36: string;
  KHL_TEAM_EMOJI_32: string;
  KHL_TEAM_EMOJI_42: string;
  KHL_TEAM_EMOJI_24: string;
  KHL_TEAM_EMOJI_44: string;
  KHL_TEAM_EMOJI_113: string;
  KHL_TEAM_EMOJI_18: string;
  KHL_TEAM_EMOJI_22: string;
  KHL_TEAM_EMOJI_28: string;
  KHL_TEAM_EMOJI_34: string;
  PWHL_LOGO: string;
  PWHL_TEAM_EMOJI_1: string;
  PWHL_TEAM_EMOJI_2: string;
  PWHL_TEAM_EMOJI_3: string;
  PWHL_TEAM_EMOJI_4: string;
  PWHL_TEAM_EMOJI_5: string;
  PWHL_TEAM_EMOJI_6: string;
}

const router = Router();

router
  .get("/", (_, env: Env) => {
    return new Response(`👋 ${env.DISCORD_APPLICATION_ID}`);
  })
  .post("/", async (request, env: Env, workerCtx: ExecutionContext) => {
    const { isValid, interaction } = await server.verifyDiscordRequest(
      request,
      env,
    );
    if (!isValid || !interaction) {
      return new Response("Bad request signature.", { status: 401 });
    }

    const rest = new REST().setToken(env.DISCORD_TOKEN);

    if (interaction.type === InteractionType.Ping) {
      return respond({ type: InteractionResponseType.Pong });
    }

    if (
      interaction.type === InteractionType.ApplicationCommand ||
      interaction.type === InteractionType.ApplicationCommandAutocomplete
    ) {
      let qualifiedOptions = "";
      if (interaction.data.type === ApplicationCommandType.ChatInput) {
        const appendOption = (
          option: APIApplicationCommandInteractionDataOption,
        ) => {
          if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
            qualifiedOptions += ` ${option.name}`;
            for (const opt of option.options) {
              appendOption(opt);
            }
          } else if (option.type === ApplicationCommandOptionType.Subcommand) {
            qualifiedOptions += ` ${option.name}`;
          }
        };
        for (const option of interaction.data.options ?? []) {
          appendOption(option);
        }
      }

      const appCommand =
        appCommands[interaction.data.type][interaction.data.name.toLowerCase()];
      if (!appCommand) {
        return respond({ error: "Unknown command" });
      }

      if (interaction.type === InteractionType.ApplicationCommand) {
        const handler = appCommand.handlers[qualifiedOptions.trim() || "BASE"];
        if (!handler) {
          return respond({ error: "Cannot handle this command" });
        }

        const ctx = new InteractionContext(rest, interaction, env);
        try {
          const response = await (
            handler as AppCommandCallbackT<APIInteraction>
          )(ctx);
          if (Array.isArray(response)) {
            workerCtx.waitUntil(response[1]());
            return respond(response[0]);
          }
          return respond(response);
        } catch (e) {
          if (isDiscordError(e)) {
            const errorResponse = getErrorMessage(ctx, e.raw);
            if (errorResponse) {
              return respond(errorResponse);
            }
          } else {
            console.error(e);
          }
          console.error(e);
          return respond({
            error: "You've found a super unlucky error. Try again later!",
            status: 500,
          });
        }
      } else {
        const noChoices = respond({
          type: InteractionResponseType.ApplicationCommandAutocompleteResult,
          data: { choices: [] },
        });

        if (!appCommand.autocompleteHandlers) return noChoices;
        const handler =
          appCommand.autocompleteHandlers[qualifiedOptions.trim() || "BASE"];
        if (!handler) return noChoices;

        const ctx = new InteractionContext(rest, interaction, env);
        try {
          const response = await handler(ctx);
          return respond({
            // Normally I wouldn't truncate data at this level but this just
            // makes it a lot easier if the limit is changed in the future,
            // and there's hardly a reason I would *want* to go over the limit
            // in a callback
            type: InteractionResponseType.ApplicationCommandAutocompleteResult,
            data: { choices: response.slice(0, 25) },
          });
        } catch (e) {
          console.error(e);
        }
        return noChoices;
      }
    } else if (interaction.type === InteractionType.MessageComponent) {
      const { custom_id: customId, component_type: type } = interaction.data;
      if (customId.startsWith("t_")) {
        const state_ = await env.KV.get(`component-${type}-${customId}`);
        if (!state_) {
          return respond({ error: "Unknown component" });
        }
        const state: MinimumKVComponentState = JSON.parse(state_);

        const stored =
          componentStore[state.componentRoutingId as ComponentRoutingId];
        if (!stored) {
          return respond({ error: "Unknown routing ID" });
        }

        const ctx = new InteractionContext(rest, interaction, env, state);
        try {
          const response = await (
            stored.handler as ComponentCallbackT<APIMessageComponentInteraction>
          )(ctx);
          if (state.componentOnce) {
            try {
              await env.KV.delete(`component-${type}-${customId}`);
            } catch {}
          }
          if (Array.isArray(response)) {
            workerCtx.waitUntil(response[1]());
            return respond(response[0]);
          }
          return respond(response);
        } catch (e) {
          if (isDiscordError(e)) {
            const errorResponse = getErrorMessage(ctx, e.raw);
            if (errorResponse) {
              return respond(errorResponse);
            }
          } else {
            console.error(e);
          }
          return respond({
            error: "You've found a super unlucky error. Try again later!",
            status: 500,
          });
        }
      }
    } else if (interaction.type === InteractionType.ModalSubmit) {
      const { custom_id: customId } = interaction.data;
      if (customId.startsWith("t_")) {
        const state_ = await env.KV.get(`modal-${customId}`);
        if (!state_) {
          return respond({ error: "Unknown modal" });
        }
        const state: MinimumKVComponentState = JSON.parse(state_);

        const stored = modalStore[state.componentRoutingId as ModalRoutingId];
        if (!stored) {
          return respond({ error: "Unknown routing ID" });
        }

        const ctx = new InteractionContext(rest, interaction, env, state);
        try {
          const response = await stored.handler(ctx);
          if (state.componentOnce) {
            try {
              await env.KV.delete(`modal-${customId}`);
            } catch {}
          }
          if (Array.isArray(response)) {
            workerCtx.waitUntil(response[1]());
            return respond(response[0]);
          }
          return respond(response);
        } catch (e) {
          if (isDiscordError(e)) {
            const errorResponse = getErrorMessage(ctx, e.raw);
            if (errorResponse) {
              return respond(errorResponse);
            }
          } else {
            console.error(e);
          }
          return respond({
            error: "You've found a super unlucky error. Try again later!",
            status: 500,
          });
        }
      }
    }

    console.error("Unknown Type");
    return respond({ error: "Unknown Type" });
  })
  .all("*", () => new Response("Not Found.", { status: 404 }));

async function verifyDiscordRequest(request: Request, env: Env) {
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  const valid =
    signature &&
    timestamp &&
    (await isValidRequest(
      request,
      env.DISCORD_PUBLIC_KEY,
      PlatformAlgorithm.Cloudflare,
    ));
  if (!valid) {
    return { isValid: false };
  }

  const body = (await request.json()) as APIInteraction;
  return { interaction: body, isValid: true };
}

const server = {
  verifyDiscordRequest,
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    return router.handle(request, env, ctx);
  },
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    console.log(`trigger fired at ${event.cron}`);
  },
};

export default server;
