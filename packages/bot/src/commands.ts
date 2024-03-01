import {
  APIApplicationCommandAutocompleteInteraction,
  APIApplicationCommandAutocompleteResponse,
  APIApplicationCommandStringOption,
  APIChatInputApplicationCommandInteraction,
  APIInteraction,
  APIInteractionResponse,
  APIMessageApplicationCommandInteraction,
  APIUserApplicationCommandInteraction,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ChannelType,
  RESTPostAPIApplicationCommandsJSONBody,
} from "discord-api-types/v10";
import { PermissionFlags, PermissionsBitField } from "discord-bitflag";
import { aboutCallback } from "./commands/about";
import { htGamedayCallback, scheduleCallback } from "./commands/calendar";
import { notificationsCallback } from "./commands/notifications";
import { playerCallback, whoisCallback } from "./commands/player";
import { teamAutocomplete } from "./commands/teamAutocomplete";
import { InteractionContext } from "./interactions";
import { standingsCallback } from "./commands/standings";
import { threadCloseCallback } from "./commands/thread";

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

const getLeagueOption = ({
  description,
  description_localizations,
  required,
  noKhl,
}: {
  description: string;
  description_localizations?: APIApplicationCommandStringOption["description_localizations"];
  required?: boolean;
  noKhl?: boolean;
}): APIApplicationCommandStringOption => ({
  type: ApplicationCommandOptionType.String,
  name: "league",
  name_localizations: {
    fr: "ligue",
    ru: "лига",
  },
  description,
  description_localizations,
  choices: [
    {
      name: "AHL",
      name_localizations: {
        fr: "LAH",
        ru: "АХЛ",
      },
      value: "ahl",
    },
    {
      name: "PWHL",
      name_localizations: {
        fr: "LPHF",
      },
      value: "pwhl",
    },
    ...(!noKhl
      ? [
          {
            name: "KHL",
            name_localizations: {
              ru: "КХЛ",
            },
            value: "khl",
          },
          // {
          //   name: "MHL",
          //   name_localizations: {
          //     ru: "МХЛ",
          //   },
          //   value: "mhl",
          // },
          // {
          //   name: "ZhHL",
          //   name_localizations: {
          //     ru: "ЖХЛ",
          //   },
          //   value: "zhhl",
          // },
        ]
      : []),
  ],
  required: required ?? true,
});

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
      description:
        "Get all games for a specific date, or today if not specified",
      options: [
        getLeagueOption({
          description: "The league to get games for",
        }),
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
          name_localizations: { fr: "equipe" },
          description: "The team to get games for",
          required: false,
          autocomplete: true,
        },
      ],
      handlers: {
        BASE: scheduleCallback,
      },
      autocompleteHandlers: {
        BASE: teamAutocomplete,
      },
    },
    gameday: {
      name: "gameday",
      name_localizations: {
        ru: "день-игры",
        fr: "jour-de-match",
      },
      description: "A quick look at current, recent, and future games",
      options: [
        getLeagueOption({
          description: "The league to check games for",
          noKhl: true,
        }),
        {
          type: ApplicationCommandOptionType.String,
          name: "team",
          name_localizations: { fr: "equipe" },
          description: "The team to get games for",
          autocomplete: true,
          required: false,
        },
      ],
      handlers: {
        BASE: htGamedayCallback,
      },
      autocompleteHandlers: {
        BASE: teamAutocomplete,
      },
    },
    player: {
      name: "player",
      name_localizations: {
        ru: "игрок",
        "zh-CN": "玩家",
        fr: "joueur",
      },
      description: "Get info for a player",
      options: [
        getLeagueOption({
          description: "The league that the player is in",
        }),
        {
          type: ApplicationCommandOptionType.String,
          name: "name",
          name_localizations: {
            fr: "nom",
          },
          description: "The name of the player",
          description_localizations: {
            fr: "Le nom du joueur",
          },
          required: true,
        },
      ],
      handlers: {
        BASE: playerCallback,
      },
    },
    standings: {
      name: "standings",
      description: "Get league standings",
      // dm_permission: false,
      options: [
        getLeagueOption({
          description: "The league to get team standings for",
        }),
        {
          type: ApplicationCommandOptionType.String,
          name: "sort",
          description: "Sort by the specified statistic",
          required: false,
          choices: [
            {
              name: "Games Played",
              value: "games_played",
            },
            {
              name: "Points",
              value: "points",
            },
            {
              name: "Wins",
              value: "wins",
            },
            {
              name: "Overtime Losses",
              value: "ot_losses",
            },
            {
              name: "Losses",
              value: "losses",
            },
            {
              name: "Percentage",
              value: "percentage",
            },
          ],
        },
      ],
      handlers: {
        BASE: standingsCallback,
      },
    },
    whois: {
      name: "whois",
      name_localizations: {
        ru: "кто",
        fr: "qui-est",
      },
      description: "Find a player by their number",
      description_localizations: {
        fr: "Trouver un joueur par son numéro",
        ru: "Найдите игрока по номеру",
      },
      options: [
        // {
        //   type: ApplicationCommandOptionType.Subcommand,
        //   name: "khl",
        //   name_localizations: {
        //     ru: "кхл",
        //   },
        //   description: "Find a player by their number",
        //   description_localizations: {
        //     fr: "Trouver un joueur par son numéro",
        //     ru: "Найдите игрока по номеру",
        //   },
        //   options: [
        //     {
        //       type: ApplicationCommandOptionType.Integer,
        //       min_value: 1,
        //       max_value: 99,
        //       name: "number",
        //       name_localizations: {
        //         fr: "numéro",
        //         ru: "число",
        //       },
        //       description: "The player's jersey number",
        //       description_localizations: {
        //         fr: "Le numéro de maillot du joueur",
        //       },
        //       required: true,
        //     },
        //     {
        //       type: ApplicationCommandOptionType.String,
        //       name: "team",
        //       description: "The team to search",
        //       required: false,
        //       autocomplete: true,
        //     }
        //   ],
        // },
        getLeagueOption({
          description: "The league that the player is in",
          noKhl: true,
        }),
        {
          type: ApplicationCommandOptionType.Integer,
          min_value: 1,
          max_value: 99,
          name: "number",
          name_localizations: {
            fr: "numéro",
            ru: "число",
          },
          description: "The player's jersey number",
          description_localizations: {
            fr: "Le numéro de maillot du joueur",
          },
          required: true,
        },
        {
          type: ApplicationCommandOptionType.String,
          name: "team",
          name_localizations: { fr: "equipe" },
          description: "The team to search",
          required: true,
          autocomplete: true,
        },
      ],
      handlers: {
        BASE: whoisCallback,
      },
      autocompleteHandlers: {
        BASE: teamAutocomplete,
      },
    },
    notifications: {
      name: "notifications",
      description: "Configure gameday notifications",
      dm_permission: false,
      default_member_permissions: new PermissionsBitField(
        PermissionFlags.ManageGuild,
      ).toString(),
      options: [
        getLeagueOption({
          description: "The league to configure notifications for",
          noKhl: true,
        }),
        {
          type: ApplicationCommandOptionType.Channel,
          name: "channel",
          description: "The channel to configure notifications for",
          channel_types: [
            ChannelType.GuildText,
            // ChannelType.GuildAnnouncement,
          ],
          required: true,
        },
      ],
      handlers: {
        BASE: notificationsCallback,
      },
    },
    about: {
      name: "about",
      description: "About this bot",
      handlers: {
        BASE: aboutCallback,
      },
    },
    thread: {
      name: "thread",
      name_localizations: {
        fr: "fils-de-discussion",
      },
      description: "Manage gameday threads",
      default_member_permissions: new PermissionsBitField(
        PermissionFlags.ManageChannels | PermissionFlags.ManageThreads,
      ).toString(),
      dm_permission: false,
      options: [
        // {
        //   type: ApplicationCommandOptionType.Subcommand,
        //   name: "create",
        // }
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "close",
          description:
            "Close this gameday thread and send a summary message. This will reveal the score in the parent channel.",
        },
      ],
      handlers: {
        close: threadCloseCallback,
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
