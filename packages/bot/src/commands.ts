import {
  APIApplicationCommandAutocompleteInteraction,
  APIApplicationCommandAutocompleteResponse,
  APIChatInputApplicationCommandInteraction,
  APIInteraction,
  APIInteractionResponse,
  APIMessageApplicationCommandInteraction,
  APIUserApplicationCommandInteraction,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  RESTPostAPIApplicationCommandsJSONBody,
} from "discord-api-types/v10";
import { InteractionContext } from "./interactions";
import { khlCalendarCallback } from "./commands/calendar";
import { aboutCallback } from "./commands/about";
import { teamAutocomplete } from "./commands/teamAutocomplete";
import { khlPlayerCallback } from "./commands/player";

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

export type AppCommand = RESTPostAPIApplicationCommandsJSONBody & {
  handlers: Record<string, AppCommandCallback>;
  autocompleteHandlers?: Record<string, AppCommandAutocompleteCallback>;
};

export const appCommands: Record<
  ApplicationCommandType,
  Record<string, AppCommand>
> = {
  [ApplicationCommandType.ChatInput]: {
    schedule: {
      name: "schedule",
      name_localizations: {
        ru: "kалендарь",
        "zh-CN": "赛程",
      },
      description: "...",
      options: [
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "khl",
          name_localizations: {
            ru: "кхл",
          },
          description:
            "Get all KHL games for a specific date, or today if not specified",
          options: [
            {
              type: ApplicationCommandOptionType.String,
              name: "date",
              description: "YYYY-MM-DD",
              max_length: 10,
              required: false,
            },
            {
              type: ApplicationCommandOptionType.String,
              name: "team",
              description: "The team to get games for",
              autocomplete: true,
              required: false,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "pwhl",
          description:
            "Get all PWHL games for a specific date, or today if not specified",
          options: [
            {
              type: ApplicationCommandOptionType.String,
              name: "date",
              description: "YYYY-MM-DD",
              max_length: 10,
              required: false,
            },
            {
              type: ApplicationCommandOptionType.Integer,
              name: "team",
              description: "The team to get games for",
              autocomplete: true,
              required: false,
            },
          ],
        },
      ],
      handlers: {
        khl: khlCalendarCallback,
      },
      autocompleteHandlers: {
        khl: teamAutocomplete,
      }
    },
    player: {
      name: "player",
      name_localizations: {
        ru: "игрок",
        "zh-CN": "玩家",
      },
      description: "...",
      options: [
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "khl",
          name_localizations: {
            ru: "кхл",
          },
          description: "Get info for a player",
          options: [
            {
              type: ApplicationCommandOptionType.String,
              name: "name",
              description: "The name of the player",
              required: true,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "pwhl",
          description: "Get info for a player",
          options: [
            {
              type: ApplicationCommandOptionType.String,
              name: "name",
              description: "The name of the player",
              required: true,
            },
          ],
        },
      ],
      handlers: {
        khl: khlPlayerCallback,
      },
    },
    about: {
      name: "about",
      description: "About this bot",
      handlers: {
        BASE: aboutCallback,
      },
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
