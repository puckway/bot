import { and, eq, or } from "drizzle-orm";
import { Env } from ".";
import { getDb } from "./db";
import {
  HypeMinute,
  League,
  games,
  hypeMinutes,
  leagues,
  notifications,
} from "./db/schema";
import { getPwhlClient } from "./pwhl/client";
import { NotificationSendConfig } from "./commands/notifications";
import {
  GameStatus,
  GameSummary,
  Goal,
  Penalty,
  Period,
  PlayerInfo,
  ScorebarMatch,
} from "hockeytech";
import { REST } from "@discordjs/rest";
import { APIMessage, ChannelType, Routes } from "discord-api-types/v10";
import { EmbedBuilder, time } from "@discordjs/builders";
import { PwhlTeamId, colors } from "./util/colors";
import { pwhlTeamEmoji } from "./util/emojis";
import { pwhlTeamLogoUrl } from "./pwhl/team";
import { toHMS } from "./util/time";
import { htPlayerImageUrl } from "./pwhl/player";

const logErrors = async (promise: Promise<any>) => {
  try {
    await promise;
  } catch (e) {
    console.error(e);
  }
};

/**
 * Takes minutes remaining (e.g. 56 minutes until game start) and converts
 * it to a "hype minute" interval (e.g. 60 minutes). This is mostly a rounding
 * function for cron regularity and to avoid sending excessive hype messages.
 */
const roundToHypeMinute = (minutes: number): HypeMinute | undefined => {
  // We only round up
  if (minutes > hypeMinutes[hypeMinutes.length - 1]) return undefined;
  for (const min of hypeMinutes) {
    if (minutes - min < 5) return min;
  }
};

export const getHtGamePreviewEmbed = (env: Env, game: ScorebarMatch) => {
  return new EmbedBuilder()
    .setAuthor({
      name: `Game #${game.game_number} - ${game.VisitorLongName} @ ${game.HomeLongName}`,
      url: `https://www.thepwhl.com/en/stats/game-center/${game.ID}`,
    })
    .setThumbnail(game.HomeLogo || null)
    .setColor(colors.pwhlTeams[game.HomeID as PwhlTeamId] ?? colors.pwhl)
    .setDescription(
      [
        `🏒 ${time(new Date(game.GameDateISO8601), "t")}`,
        `🏟️ ${game.venue_name}`,
        `🎟️ [Tickets](${game.TicketUrl})`,
      ].join("\n"),
    )
    .addFields(
      {
        name: "Season Records",
        value: `${pwhlTeamEmoji(env, game.VisitorID)} ${game.VisitorCode} **${
          game.VisitorWins
        }-${game.VisitorRegulationLosses}-${game.VisitorOTLosses}-${
          game.VisitorShootoutLosses
        }**`,
        inline: true,
      },
      {
        name: "_ _",
        value: `${pwhlTeamEmoji(env, game.HomeID)} ${game.HomeCode} **${
          game.HomeWins
        }-${game.HomeRegulationLosses}-${game.HomeOTLosses}-${
          game.HomeShootoutLosses
        }**`,
        inline: true,
      },
    )
    .setFooter({
      text: "Wins - Reg. Losses - OT Losses - SO Losses",
    })
    .toJSON();
};

const htPlayerName = (
  player: Pick<
    PlayerInfo,
    "jersey_number" | "first_name" | "last_name" | "player_id"
  >,
) =>
  `#${player.jersey_number} [${player.first_name} ${player.last_name}](https://www.thepwhl.com/en/stats/player/${player.player_id})`;

