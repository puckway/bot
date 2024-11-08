import {
  APIApplicationCommandOptionChoice,
  ButtonStyle,
  MessageFlags,
} from "discord-api-types/v10";
import { and, count, desc, eq, sql } from "drizzle-orm";
import {
  AppCommandAutocompleteCallback,
  ChatInputAppCommandCallback,
} from "../commands";
import { getDb } from "../db";
import { makeSnowflake, pickemsVotes } from "../db/schema";
import { uni } from "../util/l10n";
import { getHtClient, HockeyTechLeague } from "../ht/client";
import {
  ActionRowBuilder,
  ButtonBuilder,
  EmbedBuilder,
} from "@discordjs/builders";
import { colors } from "../util/colors";
import { getLeagueLogoUrl } from "../util/emojis";
import { ButtonCallback, componentStore } from "../components";
import { storeComponents } from "../util/components";

// const s = transformLocalizations({
//   en: {
//   },
//   fr: {
//   },
// });

export const seasonAutocomplete: AppCommandAutocompleteCallback = async (
  ctx,
) => {
  const guildId = ctx.interaction.guild_id;
  if (!guildId) throw Error("Guild only");

  const league = ctx.getStringOption("league").value as HockeyTechLeague;
  const query = ctx.getStringOption("season").value;
  const client = getHtClient(league);
  const seasons = (await client.getSeasonList()).SiteKit.Seasons;

  return [
    ...seasons
      .filter((season) => season.season_name.startsWith(query.toLowerCase()))
      .map(
        (season) =>
          ({
            name: season.season_name,
            value: season.season_id,
          }) satisfies APIApplicationCommandOptionChoice,
      )
      .slice(0, 24),
    {
      name: "All-time",
      value: "all",
    },
  ];
};

