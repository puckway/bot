import {
  type APIApplicationCommandStringOption,
  ApplicationCommandOptionType,
  ChannelType,
  type RESTPutAPIApplicationCommandsJSONBody,
  RouteBases,
  Routes,
} from "discord-api-types/v10";
import { PermissionFlags, PermissionsBitField } from "discord-bitflag";
import dotenv from "dotenv";

/**
 * This file is meant to be run from the command line, and is not used by the
 * application server.  It's allowed to use node.js primitives, and only needs
 * to be run once.
 */

const config = dotenv.config({ path: ".dev.vars" });
if (!config.parsed) {
  throw Error("Invalid .dev.vars");
}

const token = config.parsed.DISCORD_TOKEN;
const applicationId = config.parsed.DISCORD_APPLICATION_ID;

if (!token) {
  throw new Error("The DISCORD_TOKEN environment variable is required.");
}
if (!applicationId) {
  throw new Error(
    "The DISCORD_APPLICATION_ID environment variable is required.",
  );
}

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
    // {
    //   name: "QMJHL",
    //   name_localizations: {
    //     fr: "LHJMQ",
    //   },
    //   value: "lhjmq",
    // },
    // {
    //   name: "OHL",
    //   name_localizations: {
    //     fr: "LHO",
    //   },
    //   value: "ohl",
    // },
    {
      name: "PWHL",
      name_localizations: {
        fr: "LPHF",
      },
      value: "pwhl",
    },
    // {
    //   name: "SPHL",
    //   value: "sphl",
    // },
    // {
    //   name: "WHL",
    //   value: "whl",
    // },
  ],
  required: required ?? true,
});

const payload: RESTPutAPIApplicationCommandsJSONBody = [
  {
    name: "schedule",
    name_localizations: {
      ru: "kалендарь",
      "zh-CN": "赛程",
      fr: "calendrier",
    },
    description: "...",
    options: [
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: "day",
        name_localizations: {
          fr: "jour",
        },
        description:
          "Get all games for a specific date, or today if not specified",
        description_localizations: {
          fr: "Obtenir tous les jeux pour une date spécifique, ou aujourd'hui si elle n'est pas spécifiée.",
        },
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
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: "month",
        name_localizations: {
          fr: "mois",
        },
        description:
          "Get all games for a month, or the current month if not specified",
        description_localizations: {
          fr: "Obtenir tous les jeux pour un mois donné, ou le mois en cours s'il n'est pas spécifié.",
        },
        options: [
          getLeagueOption({
            description: "The league to get games for",
            noKhl: true,
          }),
          {
            type: ApplicationCommandOptionType.String,
            name: "month",
            description: "The month to get games for",
            required: false,
            choices: Array(12)
              .fill(undefined)
              .map((_, i) => {
                const d = new Date(1970, i, 1);
                return {
                  name: d.toLocaleString("en-US", { month: "long" }),
                  value: String(i),
                  name_localizations: {
                    fr: d.toLocaleString("fr", { month: "long" }),
                    ru: d.toLocaleString("ru", { month: "long" }),
                    "zh-CN": d.toLocaleString("zh-CN", { month: "long" }),
                  },
                };
              }),
          },
          {
            type: ApplicationCommandOptionType.String,
            name: "team",
            name_localizations: { fr: "equipe" },
            description: "The team to get games for",
            required: false,
            autocomplete: true,
          },
          {
            type: ApplicationCommandOptionType.Boolean,
            name: "exclude-finished-games",
            name_localizations: { fr: "exclure-les-jeux-terminés" },
            description:
              "Exclude games that have already happened from the list",
            required: false,
          },
        ],
      },
    ],
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
    name: "pickems",
    description: "Configure Pickems",
    dm_permission: false,
    default_member_permissions: new PermissionsBitField(
      PermissionFlags.ManageGuild,
    ).toString(),
    options: [
      getLeagueOption({
        description: "The league to configure Pickems for",
        noKhl: true,
      }),
    ],
  },
  {
    name: "about",
    description: "About this bot",
  },
  {
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
          "Close this gameday thread & send a summary. This will reveal the score in the parent channel.",
      },
    ],
  },
];

const response = await fetch(
  `${RouteBases.api}${Routes.applicationCommands(applicationId)}`,
  {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${token}`,
    },
    method: "PUT",
    body: JSON.stringify(payload),
  },
);

if (response.ok) {
  console.log("Registered all commands");
  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
} else {
  console.error("Error registering commands");
  let errorText = `Error registering commands \n ${response.url}: ${response.status} ${response.statusText}`;
  try {
    const error = await response.text();
    if (error) {
      errorText = `${errorText} \n\n ${error}`;
    }
  } catch (err) {
    console.error("Error reading body from request:", err);
  }
  console.error(errorText);
}