export const getHtGoalEmbed = (env: Env, game: GameSummary, goal: Goal) => {
  let qualifiers = "";
  if (goal.empty_net === "1") qualifiers += " empty net";
  if (goal.game_tieing === "1") qualifiers += " game-tying";
  // Doesn't really make sense for live games
  // if (goal.game_winning === "1") qualifiers += " game-winning";
  if (goal.short_handed === "1") qualifiers += " shorthanded";
  else if (goal.power_play === "1") qualifiers += " power play";
  else qualifiers += " even strength";
  if (goal.penalty_shot === "1") qualifiers += " penalty shot";
  if (goal.insurance_goal === "1") qualifiers += " insurance";

  // We calculate goals like this in order to compensate for past goals
  // (not the most recent one) that we have not previously sent.
  const goals = game.goals.slice(0, game.goals.indexOf(goal) + 1);
  const goalTeam = goal.home === "1" ? game.home : game.visitor;
  const period = game.periods[Number(goal.period_id) as 1 | 2 | 3];
  return new EmbedBuilder()
    .setAuthor({
      name: `🚨 ${goalTeam.name}${qualifiers} goal 🚨`,
      url: `https://www.thepwhl.com/en/stats/game-center/${game.meta.id}`,
      iconURL: pwhlTeamLogoUrl(goalTeam.id),
    })
    .setThumbnail(
      goal.goal_scorer
        ? htPlayerImageUrl("pwhl", goal.goal_scorer.player_id)
        : pwhlTeamLogoUrl(goalTeam.id),
    )
    .setColor(colors.pwhlTeams[goalTeam.id as PwhlTeamId] ?? colors.pwhl)
    .setDescription(
      [
        `${
          goal.goal_scorer
            ? `**${htPlayerName(goal.goal_scorer)} (${goal.scorer_goal_num})**`
            : ""
        }`,
        `Assists: ${
          goal.assist1_player?.player_id
            ? `${htPlayerName(goal.assist1_player)}${
                goal.assist2_player?.player_id
                  ? `, ${htPlayerName(goal.assist2_player)}`
                  : ""
              }`
            : "none"
        }`,
      ]
        .join("\n")
        .trim() || "No scorer details yet",
    )
    .addFields(
      {
        name: "Score",
        value: `${pwhlTeamEmoji(env, game.visitor.id)} ${game.visitor.code} **${
          goals.filter((g) => g.team_id === game.visitor.id).length
        }** (${game.totalShots.visitor} shots)\n${pwhlTeamEmoji(
          env,
          game.home.id,
        )} ${game.home.code} **${
          goals.filter((g) => g.team_id === game.home.id).length
        }** (${game.totalShots.home} shots)`,
        inline: true,
      },
      {
        name: "Period",
        value: `${toHMS(Number(period.length) - goal.s)} left in the ${
          period?.long_name
        } period`,
        inline: true,
      },
    )
    .setFooter({
      text: `${game.visitor.code} @ ${game.home.code} - Game #${game.meta.game_number}`,
    })
    .toJSON();
};

export const getHtPenaltyEmbed = (
  env: Env,
  game: GameSummary,
  penalty: Penalty,
) => {
  const team = penalty.home === "1" ? game.home : game.visitor;
  const otherTeam = penalty.home === "1" ? game.visitor : game.home;
  const period = game.periods[Number(penalty.period_id) as 1 | 2 | 3];
  return new EmbedBuilder()
    .setAuthor({
      name: `💢 ${team.name} ${penalty.penalty_class.toLowerCase()} penalty${
        penalty.penalty_shot === "1" ? " (penalty shot)" : ""
      } (${penalty.minutes_formatted}) 💢`,
      url: `https://www.thepwhl.com/en/stats/game-center/${game.meta.id}`,
      iconURL: pwhlTeamLogoUrl(team.id),
    })
    .setThumbnail(
      htPlayerImageUrl("pwhl", penalty.player_penalized_info.player_id),
    )
    .setColor(colors.pwhlTeams[team.id as PwhlTeamId] ?? colors.pwhl)
    .setDescription(
      [
        `**${htPlayerName(penalty.player_penalized_info)} (${
          penalty.lang_penalty_description
        })**`,
        penalty.player_penalized_info.player_id !==
        penalty.player_served_info.player_id
          ? `Served by ${htPlayerName(penalty.player_served_info)}`
          : "",
      ].join("\n"),
    )
    .addFields(
      {
        name: "Penalty Minutes",
        value: `${pwhlTeamEmoji(env, team.id)} ${team.code} **${
          game.pimTotal[penalty.home === "1" ? "visitor" : "home"]
        }**`,
        inline: true,
      },
      {
        name: "Power Play",
        value: `${pwhlTeamEmoji(env, otherTeam.id)} ${otherTeam.code} ${pctStat(
          game.powerPlayGoals[penalty.home === "1" ? "visitor" : "home"],
          game.powerPlayCount[penalty.home === "1" ? "visitor" : "home"],
        )}`,
        inline: true,
      },
      // {
      //   name: "Period",
      //   inline: true,
      // },
    )
    .setFooter({
      text: `${game.visitor.code} @ ${game.home.code} - Game #${game.meta.game_number}`,
    })
    .toJSON();
};

