import {
  ButtonBuilder,
  ContainerBuilder,
  EmbedBuilder,
  TextDisplayBuilder,
  channelLink,
  time,
} from "@discordjs/builders";
import { REST } from "@discordjs/rest";
import {
  APIMessage,
  APIThreadChannel,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  RESTPostAPIChannelMessageJSONBody,
  Routes,
} from "discord-api-types/v10";
import { and, eq } from "drizzle-orm";
import type HockeyTech from "hockeytech";
import {
  type GCGamePlayByPlay,
  GamePlayByPlayEvent,
  type GamePlayByPlayEventBase,
  type GamePlayByPlayEventFaceoff,
  type GamePlayByPlayEventGoal,
  type GamePlayByPlayEventGoalieChange,
  type GamePlayByPlayEventHit,
  type GamePlayByPlayEventPenalty,
  type GamePlayByPlayEventShot,
  GameStatus,
  type GameSummary,
  type GamesByDate,
  type NumericBoolean,
  type Period,
  type PlayerInfo,
  type TeamsBySeason,
} from "hockeytech";
import { pope } from "pope";
import { getBorderCharacters, table } from "table";
import { isoDate } from "./commands/calendar";
import { NotificationSendConfig } from "./commands/notifications";
import { HockeyTechTeamStanding, getHtStandings } from "./commands/standings";
import { getDb } from "./db";
import {
  HypeMinute,
  League,
  hypeMinutes,
  leagues,
  notifications,
  pickemsPolls,
} from "./db/schema";
import { HockeyTechLeague, getHtClient, getPointsPct } from "./ht/client";
import { htPlayerImageUrl } from "./ht/player";
import { getHtTeamLogoUrl } from "./ht/team";
import { getTeamColor } from "./util/colors";
import { getTeamEmoji } from "./util/emojis";
import { ExternalUtils, getExternalUtils } from "./util/external";
import { getNow, toHMS } from "./util/time";

enum AlarmType {
  Check = 0,
  Purge = 1,
}

interface GameCache {
  id: string;
}

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

const dashes = (length: number) => Array(length).fill("-").join("");

const boldIf = (input: string, condition: boolean) =>
  condition ? `**${input}**` : String(input);

export const getHtGamePreviewEmbed = (
  league: HockeyTechLeague,
  game: GamesByDate,
  standings?: HockeyTechTeamStanding[],
  brackets?: ModuleKitBrackets,
) => {
  const utils = getExternalUtils(league);
  const visitorStd = standings?.find((t) => t.team_id === game.visiting_team);
  const homeStd = standings?.find((t) => t.team_id === game.home_team);
  const showingStandings = !!visitorStd && !!homeStd;

  const description = [
    `🏒 ${time(getGameDate(game), "t")}`,
    `🏟️ ${game.venue}`,
    game.tickets_url ? `🎟️ [Tickets](${game.tickets_url})` : "",
  ]
    .filter(Boolean)
    .join("\n");

  if (brackets) {
    let round: BracketRound | undefined;
    let matchup: RoundMatchup | undefined;
    let gameNumber: number | undefined;
    for (const bracketRound of brackets.rounds) {
      for (const roundMatchup of bracketRound.matchups) {
        let i = -1;
        for (const matchupGame of roundMatchup.games) {
          i += 1;
          if (matchupGame.game_id === game.id) {
            round = bracketRound;
            matchup = roundMatchup;
            gameNumber = i + 1;
            break;
          }
        }
      }
    }

    if (round && matchup && gameNumber !== undefined) {
      const team1 = brackets.teams[matchup.team1];
      const team2 = brackets.teams[matchup.team2];
      const score = `${matchup.team1_wins}-${matchup.team2_wins}`;

      return (
        new EmbedBuilder()
          .setAuthor({
            name: `${game.visiting_team_name} @ ${game.home_team_name} - Round ${round.round}, Game ${gameNumber}`,
            url: utils.gameCenter(game.id),
          })
          .setThumbnail(getHtTeamLogoUrl(league, game.home_team))
          .setColor(getTeamColor(league, game.home_team))
          .setDescription(
            `${description}\n\n${
              matchup.team1_wins === matchup.team2_wins
                ? `Series is tied **${score}**`
                : matchup.team1_wins > matchup.team2_wins
                  ? `${getTeamEmoji(league, matchup.team1)} ${
                      team1?.team_code
                    } leads **${score}**`
                  : `${getTeamEmoji(league, matchup.team2)} ${
                      team2?.team_code
                    } leads **${matchup.team2_wins}-${matchup.team1_wins}**`
            }\n-# \\* if necessary`,
          )
          .addFields(
            matchup.games.map((g, i) => {
              // const homeTimezone =
              const away = brackets.teams[g.visiting_team];
              const home = brackets.teams[g.home_team];
              return {
                name: `Game ${i + 1} - ${time(
                  // TODO: make sure this is UTC, it probably isn't
                  new Date(g.date_time),
                  "d",
                )}${g.if_necessary === "1" ? "*" : ""}`,
                value:
                  g.status === GameStatus.NotStarted
                    ? `${getTeamEmoji(league, g.visiting_team)} ${
                        away?.team_code
                      } @ ${getTeamEmoji(league, g.home_team)} ${
                        home?.team_code
                      }`
                    : `${getTeamEmoji(league, g.visiting_team)} ${
                        away?.team_code
                      } ${boldIf(
                        g.visiting_goal_count,
                        g.visiting_goal_count > g.home_goal_count,
                      )} @ ${boldIf(
                        g.home_goal_count,
                        g.home_goal_count > g.visiting_goal_count,
                      )} ${getTeamEmoji(league, g.home_team)} ${
                        home?.team_code
                      }`,
              };
            }),
          )
          // Really wanted to use this but it's just so ugly
          // .setImage(brackets.logo || null)
          .setFooter({
            text: `${round.round_name}\n🆔 ${league}:${game.id}`,
          })
          .toJSON()
      );
    }
  }

  return new EmbedBuilder()
    .setAuthor({
      name: `Game #${game.game_number} - ${game.visiting_team_name} @ ${game.home_team_name}`,
      url: utils.gameCenter(game.id),
    })
    .setThumbnail(getHtTeamLogoUrl(league, game.home_team))
    .setColor(getTeamColor(league, game.home_team))
    .setDescription(description)
    .addFields(
      visitorStd && homeStd
        ? [visitorStd, homeStd]
            .sort((a, b) => a.rank - b.rank)
            .map((std) => {
              const headers = ["GP", "PTS", "W", "OTL", "L", "PCT"];
              const data = [
                std.games_played,
                std.points,
                std.wins,
                std.ot_losses,
                std.losses,
                getPointsPct(
                  league,
                  Number(std.points),
                  Number(std.games_played),
                ),
              ];
              if (league === "pwhl") {
                headers.splice(3, 0, "OTW");
                data.splice(
                  2,
                  1,
                  std.regulation_wins,
                  String(Number(std.ot_wins) + Number(std.shootout_wins)),
                );
              }
              return {
                name: `#${std.rank} - ${getTeamEmoji(league, std.team_id)} ${
                  std.team_name
                }`,
                value: `\`\`\`apache\n${table(
                  [headers, headers.map((str) => dashes(str.length)), data],
                  {
                    border: getBorderCharacters("void"),
                    columnDefault: { paddingLeft: 0, paddingRight: 1 },
                    drawHorizontalLine: () => false,
                  },
                )}\`\`\``,
                inline: false,
              };
            })
        : [
            {
              name: "Season Records",
              value: `${getTeamEmoji(league, game.visiting_team)} ${
                game.visiting_team_code
              } **${game.visiting_stats.wins}-${game.visiting_stats.losses}-${
                Number(game.visiting_stats.ot_losses) +
                Number(game.visiting_stats.shootout_losses)
              }**`,
              inline: true,
            },
            {
              name: "_ _",
              value: `${getTeamEmoji(league, game.home_team)} ${
                game.home_team_code
              } **${game.home_stats.wins}-${game.home_stats.losses}-${
                Number(game.home_stats.ot_losses) +
                Number(game.home_stats.shootout_losses)
              }**`,
              inline: true,
            },
          ],
    )
    .setFooter({
      text: `${
        showingStandings ? "" : "Wins - Reg. Losses - OT Losses\n"
      }🆔 ${league}:${game.id}`,
    })
    .toJSON();
};