export const pickemsLeaderboardCallback: ChatInputAppCommandCallback = async (
  ctx,
) => {
  const guildId = ctx.interaction.guild_id;
  if (!guildId) throw Error("Guild only");

  const league = ctx.getStringOption("league").value as HockeyTechLeague;
  const seasonIdValue = ctx.getStringOption("season").value as
    | string
    | undefined;

  const client = getHtClient(league);
  const seasons = (await client.getSeasonList()).SiteKit.Seasons;
  if (seasons.length === 0) {
    return ctx.reply({
      content:
        "There aren't any seasons for this league. This shouldn't happen.",
      flags: MessageFlags.Ephemeral,
    });
  }
  const season =
    seasonIdValue === "all"
      ? null
      : seasonIdValue
        ? seasons.find((s) => s.season_id === seasonIdValue)
        : seasons[0];
  if (season === undefined) {
    return ctx.reply({
      content: "That's not a valid season.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const db = getDb(ctx.env.DB);
  const votes = await db
    .select({
      userId: pickemsVotes.userId,
      total: count().as("total"),
      correct: count(
        sql`CASE WHEN ${pickemsVotes.voteTeamId} = ${pickemsVotes.winningTeamId} THEN 1 ELSE NULL END`,
      ).as("correct"),
    })
    .from(pickemsVotes)
    .groupBy(pickemsVotes.userId)
    .limit(10)
    .orderBy(desc(sql`correct / total`))
    .where(
      and(
        eq(pickemsVotes.league, league),
        eq(pickemsVotes.guildId, makeSnowflake(guildId)),
        season === null
          ? sql`true`
          : eq(pickemsVotes.seasonId, season?.season_id),
      ),
    );
  if (votes.length === 0) {
    return ctx.reply({
      content: "Looks like no votes have been recorded for this season.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const embed = new EmbedBuilder()
    .setAuthor({
      name: uni(ctx, league),
      iconURL: getLeagueLogoUrl(league),
    })
    .setTitle(
      `Pickems Leaderboard - ${
        season
          ? `${season.shortname}${season.playoff === "1" ? " Playoffs" : ""}`
          : "All-time"
      }`,
    )
    .setColor(colors[league])
    .setDescription(
      votes
        .map(
          (vote, i) =>
            `${i + 1}. <@${vote.userId}>: ${vote.correct}/${vote.total} (${(
              (vote.correct / (vote.total ?? 1)) *
              100
            ).toFixed(1)}%)`,
        )
        .join("\n"),
    );

  return ctx.reply({
    embeds: [embed.toJSON()],
    // flags: MessageFlags.Ephemeral,
  });
};

export const pickemsMeCallback: ChatInputAppCommandCallback = async (ctx) => {
  const guildId = ctx.interaction.guild_id;
  if (!guildId) throw Error("Guild only");

  const league = ctx.getStringOption("league").value as HockeyTechLeague;

  const client = getHtClient(league);
  const seasons = (await client.getSeasonList()).SiteKit.Seasons;
  if (seasons.length === 0) {
    return ctx.reply({
      content:
        "There aren't any seasons for this league. This shouldn't happen.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const db = getDb(ctx.env.DB);
  const votes = await db
    .select({
      seasonId: pickemsVotes.seasonId,
      total: count().as("total"),
      correct: count(
        sql`CASE WHEN ${pickemsVotes.voteTeamId} = ${pickemsVotes.winningTeamId} THEN 1 ELSE NULL END`,
      ).as("correct"),
    })
    .from(pickemsVotes)
    .groupBy(pickemsVotes.seasonId)
    .limit(25)
    // Use the fact that season IDs are sequential to sort chronologically
    .orderBy(desc(sql`cast(${pickemsVotes.seasonId} as int)`))
    .where(
      and(
        eq(pickemsVotes.league, league),
        eq(pickemsVotes.guildId, makeSnowflake(guildId)),
        eq(pickemsVotes.userId, makeSnowflake(ctx.user.id)),
      ),
    );
  if (votes.length === 0) {
    return ctx.reply({
      content: "Looks like you don't have any votes recorded.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const embed = new EmbedBuilder()
    .setAuthor({
      name: uni(ctx, league),
      iconURL: getLeagueLogoUrl(league),
    })
    .setTitle("Pickems Leaderboard - Personal, All-time")
    .setColor(colors[league])
    .setFields(
      votes.map((vote) => {
        const season = seasons.find((s) => s.season_id === vote.seasonId);
        return {
          name: season
            ? season.season_name
            : `Unknown Season (${vote.seasonId})`,
          value: `${vote.correct}/${vote.total} (${(
            (vote.correct / (vote.total ?? 1)) *
            100
          ).toFixed(1)}%)`,
          inline: true,
        };
      }),
    );

  return ctx.reply({
    embeds: [embed.toJSON()],
    flags: MessageFlags.Ephemeral,
  });
};

export const pickemsPurgeCallback: ChatInputAppCommandCallback = async (
  ctx,
) => {
  const db = getDb(ctx.env.DB);
  const votes = await db
    .select({ total: count() })
    .from(pickemsVotes)
    .groupBy(pickemsVotes.guildId)
    .where(eq(pickemsVotes.userId, makeSnowflake(ctx.user.id)));
  if (votes.length === 0) {
    return ctx.reply({
      content: "Looks like you don't have any votes recorded.",
      flags: MessageFlags.Ephemeral,
    });
  }

  return ctx.reply({
    content: `Are you sure you want to delete all **${votes.reduce(
      (prev, cur) => prev + cur.total,
      0,
    )}** of your votes across **${
      votes.length
    }** servers? This cannot be undone.`,
    components: [
      new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          await storeComponents(
            ctx.env.KV,
            [
              new ButtonBuilder()
                .setStyle(ButtonStyle.Danger)
                .setLabel("Delete"),
              {
                componentRoutingId: "pickems-purge-confirm",
                componentTimeout: 300,
                componentOnce: true,
              },
            ],
            [
              new ButtonBuilder()
                .setStyle(ButtonStyle.Secondary)
                .setLabel("Cancel"),
              {
                componentRoutingId: "pickems-purge-cancel",
                componentTimeout: 300,
                componentOnce: true,
              },
            ],
          ),
        )
        .toJSON(),
    ],
    flags: MessageFlags.Ephemeral,
  });
};

export const pickemsPurgeConfirmCallback: ButtonCallback = async (ctx) => {
  const db = getDb(ctx.env.DB);
  await db
    .delete(pickemsVotes)
    .where(eq(pickemsVotes.userId, makeSnowflake(ctx.user.id)));

  return ctx.updateMessage({
    content: "Done. Your past predictions are purged permanently.",
    components: [],
    flags: MessageFlags.Ephemeral,
  });
};

export const pickemsPurgeCancelCallback: ButtonCallback = async (ctx) =>
  ctx.updateMessage({
    content: "Cancelled. Your votes are safe with me.",
    components: [],
    flags: MessageFlags.Ephemeral,
  });