const pctStat = (left: number, right: number, showPercent = true) =>
  `**${left}/${right}**${
    showPercent
      ? ` (${
          right === 0
            ? "0"
            : ((left / right) * 100).toPrecision(
                String(Math.floor((left / right) * 100)).length + 1,
              )
        }%)`
      : ""
  }`;

export const getHtStatusEmbed = (
  env: Env,
  game: GameSummary,
  status?: GameStatus,
) => {
  const mvps = game.mvps[0] !== null ? game.mvps : undefined;
  // const period =
  //   game.periods[
  //     Number(Object.keys(game.periods)[Object.keys(game.periods).length - 1]) as
  //       | 1
  //       | 2
  //       | 3
  //   ];
  const awayStats = [
    `${pwhlTeamEmoji(env, game.visitor.id)} ${game.visitor.nickname}`,
    `PP: ${pctStat(game.powerPlayGoals.visitor, game.powerPlayCount.visitor)}`,
    `PIM: **${game.pimTotal.visitor}**`,
    `FO: ${pctStat(
      game.totalFaceoffs.visitor.won,
      game.totalFaceoffs.visitor.att,
    )}`,
  ].join("\n");
  const homeStats = [
    `${pwhlTeamEmoji(env, game.home.id)} ${game.home.nickname}`,
    `PP: ${pctStat(game.powerPlayGoals.home, game.powerPlayCount.home)}`,
    `PIM: **${game.pimTotal.home}**`,
    `FO: ${pctStat(game.totalFaceoffs.home.won, game.totalFaceoffs.home.att)}`,
  ].join("\n");

  return new EmbedBuilder()
    .setAuthor({
      name: `${game.visitor.name} @ ${game.home.name}${
        status === GameStatus.UnofficialFinal
          ? " Unofficial Final"
          : status === GameStatus.Final
            ? " Final"
            : ""
      }`,
      url: `https://www.thepwhl.com/en/stats/game-center/${game.meta.id}`,
    })
    .setThumbnail(pwhlTeamLogoUrl(game.home.id))
    .setColor(colors.pwhlTeams[game.home.id as PwhlTeamId] ?? colors.pwhl)
    .addFields(
      {
        name: "Score",
        value: `${pwhlTeamEmoji(env, game.visitor.id)} ${game.visitor.code} **${
          game.totalGoals.visitor
        }** (${game.totalShots.visitor} shots)\n${pwhlTeamEmoji(
          env,
          game.home.id,
        )} ${game.home.code} **${game.totalGoals.home}** (${
          game.totalShots.home
        } shots)`,
        inline: true,
      },
      {
        name: "Stats",
        value: awayStats + (mvps ? `\n\n${homeStats}` : ""),
        inline: true,
      },
      mvps
        ? {
            name: "Stars of the game",
            value: mvps
              .map(
                (player, i) =>
                  `${pwhlTeamEmoji(
                    env,
                    player.home ? game.home.id : game.visitor.id,
                  )} ${Array(i + 1)
                    .fill(":star:")
                    .join("")} [${player.first_name} ${
                    player.last_name
                  }](https://www.thepwhl.com/en/stats/player/${
                    player.player_id
                  })`,
              )
              .join("\n"),
            inline: true,
          }
        : {
            name: "_ _",
            value: homeStats,
            inline: true,
          },
      // {
      //   name: "Period",
      //   value: period?.long_name ?? "_ _",
      //   inline: true,
      // },
    )
    .setFooter({
      text: [
        `${game.visitor.code} @ ${game.home.code} - Game #${game.meta.game_number}`,
        status === GameStatus.UnofficialFinal
          ? "This is an unofficial final. Details like shot totals may change before the final is posted."
          : "",
      ]
        .join("\n")
        .trim(),
    })
    .toJSON();
};