const getSeriesWinner = (matchup: RoundMatchup): string | null => {
  const lastGame = matchup.games[matchup.games.length - 1];
  if (
    lastGame.status === GameStatus.UnofficialFinal ||
    lastGame.status === GameStatus.Final
  ) {
    // series is definitely over
    return matchup.team1_wins > matchup.team2_wins
      ? matchup.team1
      : matchup.team2;
  }
  // } else if (matchup.games.find((g) => g.if_necessary === "1")) {
  // the series isn't over
  return null;
};

const getGameDate = (
  game: Pick<GamesByDate, "date_played" | "schedule_time" | "timezone">,
) => new Date(isoDate(game));

export const getHtGamePreviewFinalEmbed = (
  league: HockeyTechLeague,
  game: GameSummary,
  options?: {
    brackets?: ModuleKitBrackets;
    spoilerScores?: boolean;
  },
) => {
  const utils = getExternalUtils(league);
  const embed = getHtStatusEmbed(league, game, options?.spoilerScores);

  let startDate = new Date(game.game_date_iso_8601);
  let endDate: Date | undefined;
  const offsetMatch = String(game.game_date_iso_8601).match(
    /([-+]\d{1,2}:\d{1,2})$/,
  );
  if (offsetMatch) {
    const offset = offsetMatch[1];
    const day = game.meta.date_played;
    if (game.meta.start_time) {
      startDate = new Date(`${day}T${game.meta.start_time}${offset}`);
    }
    if (game.meta.end_time) {
      endDate = new Date(`${day}T${game.meta.end_time}${offset}`);
    }
  }

  const description = [
    `🏒 ${time(startDate, "t")}${endDate ? ` - ${time(endDate, "t")}` : ""}`,
    `🏟️ ${game.venue}`,
  ].join("\n");

  if (options?.brackets) {
    const { brackets } = options;
    let round: BracketRound | undefined;
    let matchup: RoundMatchup | undefined;
    let gameNumber: number | undefined;
    for (const bracketRound of brackets.rounds) {
      for (const roundMatchup of bracketRound.matchups) {
        let i = -1;
        for (const matchupGame of roundMatchup.games) {
          i += 1;
          if (matchupGame.game_id === game.meta.id) {
            round = bracketRound;
            matchup = roundMatchup;
            gameNumber = i + 1;
            break;
          }
        }
      }
    }

    if (round && matchup && gameNumber !== undefined) {
      const team1 = brackets.teams[matchup.team1];
      const team2 = brackets.teams[matchup.team2];
      const score = `${matchup.team1_wins}-${matchup.team2_wins}`;

      const winnerId = getSeriesWinner(matchup);
      const winner = winnerId ? brackets.teams[winnerId] : undefined;
      const winnerTeam = winnerId
        ? matchup.team1 === winnerId
          ? "team1"
          : "team2"
        : null;

      const seriesText =
        winnerId === null
          ? matchup.team1_wins > matchup.team2_wins
            ? `${getTeamEmoji(league, matchup.team1)} ${
                team1?.team_code
              } leads **${score}**`
            : matchup.team2_wins > matchup.team1_wins
              ? `${getTeamEmoji(league, matchup.team2)} ${
                  team2?.team_code
                } leads **${matchup.team2_wins}-${matchup.team1_wins}**`
              : `Series is tied **${score}**`
          : `${getTeamEmoji(league, winnerId)} ${
              winner?.team_code
            } wins series **${
              // biome-ignore lint/style/noNonNullAssertion: see definition
              matchup[`${winnerTeam!}_wins`]
            }-${
              matchup[`${winnerTeam === "team1" ? "team2" : "team1"}_wins`]
            }**`;

      const fieldIndex =
        embed.fields?.findIndex((f) => f.name === "Score") ?? -1;
      return new EmbedBuilder(embed)
        .setAuthor({
          name: `${game.visitor.name} @ ${game.home.name} - Round ${round.round}, Game ${gameNumber}`,
          url: utils.gameCenter(game.meta.id),
        })
        .setDescription(description)
        .spliceFields(0, fieldIndex, {
          name: embed.fields?.[fieldIndex].name ?? "Score",
          value: (
            (embed.fields?.[fieldIndex].value ?? "") + `\n\n${seriesText}`
          ).trim(),
          inline: true,
        })
        .setFooter({
          text: `${round.round_name}\n🆔 ${league}:${game.meta.id}`,
        })
        .toJSON();
    }
  }

  return new EmbedBuilder(embed)
    .setAuthor({
      name: `Game #${game.meta.game_number} - ${game.visitor.name} @ ${game.home.name}`,
      url: utils.gameCenter(game.meta.id),
    })
    .setDescription(description)
    .setFooter({
      text: `🆔 ${league}:${game.meta.id}`,
    })
    .toJSON();
};

const htPlayerName = (
  player: Pick<
    PlayerInfo,
    "jersey_number" | "first_name" | "last_name" | "player_id"
  >,
  utils: ExternalUtils,
  opts?: {
    noNumber?: boolean;
    noFirstName?: boolean;
    noLastName?: boolean;
  },
) => {
  let str = "";
  if (!opts?.noNumber) str += `#${player.jersey_number}`;
  str += " [";
  if (!opts?.noFirstName) str += `${player.first_name} `;
  if (!opts?.noLastName) str += player.last_name;
  str = str.trim();
  str += `](${utils.player(player.player_id)})`;
  return str;
};

