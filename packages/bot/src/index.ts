import { REST } from "@discordjs/rest";
import {
  type APIApplicationCommandInteractionDataOption,
  type APIInteraction,
  type APIMessageComponentInteraction,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  InteractionResponseType,
  InteractionType,
} from "discord-api-types/v10";
import { PermissionFlags, PermissionsBitField } from "discord-bitflag";
import { isValidRequest, PlatformAlgorithm } from "discord-verify";
import { Router } from "itty-router";
import { type AppCommandCallbackT, appCommands, respond } from "./commands";
import {
  type ComponentCallbackT,
  type ComponentRoutingId,
  componentStore,
  type MinimumKVComponentState,
  type ModalRoutingId,
  modalStore,
} from "./components";
import { dailyInitNotifications } from "./cron";
import { InteractionContext } from "./interactions";
import { getErrorMessage, isDiscordError } from "./util/errors.js";

// import { checkAlarm } from "./notifications";
// import { getNow } from "./util/time";
export { DurableNotificationManager } from "./notifications";

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
      headers: { Location: inviteUrl.href },
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
      } else if (customId.startsWith("p_")) {
        const routingId = customId.split("_")[1] as ComponentRoutingId;
        const stored = componentStore[routingId];
        if (!stored) {
          return respond({ error: "Unknown routing ID" });
        }

        const ctx = new InteractionContext(rest, interaction, env);
        try {
          const response = await (
            stored.handler as ComponentCallbackT<APIMessageComponentInteraction>
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
  // .get("/t", async (request, env: Env) => {
  //   // const gameId = Number(new URL(request.url).searchParams.get("game"));
  //   const client = getHtClient(env, "pwhl");
  //   // const plays = (await client.getGamePlayByPlay(gameId)).GC.Pxpverbose;
  //   // const games = (await client.getDailySchedule("2025-05-11")).SiteKit
  //   //   .Gamesbydate;
  //   const game = (await client.getGameSummary(95)).GC.Gamesummary;
  //   // const standings = await getHtStandings(client);
  //   const brackets = await getPlayoffBrackets(
  //     client,
  //     // Number(games[0].season_id),
  //     Number(game.meta.season_id),
  //   );
  //   // const game = schedule.SiteKit.Gamesbydate.find(g => g.id === gameId)
  //   return json(
  //     // games.map((game) =>
  //     //   getHtGamePreviewEmbed("pwhl", game, undefined, brackets),
  //     // ),
  //     getHtGamePreviewFinalEmbed("pwhl", game, { brackets }),
  //   );
  // })
  // .get(
  //   "/test/force-alarm",
  //   async (request, env: Env, workerCtx: ExecutionContext) => {
  //     const { searchParams } = new URL(request.url);
  //     const day = searchParams.get("day");
  //     const league = searchParams.get("league");

  //     const now = getNow();
  //     await checkAlarm(env, workerCtx, league, day, now);
  //     return null;
  //   },
  // )
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
  scheduled: dailyInitNotifications,
};

export default server;