export const getHtGoalsEmbed = (env: Env, game: GameSummary) => {
  return new EmbedBuilder()
    .setAuthor({
      name: "Goals",
    })
    .setColor(colors.pwhlTeams[game.home.id as PwhlTeamId] ?? colors.pwhl)
    .addFields(
      Object.values(game.periods)
        .map((period: Period) => {
          const goals = game.goals.filter((g) => g.period_id === period.id);
          return {
            name: `${period.long_name} Period`,
            value:
              goals.length === 0
                ? "No goals"
                : goals
                    .map((goal) => {
                      const team = goal.home === "1" ? game.home : game.visitor;
                      return `${pwhlTeamEmoji(env, team.id)} ${htPlayerName(
                        goal.goal_scorer,
                      )} (${goal.scorer_goal_num})`;
                    })
                    .join("\n")
                    .slice(0, 1024),
            inline: false,
          };
        })
        .slice(0, 25),
    )
    .setFooter({
      text: `${game.visitor.code} @ ${game.home.code} - Game #${game.meta.game_number}`,
    })
    .toJSON();
};

const filterConfigChannels = (
  configs: [string, NotificationSendConfig][],
  filter: (config: NotificationSendConfig) => unknown,
) =>
  configs
    // Filter by config value
    .filter(([_, c]) => filter(c))
    // Get channel ID
    .map((c) => c[0])
    // No duplicates
    .filter((id, i, a) => a.indexOf(id) === i);