export const getHtGoalEmbed = (
  league: HockeyTechLeague,
  game: GameSummary,
  goalPlays: GamePlayByPlayEventGoal[],
  goal: GamePlayByPlayEventGoal,
) => {
  const qualifier =
    goal.empty_net === "1"
      ? "empty net"
      : goal.short_handed === "1"
        ? "shorthanded"
        : goal.power_play === "1"
          ? "power play"
          : "even strength";

  // We calculate goals like this in order to compensate for past goals
  // (not the most recent one) that we have not previously sent.
  const goals = goalPlays.slice(0, goalPlays.indexOf(goal) + 1);
  const goalTeam = goal.home === "1" ? game.home : game.visitor;
  const period = game.periods[Number(goal.period_id) as 1 | 2 | 3];
  const utils = getExternalUtils(league);
  return new EmbedBuilder()
    .setAuthor({
      name: `🚨 ${goalTeam.name} ${qualifier} goal 🚨`,
      url: utils.gameCenter(game.meta.id),
      iconURL: getHtTeamLogoUrl(league, goalTeam.id),
    })
    .setThumbnail(
      goal.goal_scorer
        ? htPlayerImageUrl(league, goal.goal_scorer.player_id)
        : getHtTeamLogoUrl(league, goalTeam.id),
    )
    .setColor(getTeamColor(league, goalTeam.id))
    .setDescription(
      [
        `${
          goal.goal_scorer
            ? `**${htPlayerName(goal.goal_scorer, utils)} (${
                goal.scorer_goal_num
              })**`
            : ""
        }`,
        `Assists: ${
          goal.assist1_player?.player_id
            ? `${htPlayerName(goal.assist1_player, utils)}${
                goal.assist2_player?.player_id
                  ? `, ${htPlayerName(goal.assist2_player, utils)}`
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
        value: `${getTeamEmoji(league, game.visitor.id)} ${
          game.visitor.code
        } **${goals.filter((g) => g.team_id === game.visitor.id).length}** (${
          game.totalShots.visitor
        } shots)\n${getTeamEmoji(league, game.home.id)} ${game.home.code} **${
          goals.filter((g) => g.team_id === game.home.id).length
        }** (${game.totalShots.home} shots)`,
        inline: true,
      },
      {
        name: "Period",
        value: `${toHMS(Number(period.length) - goal.s)} left in the ${
          ensurePeriodName(period.id, period.long_name).name
        } period`,
        inline: true,
      },
    )
    .setFooter({
      text: `${game.visitor.code} @ ${game.home.code} - Game #${game.meta.game_number}`,
    })
    .toJSON();
};

export enum PenaltyOffence {
  Boarding = "3",
  CrossChecking = "8",
  DelayOfGame = "9",
  Elbowing = "10",
  HighSticking = "15",
  Holding = "16",
  HoldingTheStick = "17",
  Hooking = "18",
  Interference = "22",
  GoalieInterference = "23",
  Kneeing = "24",
  Roughing = "30",
  Slashing = "31",
  TooManyPlayers = "34",
  Tripping = "35",
  UnsportsmanlikeConduct = "37",
  CheckFromBehind = "51",
  GameMisconduct = "73",
  ObInterference = "82",
  ObTripping = "83",
  HeadChecking = "92",
  BodyChecking = "94",
}

export const offenceSignalImages: Partial<Record<PenaltyOffence, string>> = {
  [PenaltyOffence.Boarding]: "boarding.png",
  // [PenaltyOffence.ButtEnding]: "butt-ending.png",
  // [PenaltyOffence.Charging]: "charging.png",
  [PenaltyOffence.DelayOfGame]: "delaying-the-game.png",
  [PenaltyOffence.HeadChecking]: "illegal-check-to-head.png",
  [PenaltyOffence.CrossChecking]: "cross-checking.png",
  // [PenaltyOffence.BodyChecking]: "",
  [PenaltyOffence.CheckFromBehind]: "checking-from-behind.png",
  [PenaltyOffence.HighSticking]: "high-sticking.png",
  [PenaltyOffence.Holding]: "holding.png",
  // [PenaltyOffence.HoldingTheStick]: "Holding-stick.jpg",
  [PenaltyOffence.Hooking]: "hooking.png",
  // Not actually sure what "Ob-Interference" is
  [PenaltyOffence.ObInterference]: "interference.png",
  [PenaltyOffence.Interference]: "interference.png",
  [PenaltyOffence.GoalieInterference]: "interference.png",
  [PenaltyOffence.Elbowing]: "elbowing.png",
  [PenaltyOffence.Kneeing]: "kneeing.png",
  [PenaltyOffence.GameMisconduct]: "misconduct.png",
  [PenaltyOffence.Roughing]: "roughing.png",
  [PenaltyOffence.Slashing]: "slashing.png",
  // [PenaltyOffence.Spearing]: "spearing.png",
  [PenaltyOffence.ObTripping]: "tripping.png",
  [PenaltyOffence.Tripping]: "tripping.png",
  [PenaltyOffence.UnsportsmanlikeConduct]: "unsportsmanlike-conduct.png",
};

export const getHtPenaltyEmbed = (
  league: HockeyTechLeague,
  game: GameSummary,
  penalty: GamePlayByPlayEventPenalty,
) => {
  const team = penalty.home === "1" ? game.home : game.visitor;
  const otherTeam = penalty.home === "1" ? game.visitor : game.home;
  const period = game.periods[Number(penalty.period_id) as 1 | 2 | 3];
  const utils = getExternalUtils(league);
  const offenceImage = offenceSignalImages[penalty.offence as PenaltyOffence];
  return new EmbedBuilder()
    .setAuthor({
      name: `💢 ${team.name} ${penalty.penalty_class.toLowerCase()} penalty${
        penalty.penalty_shot === "1" ? " (penalty shot)" : ""
      } (${penalty.minutes_formatted}) 💢`,
      url: utils.gameCenter(game.meta.id),
      iconURL: htPlayerImageUrl(
        league,
        penalty.player_penalized_info.player_id,
      ),
    })
    .setThumbnail(
      offenceImage ? `https://puckway.shay.cat/signals/${offenceImage}` : null,
    )
    .setColor(getTeamColor(league, team.id))
    .setDescription(
      [
        penalty.player_penalized_info?.player_id === undefined
          ? `**${penalty.lang_penalty_description}**`
          : `**${htPlayerName(penalty.player_penalized_info, utils)} (${
              penalty.lang_penalty_description
            })**`,
        penalty.player_penalized_info.player_id !==
        penalty.player_served_info.player_id
          ? `Served by ${htPlayerName(penalty.player_served_info, utils)}`
          : "",
      ].join("\n"),
    )
    .addFields(
      {
        name: "Penalty Minutes",
        value: `${getTeamEmoji(league, team.id)} ${team.code} **${
          game.pimTotal[penalty.home === "1" ? "visitor" : "home"]
        }m**`,
        inline: true,
      },
      {
        name: "Power Play",
        value: `${getTeamEmoji(league, otherTeam.id)} ${
          otherTeam.code
        } ${pctStat(
          game.powerPlayGoals[penalty.home === "1" ? "visitor" : "home"],
          game.powerPlayCount[penalty.home === "1" ? "visitor" : "home"],
        )}`,
        inline: true,
      },
      {
        name: "Period",
        value: `${toHMS(
          Number(period?.length ?? 1200) - penalty.s,
        )} left in the ${penalty.period} period`,
        inline: true,
      },
    )
    .setFooter({
      text: `${game.visitor.code} @ ${game.home.code} - Game #${
        game.meta.game_number
      }${
        offenceImage
          ? "\nReferee signal image from the PWHL rulebook (Jan. 2024, #29)"
          : ""
      }`,
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
  league: HockeyTechLeague,
  game: GameSummary,
  spoilerScores = false,
) => {
  const bar = spoilerScores ? "||" : "";
  const status = game.meta.status;
  const mvps = game.mvps[0] !== null ? game.mvps : undefined;
  // const period =
  //   game.periods[
  //     Number(Object.keys(game.periods)[Object.keys(game.periods).length - 1]) as
  //       | 1
  //       | 2
  //       | 3
  //   ];
  const awayStats = [
    `${getTeamEmoji(league, game.visitor.id)} ${game.visitor.nickname}`,
    `PP: ${pctStat(game.powerPlayGoals.visitor, game.powerPlayCount.visitor)}`,
    `PIM: **${game.pimTotal.visitor}**`,
    `FO: ${pctStat(
      game.totalFaceoffs.visitor.won,
      game.totalFaceoffs.visitor.att,
    )}`,
  ].join("\n");
  const homeStats = [
    `${getTeamEmoji(league, game.home.id)} ${game.home.nickname}`,
    `PP: ${pctStat(game.powerPlayGoals.home, game.powerPlayCount.home)}`,
    `PIM: **${game.pimTotal.home}**`,
    `FO: ${pctStat(game.totalFaceoffs.home.won, game.totalFaceoffs.home.att)}`,
  ].join("\n");
  const utils = getExternalUtils(league);

  return new EmbedBuilder()
    .setAuthor({
      name: `${game.visitor.name} @ ${game.home.name}${
        status === GameStatus.UnofficialFinal
          ? " Unofficial Final"
          : status === GameStatus.Final
            ? " Final"
            : ""
      }`,
      url: utils.gameCenter(game.meta.id),
    })
    .setThumbnail(getHtTeamLogoUrl(league, game.home.id))
    .setColor(getTeamColor(league, game.home.id))
    .addFields(
      {
        name: "Score",
        value: `${getTeamEmoji(league, game.visitor.id)} ${
          game.visitor.code
        } ${bar}**${game.totalGoals.visitor}** (${
          game.totalShots.visitor
        } shots)${bar}\n${getTeamEmoji(league, game.home.id)} ${
          game.home.code
        } ${bar}**${game.totalGoals.home}** (${
          game.totalShots.home
        } shots)${bar}`,
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
                  `${getTeamEmoji(
                    league,
                    player.home ? game.home.id : game.visitor.id,
                  )} ${Array(i + 1)
                    .fill(":star:")
                    .join("")} [${player.first_name} ${
                    player.last_name
                  }](${utils.player(player.player_id)})`,
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
          ? "This is an unofficial final. Some details may change before the final."
          : "",
      ]
        .join("\n")
        .trim(),
    })
    .toJSON();
};

export const getHtGoalsEmbed = (
  league: HockeyTechLeague,
  game: GameSummary,
) => {
  const utils = getExternalUtils(league);
  return new EmbedBuilder()
    .setAuthor({
      name: "Goals",
    })
    .setColor(getTeamColor(league, game.home.id))
    .addFields(
      Object.values(game.periods)
        .map((period: Period) => {
          const goals = game.goals.filter((g) => g.period_id === period.id);
          return {
            name: `${
              ensurePeriodName(period.id, period.long_name).name
            } Period`,
            value:
              goals.length === 0
                ? "No goals"
                : goals
                    .map((goal) => {
                      const team = goal.home === "1" ? game.home : game.visitor;
                      return `${getTeamEmoji(league, team.id)} ${htPlayerName(
                        goal.goal_scorer,
                        utils,
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

export const getPlayStats = (plays: Play[]) => {
  const goals = plays.filter(
    (p) => p.event === GamePlayByPlayEvent.Goal,
  ) as GamePlayByPlayEventGoal[];
  const shots = plays.filter(
    (p) => p.event === GamePlayByPlayEvent.Shot,
  ) as GamePlayByPlayEventShot[];
  const hits = plays.filter(
    (p) => p.event === GamePlayByPlayEvent.Hit,
  ) as GamePlayByPlayEventHit[];
  const faceoffs = plays.filter(
    (p) => p.event === GamePlayByPlayEvent.Faceoff,
  ) as GamePlayByPlayEventFaceoff[];
  const penalties = plays.filter(
    (p) => p.event === GamePlayByPlayEvent.Penalty,
  ) as GamePlayByPlayEventPenalty[];

  return {
    goals: {
      home: {
        total: goals.filter((p) => p.home === "1").length,
        pp: goals.filter((p) => p.home === "1" && p.power_play === "1").length,
        shorthanded: goals.filter(
          (p) => p.home === "1" && p.short_handed === "1",
        ).length,
      },
      visitor: {
        total: goals.filter((p) => p.home === "0").length,
        pp: goals.filter((p) => p.home === "0" && p.power_play === "1").length,
        shorthanded: goals.filter(
          (p) => p.home === "0" && p.short_handed === "1",
        ).length,
      },
    },
    shots: {
      home: shots.filter((p) => p.home === "1").length,
      visitor: shots.filter((p) => p.home === "0").length,
    },
    hits: {
      home: hits.filter((p) => p.home === "1").length,
      visitor: hits.filter((p) => p.home === "0").length,
    },
    faceoffs: {
      home: {
        won: faceoffs.filter((p) => p.home_win === "1").length,
        attempted: faceoffs.length,
      },
      visitor: {
        won: faceoffs.filter((p) => p.home_win === "0").length,
        attempted: faceoffs.length,
      },
    },
    penalties: {
      home: {
        total: penalties.filter((p) => p.home === "1").length,
        pim: penalties
          .filter((p) => p.home === "1")
          .reduce((l, c) => Number(c.minutes) + l, 0),
      },
      visitor: {
        total: penalties.filter((p) => p.home === "0").length,
        pim: penalties
          .filter((p) => p.home === "0")
          .reduce((l, c) => Number(c.minutes) + l, 0),
      },
    },
  };
};

export const getHtPeriodStatusEmbed = (
  league: HockeyTechLeague,
  game: GamesByDate,
  plays: Play[],
) => {
  const utils = getExternalUtils(league);
  const stats = getPlayStats(plays);

  const visitorEmoji = getTeamEmoji(league, game.visiting_team);
  const homeEmoji = getTeamEmoji(league, game.home_team);
  const awayStats = [
    `${visitorEmoji} ${game.visiting_team_nickname}`,
    `PP: ${pctStat(stats.goals.visitor.pp, stats.penalties.home.total)}`,
    `PIM: **${stats.penalties.visitor.pim}**`,
    `FO: ${pctStat(
      stats.faceoffs.visitor.won,
      stats.faceoffs.visitor.attempted,
    )}`,
  ].join("\n");
  const homeStats = [
    `${homeEmoji} ${game.home_team_nickname}`,
    `PP: ${pctStat(stats.goals.home.pp, stats.penalties.visitor.total)}`,
    `PIM: **${stats.penalties.home.pim}**`,
    `FO: ${pctStat(stats.faceoffs.home.won, stats.faceoffs.home.attempted)}`,
  ].join("\n");

  let visitorGoalieChange: GamePlayByPlayEventGoalieChange | undefined;
  let homeGoalieChange: GamePlayByPlayEventGoalieChange | undefined;
  for (const play of plays) {
    if (play.event === GamePlayByPlayEvent.GoalieChange) {
      if (play.team_id === game.visiting_team) {
        visitorGoalieChange = play;
      } else {
        homeGoalieChange = play;
      }
    }
  }

  return new EmbedBuilder()
    .setAuthor({
      name: `${game.visiting_team_name} @ ${game.home_team_name}`,
      url: utils.gameCenter(game.id),
    })
    .setThumbnail(getHtTeamLogoUrl(league, game.home_team))
    .setColor(getTeamColor(league, game.home_team))
    .addFields(
      {
        name: "Score",
        value: [
          `${visitorEmoji} ${game.visiting_team_code} **${stats.goals.visitor.total}** (${stats.shots.visitor} shots)`,
          `${homeEmoji} ${game.home_team_code} **${stats.goals.home.total}** (${stats.shots.home} shots)`,
        ].join("\n"),
        inline: true,
      },
      {
        name: "Stats",
        value:
          awayStats +
          (visitorGoalieChange || homeGoalieChange ? `\n\n${homeStats}` : ""),
        inline: true,
      },
      visitorGoalieChange || homeGoalieChange
        ? {
            name: "Goalies",
            value: [
              `${visitorEmoji} ${
                visitorGoalieChange
                  ? visitorGoalieChange.goalie_out_info
                    ? `Empty net (was ${htPlayerName(
                        visitorGoalieChange.goalie_out_info,
                        utils,
                      )})`
                    : htPlayerName(visitorGoalieChange.goalie_in_info, utils)
                  : "No info"
              }`,
              `${homeEmoji} ${
                homeGoalieChange
                  ? homeGoalieChange.goalie_out_info
                    ? `Empty net (was ${htPlayerName(
                        homeGoalieChange.goalie_out_info,
                        utils,
                      )})`
                    : htPlayerName(homeGoalieChange.goalie_in_info, utils)
                  : "No info"
              }`,
            ].join("\n"),
            inline: true,
          }
        : {
            name: "_ _",
            value: homeStats,
            inline: true,
          },
    )
    .setFooter({
      text: `${game.visiting_team_code} @ ${game.home_team_code} - Game #${game.game_number}\n🆔 ${league}:${game.id}`,
    })
    .toJSON();
};

export const getHtLineupEmbed = (
  league: HockeyTechLeague,
  game: GameSummary,
) => {
  const awayPlayers = game.visitor_team_lineup.players ?? [];
  const homePlayers = game.home_team_lineup.players ?? [];
  const lines = {
    visitor: {
      // F, C, LW, RW
      f: awayPlayers.filter((p) => ["8", "4", "3", "2"].includes(p.position)),
      // D, LD, RD
      d: awayPlayers.filter((p) => ["1", "5", "6"].includes(p.position)),
      g: game.visitor_team_lineup.goalies ?? [],
    },
    home: {
      f: homePlayers.filter((p) => ["8", "4", "3", "2"].includes(p.position)),
      d: homePlayers.filter((p) => ["1", "5", "6"].includes(p.position)),
      g: game.home_team_lineup.goalies ?? [],
    },
  };
  const utils = getExternalUtils(league);

  return new EmbedBuilder()
    .setAuthor({
      name: `${game.visitor.name} @ ${game.home.name} - Game Roster`,
      url: utils.gameCenter(game.meta.id),
    })
    .setColor(getTeamColor(league, game.home.id))
    .addFields(
      {
        name: `${getTeamEmoji(league, game.visitor.id)} ${
          game.visitor.nickname
        }\nForwards`,
        value:
          lines.visitor.f
            .map(
              (player) =>
                `#${player.jersey_number} ${player.last_name}${
                  player.position !== "8" ? ` (${player.position_str})` : ""
                }`,
            )
            .join("\n")
            .slice(0, 1024) || "_ _",
        inline: true,
      },
      {
        name: "_ _\nDefense",
        value:
          lines.visitor.d
            .map(
              (player) =>
                `#${player.jersey_number} ${player.last_name}${
                  player.position === "5"
                    ? " (L)"
                    : player.position === "6"
                      ? " (R)"
                      : ""
                }`,
            )
            .join("\n")
            .slice(0, 1024) || "_ _",
        inline: true,
      },
      {
        name: "_ _\nGoalie",
        value:
          lines.visitor.g
            .map((player) => `#${player.jersey_number} ${player.last_name}`)
            .join("\n")
            .slice(0, 1024) || "_ _",
        inline: true,
      },
      {
        name: `${getTeamEmoji(league, game.home.id)} ${
          game.home.nickname
        }\nForwards`,
        value:
          lines.home.f
            .map(
              (player) =>
                `#${player.jersey_number} ${player.last_name}${
                  player.position !== "8" ? ` (${player.position_str})` : ""
                }`,
            )
            .join("\n")
            .slice(0, 1024) || "_ _",
        inline: true,
      },
      {
        name: "_ _\nDefense",
        value:
          lines.home.d
            .map(
              (player) =>
                `#${player.jersey_number} ${player.last_name}${
                  player.position === "5"
                    ? " (L)"
                    : player.position === "6"
                      ? " (R)"
                      : ""
                }`,
            )
            .join("\n")
            .slice(0, 1024) || "_ _",
        inline: true,
      },
      {
        name: "_ _\nGoalie",
        value:
          lines.home.g
            .map((player) => `#${player.jersey_number} ${player.last_name}`)
            .join("\n")
            .slice(0, 1024) || "_ _",
        inline: true,
      },
    )
    .setFooter({
      text: `${game.visitor.code} @ ${game.home.code} - Game #${game.meta.game_number}\nPlayers are sorted by number. Actual line position is not shown.`,
    })
    .toJSON();
};

interface ChannelMirrorInnerConfig {
  key: keyof NotificationSendConfig;
  channelId: string;
  contentTemplate?: string;
}

const filterConfigChannels = (
  configs: [string, { send: NotificationSendConfig }][],
  filter: (config: NotificationSendConfig) => unknown,
) =>
  configs
    // Filter by config value
    .filter(([_, c]) => filter(c.send))
    // Get channel ID
    .map((c) => c[0])
    // No duplicates
    .filter((id, i, a) => a.indexOf(id) === i);

const filterMirrorChannels = (
  channelId: string,
  configs: [
    string,
    {
      send: NotificationSendConfig;
      mirrors: ChannelMirrorInnerConfig[];
    },
  ][],
  key:
    | keyof NotificationSendConfig
    | ((config: NotificationSendConfig) => unknown),
): ChannelMirrorInnerConfig[] =>
  configs
    .filter(
      ([id, c]) =>
        (typeof key === "string" ? c.send[key] : key(c.send)) &&
        id === channelId,
    )
    .flatMap((c) => c[1].mirrors)
    .filter((c) => c.key === key);

export const periodNameFromId = (id: string) => {
  if (Number.isNaN(Number(id))) {
    throw Error(`Invalid period ID "${id}"`);
  }
  switch (id) {
    case "1":
      return "1st";
    case "2":
      return "2nd";
    case "3":
      return "3rd";
    default: {
      const n = Number(id) - 3;
      switch (String(n).slice(-1)) {
        case "11":
        case "12":
        case "13":
          return `${n}th OT`;
        case "1":
          return `${n}st OT`;
        case "2":
          return `${n}nd OT`;
        case "3":
          return `${n}rd OT`;
        default:
          return `${n}th OT`;
      }
    }
  }
};

export enum ExtraPXPEvent {
  PeriodStart = "period_start",
  PeriodEnd = "period_end",
}

export type ExtendedGamePlayByPlayEventBase = Omit<
  GamePlayByPlayEventBase,
  "event"
> & {
  event: GamePlayByPlayEvent | ExtraPXPEvent;
};

export interface GamePlayByPlayEventPeriodStart
  extends ExtendedGamePlayByPlayEventBase {
  event: ExtraPXPEvent.PeriodStart;
  id: string;
  period_id: string;
  period_name: string;
}

export interface GamePlayByPlayEventPeriodEnd
  extends ExtendedGamePlayByPlayEventBase {
  event: ExtraPXPEvent.PeriodEnd;
  id: string;
  period_id: string;
  period_name: string;
}

export const ensurePeriodName = (
  periodId: string,
  periodName?: string,
): { id: string; name: string } => {
  let name = periodName;
  // inexplicably french
  if (periodName?.includes("è") || periodName?.startsWith("PROL")) {
    name = periodNameFromId(periodId);
  }
  return { id: periodId, name: name ?? periodNameFromId(periodId) };
};

/*
  This is technically susceptible to a condition where a period is omitted
  because nothing happened during it. I think this is unlikely because faceoffs
  are essentially guaranteed, and surely there won't be non-stop play for 20 minutes,
  so I'm not worrying about it for now, but it is worth noting just in case.
*/
export const getPlaysWithPeriods = (
  pxp: GCGamePlayByPlay["Pxpverbose"],
  status?: GameStatus,
): (
  | GCGamePlayByPlay["Pxpverbose"][number]
  | GamePlayByPlayEventPeriodStart
  | GamePlayByPlayEventPeriodEnd
)[] => {
  const periods = pxp
    .map((p) =>
      "period_id" in p
        ? ensurePeriodName(
            p.period_id,
            "period_long_name" in p
              ? p.period_long_name
              : "period" in p
                ? p.period
                : undefined,
          )
        : "period" in p
          ? ensurePeriodName(p.period)
          : // This case shouldn't happen assuming we have typed every
            // event, which we might not have
            undefined,
    )
    .filter(
      // Deduplicate and assure there are no `undefined` periods
      (p, i, a) => p && a.indexOf(a.find((p_) => p_ && p_.id === p.id)) === i,
    ) as { id: string; name: string }[];

  if (periods.length === 0) return pxp;

  const periodPlays: (
    | GamePlayByPlayEventPeriodStart
    | GamePlayByPlayEventPeriodEnd
  )[] = periods.map(
    (period) =>
      ({
        event: ExtraPXPEvent.PeriodStart,
        id: `period_start:${period.id}`,
        period_id: period.id,
        period_name: ensurePeriodName(period.id, period.name).name,
        time: "0:00",
        s: 0,
      }) satisfies GamePlayByPlayEventPeriodStart,
  );

  if (
    status &&
    [GameStatus.UnofficialFinal, GameStatus.Final].includes(status)
  ) {
    const period = periods.slice(-1)[0];
    const lastPlay = pxp.slice(-1)[0];
    periodPlays.push({
      event: ExtraPXPEvent.PeriodEnd,
      id: `period_end:${period.id}`,
      period_id: period.id,
      period_name: ensurePeriodName(period.id, period.name).name,
      time: "20:00",
      // Overtime period ends as soon as the final goal is scored
      s: Number(period) > 3 ? lastPlay.s : 1200,
    } satisfies GamePlayByPlayEventPeriodEnd);
  }

  // Add endpoints for all periods that we know have ended, because the next
  // one has started already. For obvious reasons, this method can't be used
  // for notifications. I think this could be accomplished if we also passed
  // current game period and calculated past periods using that instead, but
  // that's not too important right now.
  // ---
  // This wasn't working like I wanted so it's ditched for now

  // let i = -1;
  // for (const period of periods) {
  //   i += 1;
  //   const next = periods[i + 1];
  //   if (next) {
  //     periodPlays.push({
  //       event: ExtraPXPEvent.PeriodEnd,
  //       id: `period_end:${period.id}`,
  //       period_id: period.id,
  //       period_name: ensurePeriodName(period.id, period.name).name,
  //       time: "20:00",
  //       s: 1200,
  //     } as GamePlayByPlayEventPeriodEnd);
  //   }
  // }

  // Sort by "absolute time" - number of play seconds since the start of the game
  // where a period is 20 minutes long (1200 seconds)
  const plays = [...pxp, ...periodPlays].sort((a, b) => {
    const getPeriodId = (x: typeof a) =>
      Number("period_id" in x ? x.period_id : "period" in x ? x.period : "0");

    // Periods do not have the exclusive privilege of having constant `s` values;
    // so too do the goalie lineups and the initial faceoff. We sort as follows:
    // - `goalie_change` and `period_end` (before play begins)
    // - `period_start`
    // - `faceoff` (and everything else)
    const getWeight = (x: typeof a) =>
      (x.event === GamePlayByPlayEvent.GoalieChange && x.s === 0) ||
      x.event === ExtraPXPEvent.PeriodEnd
        ? -1
        : x.event === ExtraPXPEvent.PeriodStart
          ? 1
          : 2;

    return (
      (getPeriodId(a) - 1) * 1200 +
      a.s +
      getWeight(a) -
      ((getPeriodId(b) - 1) * 1200 + b.s + getWeight(b))
    );
  });

  return plays;
};

type Play = ReturnType<typeof getPlaysWithPeriods>[number];

export const getPlayId = (play: Play, index: number): string => {
  // I can't trust event IDs to be unique outside of their scope
  switch (play.event) {
    case GamePlayByPlayEvent.GoalieChange:
      return `${play.event}:${play.goalie_in_id}:${play.period_id}:${play.s}`;
    case GamePlayByPlayEvent.Faceoff:
      // faceoff.id seems to just be a mirror of the period ID
      return `${play.event}:${play.id}:${play.s}`;
    case ExtraPXPEvent.PeriodStart:
    case ExtraPXPEvent.PeriodEnd:
      // These are already hardcoded to this format
      return play.id;
    default:
      return "id" in play
        ? `${play.event}:${play.id}`
        : `${(play as GamePlayByPlayEventBase).event}:${index}`;
  }
};

/**
 * @param configs all mirror configurations to send to
 * @param defaultBody if there is no config.contentTemplate
 * @param mirrorData template data passed to pope()
 * @returns map of mirror channel ID to APIMessage
 */
const sendMirrorMessages = async (
  rest: REST,
  configs: ChannelMirrorInnerConfig[],
  defaultBody: RESTPostAPIChannelMessageJSONBody,
  mirrorData?: Record<string, unknown>,
): Promise<Record<string, APIMessage>> => {
  const messages: Record<string, APIMessage> = {};
  const failedChannelIds: string[] = [];
  for (const config of configs) {
    if (failedChannelIds.includes(config.channelId)) continue;

    let mirrorBody = defaultBody;
    if (config.contentTemplate) {
      mirrorBody = {
        content: pope(config.contentTemplate, mirrorData ?? {}, {
          skipUndefined: true,
        }),
      };
    }
    try {
      const message = (await rest.post(
        Routes.channelMessages(config.channelId),
        { body: mirrorBody },
      )) as APIMessage;
      messages[config.channelId] = message;
    } catch (e) {
      failedChannelIds.push(config.channelId);
      console.error(`Failed to post mirror to ${config.channelId}:`, e);
    }
  }
  return messages;
};

const sendMessageWithMirrors = async (
  channelId: string,
  configs: ChannelMirrorInnerConfig[],
  rest: REST,
  body: RESTPostAPIChannelMessageJSONBody,
  mirrorData?: Record<string, unknown>,
): Promise<APIMessage> => {
  const message = (await rest.post(Routes.channelMessages(channelId), {
    body,
  })) as APIMessage;
  await sendMirrorMessages(rest, configs, body, mirrorData);
  return message;
};

const getPopeData = ({
  league,
  game,
  channelId,
}: { league: League; game: GamesByDate; channelId: string }) => {
  const utils = getExternalUtils(league);
  return {
    channel_id: channelId,
    game: {
      ...game,
      matchup: `${game.visiting_team_city} ${game.visiting_team_nickname} @ ${game.home_team_city} ${game.home_team_nickname}`,
      matchup_emojis: `${getTeamEmoji(league, game.visiting_team)} ${
        game.visiting_team_city
      } ${game.visiting_team_nickname} @ ${getTeamEmoji(
        league,
        game.home_team,
      )} ${game.home_team_city} ${game.home_team_nickname}`,
      home_name: `${game.home_team_city} ${game.home_team_nickname}`,
      home_emoji: getTeamEmoji(league, game.home_team),
      away_name: `${game.visiting_team_city} ${game.visiting_team_nickname}`,
      away_emoji: getTeamEmoji(league, game.visiting_team),
      start_timestamp: Math.floor(getGameDate(game).getTime() / 1000),
    },
    links: {
      gamecenter: utils.gameCenter(game.id),
      standings: utils.standings(),
    },
  };
};

const getThreadMirrorBody = (
  thread: APIThreadChannel,
  popeData: Record<string, unknown>,
): RESTPostAPIChannelMessageJSONBody => ({
  flags: MessageFlags.IsComponentsV2,
  components: [
    new TextDisplayBuilder().setContent(
      pope(
        "**{{game.away_emoji}} {{game.away_name}}** @ **{{game.home_emoji}} {{game.home_name}}** starts <t:{{game.start_timestamp}}:R>!",
        popeData,
        { skipUndefined: true },
      ),
    ),
    new ContainerBuilder().addSectionComponents((s) =>
      s
        .addTextDisplayComponents((td) => td.setContent(`**${thread.name}**`))
        .addTextDisplayComponents((td) =>
          td.setContent(`-# Thread in <#${thread.parent_id}>`),
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel("Open Thread")
            .setURL(
              channelLink(
                thread.id,
                // biome-ignore lint/style/noNonNullAssertion: N/A
                thread.guild_id!,
              ),
            ),
        ),
    ),
  ].map((x) => x.toJSON()),
});

interface RoundMatchup {
  series_letter: string;
  series_name: string;
  /** Can be empty */
  series_logo: string;
  round: string;
  active: NumericBoolean;
  /** N/A if first round, `series_letter` of `team1`'s previous series otherwise */
  feeder_series1: string;
  /** N/A if first round, `series_letter` of `team2`'s previous series otherwise */
  feeder_series2: string;
  /** Team ID - 0 if contestants not yet known */
  team1: string;
  /** Team ID - 0 if contestants not yet known */
  team2: string;
  content_en: string;
  content_fr: string;
  /** @deprecated empty string */
  winner: string;
  games: {
    game_id: string;
    /** Team ID */
    home_team: string;
    home_goal_count: string;
    /** Team ID */
    visiting_team: string;
    visiting_goal_count: string;
    status: GameStatus;
    game_status: string;
    date_time: string;
    if_necessary: NumericBoolean;
    game_notes: string;
  }[];
  team1_wins: number;
  team2_wins: number;
  ties: number;
}

interface BracketRound {
  round: string;
  round_name: string;
  season_id: string;
  round_type_id: string;
  round_type_name: string;
  matchups: RoundMatchup[];
}

interface ModuleKitBrackets {
  teams: Record<
    string,
    Pick<
      TeamsBySeason,
      "id" | "city" | "name" | "division_long_name" | "division_short_name"
    > & {
      team_code: string;
      conf_id: string;
      logo: string;
    }
  >;
  rounds: BracketRound[];
  /** Can be empty, usually a .jpg? */
  logo: string;
  show_ties: boolean;
}

export const getPlayoffBrackets = async (
  client: HockeyTech,
  seasonId: number | "latest",
): Promise<ModuleKitBrackets> => {
  // @ts-expect-error not typed but it exists
  const config = client._getModulekitConfig("brackets");
  config.params.season_id = String(seasonId);
  // @ts-expect-error
  const url = client._getEndpoint(client._modulekitBaseUrl, config);

  const response = await fetch(url, { method: "GET" });
  const data = (await response.json()) as {
    SiteKit: { Brackets: ModuleKitBrackets };
  };
  return data.SiteKit.Brackets;
};

const runNotifications = async ({
  rest,
  env,
  ctx,
  league,
  now,
  day,
  channelIds,
  pickemsPollMessageIds,
}: {
  rest: REST;
  env: Env;
  ctx: Pick<DurableObjectState, "waitUntil">;
  league: League;
  now: Date;
  day: string;
  channelIds: Record<
    string,
    Record<
      string,
      {
        send: NotificationSendConfig;
        mirrors: ChannelMirrorInnerConfig[];
      }
    >
  >;
  pickemsPollMessageIds: Record<
    string,
    { channelId: string; messageId: string }[]
  >;
}): Promise<Date | null> => {
  const nextAlarms: Date[] = [];
  switch (league) {
    case "ahl":
    case "pwhl": {
      const client = getHtClient(env, league);
      const games = (await client.getDailySchedule(day)).SiteKit.Gamesbydate;

      for (const game of games) {
        let nextAlarm: Date | null = new Date(now.getTime() + 180_000);
        const start = getGameDate(game);
        // Don't send anything more than 6 hours in advance
        const timeUntilStart = start.getTime() - now.getTime();
        if (timeUntilStart > 3_600_000 * 6) {
          // 6 hours before start
          nextAlarm = new Date(start.getTime() - 3_600_000 * 6);
          nextAlarms.push(nextAlarm);
          continue;
        } else if (timeUntilStart > 3_600_000) {
          // 65 minutes before start (lineups)
          nextAlarm = new Date(start.getTime() - 3_600_000);
        }

        interface EventData {
          postedPreview?: boolean;
          postedLineups?: boolean;
          postedPbpEventIds?: string[];
        }

        const kvKey = `${league}-${game.id}-eventData`;
        const kvData = await env.KV.get<EventData>(kvKey, "json");

        const channelConfigs = [
          ...Object.entries(channelIds[game.home_team] ?? {}),
          ...Object.entries(channelIds[game.visiting_team] ?? {}),
        ];

        let postedPreview = kvData?.postedPreview ?? false;
        let postedLineups = kvData?.postedLineups ?? false;
        if (game.status === GameStatus.NotStarted) {
          if (!kvData?.postedPreview) {
            const previewChannelIds = filterConfigChannels(
              channelConfigs,
              (c) => c.preview,
            );
            const threadChannelIds = filterConfigChannels(
              channelConfigs,
              (c) => c.threads,
            );
            let standings: HockeyTechTeamStanding[] | undefined;
            let brackets: ModuleKitBrackets | undefined;
            if (game.playoff === "1") {
              // Show relevant series info for playoffs
              brackets = await getPlayoffBrackets(
                client,
                Number(game.season_id),
              );
            } else {
              // We don't need the standings for playoff games
              standings = (await getHtStandings(client)) ?? undefined;
            }

            for (const channelId of previewChannelIds) {
              const previewMirrors = filterMirrorChannels(
                channelId,
                channelConfigs,
                "preview",
              );
              const threadMirrors = filterMirrorChannels(
                channelId,
                channelConfigs,
                "threads",
              );
              ctx.waitUntil(
                logErrors(
                  (async () => {
                    const message = await sendMessageWithMirrors(
                      channelId,
                      previewMirrors,
                      rest,
                      {
                        embeds: [
                          getHtGamePreviewEmbed(
                            league,
                            game,
                            standings,
                            brackets,
                          ),
                        ],
                      },
                      getPopeData({ league, game, channelId }),
                    );
                    if (threadChannelIds.includes(channelId)) {
                      const thread = (await rest.post(
                        Routes.threads(channelId, message.id),
                        {
                          body: {
                            name: `${game.visiting_team_code} @ ${
                              game.home_team_code
                            } - ${getGameDate(game).toLocaleDateString(
                              undefined,
                              {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                timeZone: game.timezone,
                              },
                            )}`,
                          },
                        },
                      )) as APIThreadChannel;
                      const popeData = {
                        ...getPopeData({ league, game, channelId }),
                        thread,
                      };
                      await sendMirrorMessages(
                        rest,
                        threadMirrors,
                        getThreadMirrorBody(thread, popeData),
                        popeData,
                      );
                    }
                    return undefined;
                  })(),
                ),
              );
            }

            // if (dbGame?.lastPostedHypeMinutes !== hypeMinutes[0]) {
            //   const hypeChannels = filterConfigChannels(
            //     channelConfigs,
            //     (c) => c.hype,
            //   );
            //   if (hypeChannels.length > 0) {
            //     const minutes = Math.floor(
            //       ((start.getTime() - now.getTime()) / 1000) * 60,
            //     );
            //     const hypeMin = roundToHypeMinute(minutes);
            //     if (hypeMin) {
            //       for (const channelId of hypeChannels) {
            //         ctx.waitUntil(
            //           logErrors(
            //             rest.post(Routes.channelMessages(channelId), {
            //               body: {
            //                 content: `${game.VisitorLongName} @ ${
            //                   game.HomeLongName
            //                 } starts ${time(start, "R")}`,
            //               },
            //             }),
            //           ),
            //         );
            //       }
            //       postedHypeMinutes[String(hypeMin)] =
            //         postedHypeMinutes[String(hypeMin)] ?? [];
            //       postedHypeMinutes[String(hypeMin)].push([league, game.ID]);
            //     }
            //   }
            // }

            postedPreview = true;
          }
          if (
            // Post lineups an hour before start
            !kvData?.postedLineups &&
            timeUntilStart <= 3_600_000
          ) {
            const channelIds = filterConfigChannels(
              channelConfigs,
              (c) => c.lineups,
            );

            let hasPlayers = true;
            if (channelIds.length !== 0) {
              const summary = (await client.getGameSummary(Number(game.id))).GC
                .Gamesummary;

              if (
                summary.home_team_lineup.players &&
                summary.home_team_lineup.players.length !== 0 &&
                summary.visitor_team_lineup.players &&
                summary.visitor_team_lineup.players.length !== 0
              ) {
                for (const channelId of channelIds) {
                  ctx.waitUntil(
                    logErrors(
                      sendMessageWithMirrors(
                        channelId,
                        filterMirrorChannels(
                          channelId,
                          channelConfigs,
                          "lineups",
                        ),
                        rest,
                        { embeds: [getHtLineupEmbed(league, summary)] },
                        getPopeData({ league, game, channelId }),
                      ),
                    ),
                  );
                }
              } else {
                hasPlayers = false;
              }
            }
            postedLineups = hasPlayers;
          }

          if (
            !kvData ||
            kvData.postedPreview !== postedPreview ||
            kvData.postedLineups !== postedLineups
          ) {
            await env.KV.put(
              kvKey,
              JSON.stringify({
                ...kvData,
                postedPreview,
                postedLineups,
              } satisfies EventData),
              {
                // 3 days
                expirationTtl: 3 * 86400,
              },
            );
          }

          nextAlarms.push(nextAlarm);
          continue;
        }

        let summary: GameSummary | undefined = undefined;
        const getSummary = async () =>
          (await client.getGameSummary(Number(game.id))).GC.Gamesummary;

        const allPlays = getPlaysWithPeriods(
          (await client.getGamePlayByPlay(Number(game.id))).GC.Pxpverbose,
          game.status,
        );
        const newPlays = allPlays.filter(
          (p, i) => !kvData?.postedPbpEventIds?.includes(getPlayId(p, i)),
        );

        for (const play of newPlays) {
          switch (play.event) {
            case GamePlayByPlayEvent.Faceoff: {
              if (play.s !== 0) break;

              const period = allPlays.find(
                (p): p is GamePlayByPlayEventPeriodStart =>
                  p.event === ExtraPXPEvent.PeriodStart &&
                  p.period_id === play.period,
              );
              if (!period) break;
              // We have now confirmed that the period has started.
              // Some leagues tend to "begin" the game prematurely, so using
              // a `PeriodStart` case would result in period start messages
              // being sent as much as 20 minutes too soon.

              const channelIds = filterConfigChannels(
                channelConfigs,
                (c) => c.periods || (c.start && period.period_id === "1"),
              );
              const threadChannelIds = filterConfigChannels(
                channelConfigs,
                (c) => c.threads,
              );
              const dateString = getGameDate(game).toLocaleDateString(
                undefined,
                {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  timeZone: game.timezone,
                },
              );

              for (const channelId of channelIds) {
                ctx.waitUntil(
                  logErrors(
                    (async () => {
                      const message = (await sendMessageWithMirrors(
                        channelId,
                        filterMirrorChannels(
                          channelId,
                          channelConfigs,
                          (c) =>
                            c.periods || (c.start && period.period_id === "1"),
                        ),
                        rest,
                        {
                          content: `**${
                            ensurePeriodName(
                              period.period_id,
                              period.period_name,
                            ).name
                          } Period Starting - ${game.visiting_team_code} @ ${
                            game.home_team_code
                          }**`,
                          embeds: [
                            getHtPeriodStatusEmbed(league, game, allPlays),
                          ],
                        },
                        getPopeData({ league, game, channelId }),
                      )) as APIMessage;
                      if (
                        threadChannelIds.includes(channelId) &&
                        period.period_id === "1"
                      ) {
                        const thread = (await rest.post(
                          Routes.threads(channelId, message.id),
                          {
                            body: {
                              name: `${game.visiting_team_code} @ ${game.home_team_code} - ${dateString}`,
                            },
                          },
                        )) as APIThreadChannel;
                        const popeData = {
                          ...getPopeData({ league, game, channelId }),
                          thread,
                        };
                        await sendMirrorMessages(
                          rest,
                          filterMirrorChannels(
                            channelId,
                            channelConfigs,
                            "threads",
                          ),
                          getThreadMirrorBody(thread, popeData),
                          popeData,
                        );
                      }
                      return undefined;
                    })(),
                  ),
                );
              }

              if (period.period_id === "1") {
                for (const channelId of threadChannelIds.filter(
                  // Assume threads for the other configs have already been created
                  (id) =>
                    !filterConfigChannels(
                      channelConfigs,
                      (c) => c.preview,
                    ).includes(id) && !channelIds.includes(id),
                )) {
                  ctx.waitUntil(
                    logErrors(
                      (async () => {
                        const thread = (await rest.post(
                          Routes.threads(channelId),
                          {
                            body: {
                              name: `${game.visiting_team_code} @ ${game.home_team_code} - ${dateString}`,
                              // We need some extra statefulness to have this
                              // work with announcement channels due to the separate
                              // thread type required
                              type: ChannelType.PublicThread,
                            },
                          },
                        )) as APIThreadChannel;
                        const popeData = {
                          ...getPopeData({ league, game, channelId }),
                          thread,
                        };
                        await sendMirrorMessages(
                          rest,
                          filterMirrorChannels(
                            channelId,
                            channelConfigs,
                            "threads",
                          ),
                          getThreadMirrorBody(thread, popeData),
                          popeData,
                        );
                      })(),
                    ),
                  );
                }
                // End polls so people cannot vote after the game has started
                const polls = pickemsPollMessageIds[game.id];
                if (polls && polls.length !== 0) {
                  for (const { channelId, messageId } of polls) {
                    ctx.waitUntil(
                      logErrors(
                        rest.post(Routes.expirePoll(channelId, messageId)),
                      ),
                    );
                  }
                }
              }
              break;
            }
            case GamePlayByPlayEvent.Goal: {
              const channelIds = filterConfigChannels(
                channelConfigs,
                (c) => c.goals,
              );
              if (!summary) summary = await getSummary();

              const goalPlays = allPlays.filter(
                (p) => p.event === GamePlayByPlayEvent.Goal,
              ) as GamePlayByPlayEventGoal[];

              for (const channelId of channelIds) {
                ctx.waitUntil(
                  logErrors(
                    sendMessageWithMirrors(
                      channelId,
                      filterMirrorChannels(channelId, channelConfigs, "goals"),
                      rest,
                      {
                        embeds: [
                          getHtGoalEmbed(league, summary, goalPlays, play),
                        ],
                      },
                      getPopeData({ league, game, channelId }),
                    ),
                  ),
                );
              }
              break;
            }
            case GamePlayByPlayEvent.Penalty: {
              const channelIds = filterConfigChannels(
                channelConfigs,
                (c) => c.penalties,
              );
              if (!summary) summary = await getSummary();

              for (const channelId of channelIds) {
                ctx.waitUntil(
                  sendMessageWithMirrors(
                    channelId,
                    filterMirrorChannels(
                      channelId,
                      channelConfigs,
                      "penalties",
                    ),
                    rest,
                    { embeds: [getHtPenaltyEmbed(league, summary, play)] },
                    getPopeData({ league, game, channelId }),
                  ),
                );
              }
              break;
            }
            case ExtraPXPEvent.PeriodEnd: {
              if (
                !(
                  (game.status === GameStatus.UnofficialFinal ||
                    game.status === GameStatus.Final) &&
                  game.period === play.period_id
                )
              ) {
                // 10 minutes to avoid checking for no reason. It's unlikely
                // that this timeout will ever be chosen since it would require
                // every live game to enter an intermission at the same time.
                nextAlarm = new Date(now.getTime() + 600_000);
                break;
              }

              nextAlarm = null;
              const channelIds = filterConfigChannels(channelConfigs, (c) =>
                game.status === GameStatus.UnofficialFinal ? c.end : c.final,
              );
              if (channelIds.length === 0) break;

              if (!summary) summary = await getSummary();
              for (const channelId of channelIds) {
                ctx.waitUntil(
                  logErrors(
                    sendMessageWithMirrors(
                      channelId,
                      filterMirrorChannels(channelId, channelConfigs, (c) =>
                        game.status === GameStatus.UnofficialFinal
                          ? c.end
                          : c.final,
                      ),
                      rest,
                      {
                        embeds: [
                          getHtStatusEmbed(league, summary),
                          getHtGoalsEmbed(league, summary),
                        ],
                      },
                      getPopeData({ league, game, channelId }),
                    ),
                  ),
                );
              }
              break;
            }
            default:
              break;
          }
        }

        await env.KV.put(
          kvKey,
          JSON.stringify({
            ...kvData,
            postedPbpEventIds: allPlays.map(getPlayId),
          } satisfies EventData),
          {
            // 3 days
            expirationTtl: 3 * 86400,
          },
        );
        if (nextAlarm !== null) {
          nextAlarms.push(nextAlarm);
        }
      }
      break;
    }
    default:
      break;
  }

  if (nextAlarms.length === 0) return null;
  return nextAlarms.sort((a, b) => a.getTime() - b.getTime())[0];
};

/** One of these exists for a single day for each league */
export class DurableNotificationManager implements DurableObject {
  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(request: Request) {
    const data = (await request.json()) as {
      day: string;
      league: HockeyTechLeague;
    };
    if (!/\d{4}-\d{1,2}-\d{1,2}/.test(data.day)) {
      return new Response("Invalid `day`", { status: 400 });
    }
    if (!leagues.includes(data.league)) {
      return new Response("Invalid `league`", { status: 400 });
    }

    const client = getHtClient(this.env, data.league);
    const games = (await client.getDailySchedule(data.day)).SiteKit.Gamesbydate;
    console.log(
      data.league,
      "notifs",
      games.map((g) => g.id),
    );
    if (games.length === 0) {
      return new Response(null, { status: 204 });
    }

    await this.state.storage.put({
      alarmType: AlarmType.Check,
      league: data.league,
      day: data.day,
    });

    const firstStart = games
      .map((g) => getGameDate(g))
      .sort((a, b) => a.getTime() - b.getTime())[0];
    // 6 hours before the first game starts (preview event)
    await this.state.storage.setAlarm(firstStart.getTime() - 21_600_000);

    return new Response(null, { status: 204 });
  }

  async alarm() {
    const alarmType = await this.state.storage.get<AlarmType>("alarmType");
    if (alarmType === undefined) {
      throw Error("No alarm type was stored");
    }

    switch (alarmType) {
      case AlarmType.Check: {
        const league = await this.state.storage.get<HockeyTechLeague>("league");
        if (league === undefined) throw Error("No league was stored");

        const day = await this.state.storage.get<string>("day");
        if (day === undefined) throw Error("No day was stored");

        const now = getNow();
        const nextAlarm = await checkAlarm(
          this.env,
          this.state,
          league,
          day,
          now,
        );
        if (nextAlarm === null) {
          // The games are all over
          await this.state.storage.deleteAll();
          return;
        }
        // Wait at least 30 seconds before letting the next alarm happen
        const minimumAlarm = now.getTime() + 30_000;
        await this.state.storage.setAlarm(
          Math.max(nextAlarm.getTime(), minimumAlarm),
        );

        break;
      }
      // Deprecated. We previously waited for 2 days before purging but this
      // was pointless since the data is never accessed after a purge is set.
      case AlarmType.Purge: {
        // We don't need to clean up KV because the keys have TTLs
        await this.state.storage.deleteAll();
        return;
      }
      default:
        break;
    }
  }
}

export const checkAlarm = async (
  env: Env,
  ctx: Pick<DurableObjectState, "waitUntil">,
  league: HockeyTechLeague,
  day: string,
  now: Date,
) => {
  console.log("alarm for", league, day);
  const db = getDb(env.DB);
  const entries = await db.query.notifications.findMany({
    where: and(
      eq(notifications.active, true),
      eq(notifications.league, league),
    ),
    columns: {
      channelId: true,
      teamIds: true,
      sendConfig: true,
      mirrorConfig: true,
    },
  });
  console.log(JSON.stringify(entries));

  const channelIds: Record<
    string,
    Record<
      string,
      {
        send: NotificationSendConfig;
        mirrors: ChannelMirrorInnerConfig[];
      }
    >
  > = {};
  for (const entry of entries) {
    for (const teamId of entry.teamIds) {
      const mirrors = Object.entries(
        entry.mirrorConfig?.[teamId] ?? {},
      ).flatMap(([key, config]) =>
        config.channelIds.map((channelId) => ({
          key: key as keyof NotificationSendConfig,
          channelId,
          contentTemplate: config.contentTemplate,
        })),
      );
      if (!channelIds[teamId]) {
        channelIds[teamId] = {
          [entry.channelId]: { send: entry.sendConfig, mirrors },
        };
      } else {
        channelIds[teamId][entry.channelId] = {
          send: entry.sendConfig,
          mirrors,
        };
      }
    }
  }

  const pickemsPollEntries = await db.query.pickemsPolls.findMany({
    where: and(
      eq(pickemsPolls.league, league),
      eq(pickemsPolls.day, day),
      // eq(pickemsPolls.ended, false),
    ),
    columns: {
      gameId: true,
      channelId: true,
      messageId: true,
    },
  });
  const pickemsPollMessageIds: Record<
    string,
    { channelId: string; messageId: string }[]
  > = {};
  for (const entry of pickemsPollEntries) {
    pickemsPollMessageIds[entry.gameId] =
      pickemsPollMessageIds[entry.gameId] ?? [];
    pickemsPollMessageIds[entry.gameId].push(entry);
  }

  const rest = new REST().setToken(env.DISCORD_TOKEN);

  let nextAlarm: Date | null;
  try {
    nextAlarm = await runNotifications({
      rest,
      env,
      ctx,
      league,
      now,
      day,
      channelIds,
      pickemsPollMessageIds,
    });
  } catch (e) {
    console.error(e);
    if (new Date(day).getTime() - now.getTime() < 0) {
      // We've probably been in a loop for several hours; time to clean up.
      nextAlarm = null;
    } else {
      // 3 minutes
      nextAlarm = new Date(now.getTime() + 180_000);
    }
  }
  return nextAlarm;
};
