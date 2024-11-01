import {
  APIApplicationCommandAutocompleteInteraction,
  APIApplicationCommandAutocompleteResponse,
  APIChatInputApplicationCommandInteraction,
  APIInteraction,
  APIInteractionResponse,
  APIMessageApplicationCommandInteraction,
  APIUserApplicationCommandInteraction,
  ApplicationCommandType,
} from "discord-api-types/v10";
import { aboutCallback } from "./commands/about";
import {
  htGamedayCallback,
  scheduleDayCallback,
  scheduleMonthCallback,
} from "./commands/calendar";
import { notificationsCallback } from "./commands/notifications";
import { playerCallback, whoisCallback } from "./commands/player";
import { standingsCallback } from "./commands/standings";
import { teamAutocomplete } from "./commands/teamAutocomplete";
import { threadCloseCallback } from "./commands/thread";
import { InteractionContext } from "./interactions";

export type AppCommandCallbackT<T extends APIInteraction> = (
  ctx: InteractionContext<T>,
) => Promise<
  APIInteractionResponse | [APIInteractionResponse, () => Promise<void>]
>;
export type ChatInputAppCommandCallback =
  AppCommandCallbackT<APIChatInputApplicationCommandInteraction>;
export type MessageAppCommandCallback =
  AppCommandCallbackT<APIMessageApplicationCommandInteraction>;
export type UserAppCommandCallback =
  AppCommandCallbackT<APIUserApplicationCommandInteraction>;

type AutocompleteChoices = NonNullable<
  APIApplicationCommandAutocompleteResponse["data"]["choices"]
>;
export type AppCommandAutocompleteCallback = (
  ctx: InteractionContext<APIApplicationCommandAutocompleteInteraction>,
) => Promise<AutocompleteChoices>;

export type AppCommandCallback =
  | ChatInputAppCommandCallback
  | MessageAppCommandCallback
  | UserAppCommandCallback;

export type AppCommandHandlers = {
  handlers: Record<string, AppCommandCallback>;
  autocompleteHandlers?: Record<string, AppCommandAutocompleteCallback>;
};

export const appCommands: Record<
  ApplicationCommandType,
  Record<string, AppCommandHandlers>
> = {
  [ApplicationCommandType.ChatInput]: {
    schedule: {
      handlers: { day: scheduleDayCallback, month: scheduleMonthCallback },
      autocompleteHandlers: { day: teamAutocomplete, month: teamAutocomplete },
    },
    gameday: {
      handlers: { BASE: htGamedayCallback },
      autocompleteHandlers: { BASE: teamAutocomplete },
    },
    player: {
      handlers: { BASE: playerCallback },
    },
    standings: {
      handlers: { BASE: standingsCallback },
    },
    whois: {
      handlers: { BASE: whoisCallback },
      autocompleteHandlers: { BASE: teamAutocomplete },
    },
    notifications: {
      handlers: { BASE: notificationsCallback },
    },
    about: {
      handlers: { BASE: aboutCallback },
    },
    thread: {
      handlers: { close: threadCloseCallback },
    },
  },
  [ApplicationCommandType.Message]: {},
  [ApplicationCommandType.User]: {},
};

export type DiscordInteractionResponse =
  | APIInteractionResponse
  | { error: string; status?: number };

class JsonResponse extends Response {
  constructor(body: DiscordInteractionResponse, init_?: ResponseInit | null) {
    const jsonBody = JSON.stringify(body);
    const init = init_ || {
      headers: {
        "content-type": "application/json;charset=UTF-8",
      },
    };
    super(jsonBody, init);
  }
}

export const respond = (body: DiscordInteractionResponse) => {
  return new JsonResponse(
    body,
    "error" in body ? { status: body.status ?? 400 } : null,
  );
};