export const checkPosts = async (
  event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext,
) => {
  const now = new Date(event.scheduledTime);
  const rest = new REST().setToken(env.DISCORD_TOKEN);
  const db = getDb(env.DB);
  const entries = await db.query.notifications.findMany({
    where: eq(notifications.active, true),
    columns: {
      league: true,
      channelId: true,
      teamIds: true,
      sendConfig: true,
    },
  });
  const ongoingGames = await db.query.games.findMany({
    columns: { id: false },
  });
  const ongoingIds = Object.fromEntries(
    leagues.map((l) => [
      l,
      ongoingGames.filter((g) => g.league === l).map((g) => g.nativeId),
    ]),
  ) as Record<League, string[]>;

  const channelIds = Object.fromEntries(leagues.map((l) => [l, {}])) as Record<
    League,
    Record<string, Record<string, NotificationSendConfig>>
  >;

  for (const entry of entries) {
    for (const teamId of entry.teamIds) {
      if (!channelIds[entry.league][teamId]) {
        channelIds[entry.league][teamId] = {
          [entry.channelId]: entry.sendConfig,
        };
      } else {
        channelIds[entry.league][teamId][entry.channelId] = entry.sendConfig;
      }
    }
  }

  const postedPreviewIds: [League, string][] = [];
  const postedUnofficialFinalIds: [League, string][] = [];
  const postedFinalIds: [League, string][] = [];
  const postedHypeMinutes: Record<string, [League, string][]> = {};
  for (const league of Object.keys(channelIds) as League[]) {
    switch (league) {
      case "pwhl": {
        const client = getPwhlClient();
        const scorebar = (await client.getScorebar(2, 1)).SiteKit.Scorebar;
        const newGames = scorebar.filter(
          (g) => !ongoingIds.pwhl.includes(g.ID),
        );
        if (newGames.length !== 0) {
          await db
            .insert(games)
            .values(
              newGames.map((game) => ({
                league,
                nativeId: game.ID,
                lastKnownHomeGoals: Number(game.HomeGoals),
                lastKnownAwayGoals: Number(game.VisitorGoals),
              })),
            )
            .onConflictDoNothing();
        }
        for (const game of scorebar) {
          const start = new Date(game.GameDateISO8601);
          const dbGame = ongoingGames.find(
            (g) => g.league === league && g.nativeId === game.ID,
          );
          const channelConfigs = [
            ...Object.entries(channelIds[league][game.HomeID] ?? {}),
            ...Object.entries(channelIds[league][game.VisitorID] ?? {}),
          ];
          switch (game.GameStatus) {
            case GameStatus.NotStarted: {
              // Don't send anything more than 6 hours in advance
              if (start.getTime() - now.getTime() > 3600000 * 6) break;

              if (!dbGame?.postedPreview) {
                const previewChannels = filterConfigChannels(
                  channelConfigs,
                  (c) => c.preview,
                );
                const threadChannels = filterConfigChannels(
                  channelConfigs,
                  (c) => c.threads,
                );
                if (previewChannels.length > 0) {
                  for (const channelId of previewChannels) {
                    ctx.waitUntil(
                      logErrors(
                        (async () => {
                          const message = (await rest.post(
                            Routes.channelMessages(channelId),
                            {
                              body: {
                                embeds: [getHtGamePreviewEmbed(env, game)],
                              },
                            },
                          )) as APIMessage;
                          if (threadChannels.includes(channelId)) {
                            await rest.post(
                              Routes.threads(channelId, message.id),
                              {
                                body: {
                                  name: `${game.VisitorCode} @ ${game.HomeCode} - ${game.GameDate}`,
                                },
                              },
                            );
                          }
                          return undefined;
                        })(),
                      ),
                    );
                  }
                  postedPreviewIds.push([league, game.ID]);
                }
                if (dbGame?.lastPostedHypeMinutes !== hypeMinutes[0]) {
                  const hypeChannels = filterConfigChannels(
                    channelConfigs,
                    (c) => c.hype,
                  );
                  if (hypeChannels.length > 0) {
                    const minutes = Math.floor(
                      ((start.getTime() - now.getTime()) / 1000) * 60,
                    );
                    const hypeMin = roundToHypeMinute(minutes);
                    if (hypeMin) {
                      for (const channelId of hypeChannels) {
                        ctx.waitUntil(
                          logErrors(
                            rest.post(Routes.channelMessages(channelId), {
                              body: {
                                content: `${game.VisitorLongName} @ ${
                                  game.HomeLongName
                                } starts ${time(start, "R")}`,
                              },
                            }),
                          ),
                        );
                      }
                      postedHypeMinutes[String(hypeMin)] =
                        postedHypeMinutes[String(hypeMin)] ?? [];
                      postedHypeMinutes[String(hypeMin)].push([
                        league,
                        game.ID,
                      ]);
                    }
                  }
                }
              }
              break;
            }
            case GameStatus.InProgress: {
              let summary: GameSummary | undefined = undefined;
              const getSummary = async () =>
                (await client.getGameSummary(Number(game.ID))).GC.Gamesummary;

              const periodChannels = filterConfigChannels(
                channelConfigs,
                (c) => c.periods,
              );
              const startChannels = filterConfigChannels(
                channelConfigs,
                (c) => c.start,
              ).filter((id) => !periodChannels.includes(id));
              const threadChannels = filterConfigChannels(
                channelConfigs,
                (c) => c.threads,
              );
              const goalChannels = filterConfigChannels(
                channelConfigs,
                (c) => c.goals,
              );

              if (
                dbGame?.lastKnownPeriodId !== game.Period &&
                periodChannels.length !== 0
              ) {
                if (!summary) summary = await getSummary();
                const period =
                  summary.periods[
                    Number(
                      Object.keys(summary.periods)[
                        Object.keys(summary.periods).length - 1
                      ],
                    ) as 1 | 2 | 3
                  ];

                for (const channelId of [
                  ...periodChannels,
                  ...(game.Period === "1" ? startChannels : []),
                ]) {
                  ctx.waitUntil(
                    logErrors(
                      (async () => {
                        const message = (await rest.post(
                          Routes.channelMessages(channelId),
                          {
                            body: {
                              content: `**${period?.long_name} Period Starting - ${game.VisitorCode} @ ${game.HomeCode}**`,
                              embeds: [getHtStatusEmbed(env, summary)],
                            },
                          },
                        )) as APIMessage;
                        if (
                          threadChannels.includes(channelId) &&
                          game.Period === "1"
                        ) {
                          await rest.post(
                            Routes.threads(channelId, message.id),
                            {
                              body: {
                                name: `${game.VisitorCode} @ ${game.HomeCode} - ${game.GameDate}`,
                              },
                            },
                          );
                        }
                        return undefined;
                      })(),
                    ),
                  );
                }
              }

              if (
                dbGame?.lastKnownPeriodId !== game.Period &&
                game.Period === "1"
              ) {
                for (const channelId of threadChannels.filter(
                  // Assume threads for the other two configs have already been created
                  (id) =>
                    !filterConfigChannels(
                      channelConfigs,
                      (c) => c.preview,
                    ).includes(id) &&
                    !startChannels.includes(id) &&
                    !periodChannels.includes(id),
                )) {
                  ctx.waitUntil(
                    logErrors(
                      rest.post(Routes.threads(channelId), {
                        body: {
                          name: `${game.VisitorCode} @ ${game.HomeCode} - ${game.GameDate}`,
                          // We need some extra statefulness to have this
                          // work with announcement channels due to the separate
                          // thread type required
                          type: ChannelType.PublicThread,
                        },
                      }),
                    ),
                  );
                }
              }

              const score = [Number(game.VisitorGoals), Number(game.HomeGoals)];
              const totalScore = score[0] + score[1];
              const totalPriorScore = dbGame
                ? dbGame.lastKnownAwayGoals + dbGame.lastKnownHomeGoals
                : 0;

              if (totalScore > totalPriorScore && goalChannels.length !== 0) {
                if (!summary) summary = await getSummary();

                const revGoals = [...summary.goals].reverse();
                for (const missedRevIndex of Array(totalScore - totalPriorScore)
                  .fill(undefined)
                  .map((_, i) => i)
                  // Earliest goals first
                  .reverse()) {
                  const goal = revGoals[missedRevIndex];
                  for (const channelId of goalChannels) {
                    ctx.waitUntil(
                      logErrors(
                        rest.post(Routes.channelMessages(channelId), {
                          body: {
                            embeds: [getHtGoalEmbed(env, summary, goal)],
                          },
                        }),
                      ),
                    );
                  }
                }
              }

              // if (
              //   summary &&
              //   summary.penalties.length >
              //     (dbGame?.lastKnownPenaltyCount ?? 0) &&
              //   penaltyChannels.length !== 0
              // ) {
              //   const penalties = summary.penalties.slice(
              //     dbGame?.lastKnownPenaltyCount ?? 0,
              //   );
              //   for (const penalty of penalties) {
              //     for (const channelId of penaltyChannels) {
              //       ctx.waitUntil(
              //         rest.post(Routes.channelMessages(channelId), {
              //           body: {
              //             embeds: [getHtPenaltyEmbed(env, summary, penalty)],
              //           },
              //         }),
              //       );
              //     }
              //   }
              // }

              if (
                // A goal may have been recalled, hence the check for
                // inequality instead of greater/less than
                totalScore !== totalPriorScore ||
                game.Period !== dbGame?.lastKnownPeriodId
                // (summary &&
                //   summary.penalties.length !== dbGame?.lastKnownPenaltyCount)
              ) {
                await db
                  .update(games)
                  .set({
                    lastKnownAwayGoals: Number(game.VisitorGoals),
                    lastKnownHomeGoals: Number(game.HomeGoals),
                    lastKnownPenaltyCount: summary
                      ? summary.penalties.length
                      : undefined,
                    lastKnownPeriodId: game.Period,
                  })
                  .where(
                    and(eq(games.league, league), eq(games.nativeId, game.ID)),
                  );
              }
              break;
            }
            case GameStatus.UnofficialFinal: {
              if (dbGame?.postedUnofficialFinal) break;
              const channels = filterConfigChannels(
                channelConfigs,
                (c) => c.end,
              );
              if (channels.length === 0) break;

              const summary = (await client.getGameSummary(Number(game.ID))).GC
                .Gamesummary;

              for (const channelId of channels) {
                ctx.waitUntil(
                  logErrors(
                    rest.post(Routes.channelMessages(channelId), {
                      body: {
                        embeds: [
                          getHtStatusEmbed(env, summary, game.GameStatus),
                          getHtGoalsEmbed(env, summary),
                        ],
                      },
                    }),
                  ),
                );
              }
              postedUnofficialFinalIds.push([league, game.ID]);
              break;
            }
            case GameStatus.Final: {
              if (dbGame?.postedFinal) break;
              const channels = filterConfigChannels(
                channelConfigs,
                (c) => c.final,
              );
              if (channels.length === 0) break;

              const summary = (await client.getGameSummary(Number(game.ID))).GC
                .Gamesummary;

              for (const channelId of channels) {
                ctx.waitUntil(
                  logErrors(
                    rest.post(Routes.channelMessages(channelId), {
                      body: {
                        embeds: [
                          getHtStatusEmbed(env, summary, game.GameStatus),
                          getHtGoalsEmbed(env, summary),
                        ],
                      },
                    }),
                  ),
                );
              }
              postedFinalIds.push([league, game.ID]);
              break;
            }
            default:
              break;
          }
        }
        break;
      }
      default:
        break;
    }
  }
  if (postedPreviewIds.length !== 0) {
    await db
      .insert(games)
      .values(
        postedPreviewIds.map(([league, id]) => ({
          league,
          nativeId: id,
          postedPreview: true,
        })),
      )
      .onConflictDoUpdate({
        set: { postedPreview: true },
        target: [games.league, games.nativeId],
        where: or(
          ...postedPreviewIds.map(([league, id]) =>
            and(eq(games.league, league), eq(games.nativeId, id)),
          ),
        ),
      });
  }
  if (Object.keys(postedHypeMinutes).length !== 0) {
    for (const min of Object.keys(postedHypeMinutes)) {
      await db
        .insert(games)
        .values(
          postedHypeMinutes[min].map(([league, id]) => ({
            league,
            nativeId: id,
            lastPostedHypeMinutes: Number(min) as HypeMinute,
          })),
        )
        .onConflictDoUpdate({
          set: { lastPostedHypeMinutes: Number(min) as HypeMinute },
          target: [games.league, games.nativeId],
          where: or(
            ...postedHypeMinutes[min].map(([league, id]) =>
              and(eq(games.league, league), eq(games.nativeId, id)),
            ),
          ),
        });
    }
  }
  if (postedUnofficialFinalIds.length !== 0) {
    await db
      .insert(games)
      .values(
        postedUnofficialFinalIds.map(([league, id]) => ({
          league,
          nativeId: id,
          postedUnofficialFinal: true,
        })),
      )
      .onConflictDoUpdate({
        set: { postedUnofficialFinal: true },
        target: [games.league, games.nativeId],
        where: or(
          ...postedUnofficialFinalIds.map(([league, id]) =>
            and(eq(games.league, league), eq(games.nativeId, id)),
          ),
        ),
      });
  }
  if (postedFinalIds.length !== 0) {
    console.log(`Inserting ${postedFinalIds.length} final records`)
    await db
      .insert(games)
      .values(
        postedFinalIds.map(([league, id]) => ({
          league,
          nativeId: id,
          postedFinal: true,
        })),
      )
      .onConflictDoUpdate({
        set: { postedFinal: true },
        target: [games.league, games.nativeId],
        where: or(
          ...postedFinalIds.map(([league, id]) =>
            and(eq(games.league, league), eq(games.nativeId, id)),
          ),
        ),
      });
  }
};
