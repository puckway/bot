import { REST } from "@discordjs/rest";
import {
  APIApplicationCommandInteractionDataOption,
  APIInteraction,
  APIMessageComponentInteraction,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  InteractionResponseType,
  InteractionType,
} from "discord-api-types/v10";
import { PermissionFlags, PermissionsBitField } from "discord-bitflag";
import { PlatformAlgorithm, isValidRequest } from "discord-verify";
import { Router } from "itty-router";
import { AppCommandCallbackT, appCommands, respond } from "./commands";
import {
  ComponentCallbackT,
  ComponentRoutingId,
  MinimumKVComponentState,
  ModalRoutingId,
  componentStore,
  modalStore,
} from "./components";
import { checkPosts, getPlaysWithPeriods } from "./cron";
import { InteractionContext } from "./interactions";
import { getErrorMessage, isDiscordError } from "./util/errors.js";
import { getHtClient } from "./ht/client";
import { GameStatus } from "hockeytech";

export interface Env {
  DB: D1Database;
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
  AHL_LOGO: string;
  AHL_TEAM_EMOJI_440: string;
  AHL_TEAM_EMOJI_402: string;
  AHL_TEAM_EMOJI_413: string;
  AHL_TEAM_EMOJI_317: string;
  AHL_TEAM_EMOJI_444: string;
  AHL_TEAM_EMOJI_384: string;
  AHL_TEAM_EMOJI_330: string;
  AHL_TEAM_EMOJI_373: string;
  AHL_TEAM_EMOJI_445: string;
  AHL_TEAM_EMOJI_419: string;
  AHL_TEAM_EMOJI_328: string;
  AHL_TEAM_EMOJI_307: string;
  AHL_TEAM_EMOJI_437: string;
  AHL_TEAM_EMOJI_319: string;
  AHL_TEAM_EMOJI_389: string;
  AHL_TEAM_EMOJI_415: string;
  AHL_TEAM_EMOJI_313: string;
  AHL_TEAM_EMOJI_321: string;
  AHL_TEAM_EMOJI_327: string;
  AHL_TEAM_EMOJI_403: string;
  AHL_TEAM_EMOJI_309: string;
  AHL_TEAM_EMOJI_323: string;
  AHL_TEAM_EMOJI_372: string;
  AHL_TEAM_EMOJI_404: string;
  AHL_TEAM_EMOJI_405: string;
  AHL_TEAM_EMOJI_411: string;
  AHL_TEAM_EMOJI_324: string;
  AHL_TEAM_EMOJI_380: string;
  AHL_TEAM_EMOJI_335: string;
  AHL_TEAM_EMOJI_412: string;
  AHL_TEAM_EMOJI_390: string;
  AHL_TEAM_EMOJI_316: string;
  AHL_TEAM_EMOJI_407: string;
  AHL_TEAM_EMOJI_408: string;
  AHL_TEAM_EMOJI_409: string;
  AHL_TEAM_EMOJI_410: string;
  AHL_TEAM_EMOJI_418: string;
}

const router = Router();

router
  .get("/", (_, env: Env) => {
    const inviteUrl = new URL("https://discord.com/oauth2/authorize");
    inviteUrl.searchParams.set("client_id", env.DISCORD_APPLICATION_ID);
    inviteUrl.searchParams.set("scope", "bot");
    inviteUrl.searchParams.set(
      "permissions",
      new PermissionsBitField()
        .set(PermissionFlags.ViewChannel, true)
        .set(PermissionFlags.ManageEvents, true)
        .set(PermissionFlags.SendMessages, true)
        .set(PermissionFlags.CreatePublicThreads, true)
        .set(PermissionFlags.ManageThreads, true)
        .set(PermissionFlags.EmbedLinks, true)
        .set(PermissionFlags.AttachFiles, true)
        .set(PermissionFlags.MentionEveryone, true)
        .set(PermissionFlags.UseExternalEmojis, true)
        .toString(),
    );
    return new Response(null, {
      status: 302,
      headers: {
        Location: inviteUrl.href,
      },
    });
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
  .get("/t", async (request, env: Env, ctx: ExecutionContext) => {
    const client = getHtClient("pwhl");
    const pxp = (await client.getGamePlayByPlay(32)).GC.Pxpverbose;
    return new Response(
      JSON.stringify(getPlaysWithPeriods(pxp, GameStatus.Final)),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
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
  scheduled: checkPosts,
};

export default server;
