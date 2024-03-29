import { EmbedBuilder, time } from "@discordjs/builders";
import { REST } from "@discordjs/rest";
import { APIMessage, ChannelType, Routes } from "discord-api-types/v10";
import { eq } from "drizzle-orm";
import {
  GCGamePlayByPlay,
  GamePlayByPlayEvent,
  GamePlayByPlayEventBase,
  GamePlayByPlayEventFaceoff,
  GamePlayByPlayEventGoal,
  GamePlayByPlayEventGoalieChange,
  GamePlayByPlayEventHit,
  GamePlayByPlayEventPenalty,
  GamePlayByPlayEventShot,
  GameStatus,
  GameSummary,
  Period,
  PlayerInfo,
  ScorebarMatch,
} from "hockeytech";
import { getBorderCharacters, table } from "table";
import { Env } from ".";
import { NotificationSendConfig } from "./commands/notifications";
import { HockeyTechTeamStanding, getHtStandings } from "./commands/standings";
import { getDb } from "./db";
import {
  HypeMinute,
  League,
  hypeMinutes,
  leagues,
  notifications,
} from "./db/schema";
import { HockeyTechLeague, getHtClient, getPointsPct } from "./ht/client";
import { htPlayerImageUrl } from "./ht/player";
import { getHtTeamLogoUrl } from "./ht/team";
import { getTeamColor } from "./util/colors";
import { getTeamEmoji } from "./util/emojis";
import { ExternalUtils, getExternalUtils } from "./util/external";
import { toHMS } from "./util/time";

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

export const getHtGamePreviewEmbed = (
  league: HockeyTechLeague,
  game: ScorebarMatch,
  standings?: HockeyTechTeamStanding[],
) => {
  const utils = getExternalUtils(league);
  const visitorStd = standings?.find((t) => t.team_id === game.VisitorID);
  const homeStd = standings?.find((t) => t.team_id === game.HomeID);
  const showingStandings = !!visitorStd && !!homeStd;

  return new EmbedBuilder()
    .setAuthor({
      name: `Game #${game.game_number} - ${game.VisitorLongName} @ ${game.HomeLongName}`,
      url: utils.gameCenter(game.ID),
    })
    .setThumbnail(game.HomeLogo || null)
    .setColor(getTeamColor(league, game.HomeID))
    .setDescription(
      [
        `🏒 ${time(new Date(game.GameDateISO8601), "t")}`,
        `🏟️ ${game.venue_name}`,
        `🎟️ [Tickets](${game.TicketUrl})`,
      ].join("\n"),
    )
    .addFields(
      visitorStd && homeStd
        ? [visitorStd, homeStd]
            .sort((a, b) => a.rank - b.rank)
            .map((std) => ({
              name: `#${std.rank} - ${getTeamEmoji(league, std.team_id)} ${
                std.team_name
              }`,
              value: `\`\`\`apache\n${table(
                [
                  ["GP", "PTS", "W", "OTL", "L", "PCT"],
                  ["---", "----", "--", "----", "--", "----"],
                  [
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
                  ],
                ],
                {
                  border: getBorderCharacters("void"),
                  columnDefault: { paddingLeft: 0, paddingRight: 1 },
                  drawHorizontalLine: () => false,
                },
              )}\`\`\``,
              inline: false,
            }))
        : [
            {
              name: "Season Records",
              value: `${getTeamEmoji(league, game.VisitorID)} ${
                game.VisitorCode
              } **${game.VisitorWins}-${game.VisitorRegulationLosses}-${
                Number(game.VisitorOTLosses) +
                Number(game.VisitorShootoutLosses)
              }**`,
              inline: true,
            },
            {
              name: "_ _",
              value: `${getTeamEmoji(league, game.HomeID)} ${game.HomeCode} **${
                game.HomeWins
              }-${game.HomeRegulationLosses}-${
                Number(game.HomeOTLosses) + Number(game.HomeShootoutLosses)
              }**`,
              inline: true,
            },
          ],
    )
    .setFooter({
      text: `${
        showingStandings ? "" : "Wins - Reg. Losses - OT Losses\n"
      }🆔 ${league}:${game.ID}`,
    })
    .toJSON();
};

export const getHtGamePreviewFinalEmbed = (
  league: HockeyTechLeague,
  game: GameSummary,
  spoilerScores = false,
) => {
  const utils = getExternalUtils(league);
  const embed = getHtStatusEmbed(league, game, spoilerScores);

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

  return new EmbedBuilder(embed)
    .setAuthor({
      name: `Game #${game.meta.game_number} - ${game.visitor.name} @ ${game.home.name}`,
      url: utils.gameCenter(game.meta.id),
    })
    .setDescription(
      [
        `🏒 ${time(startDate, "t")}${
          endDate ? ` - ${time(endDate, "t")}` : ""
        }`,
        `🏟️ ${game.venue}`,
      ].join("\n"),
    )
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
          period.long_name
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
        `**${htPlayerName(penalty.player_penalized_info, utils)} (${
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
            name: `${period.long_name} Period`,
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
  game: ScorebarMatch,
  plays: Play[],
) => {
  const utils = getExternalUtils(league);
  const stats = getPlayStats(plays);

  const visitorEmoji = getTeamEmoji(league, game.VisitorID);
  const homeEmoji = getTeamEmoji(league, game.HomeID);
  const awayStats = [
    `${visitorEmoji} ${game.VisitorNickname}`,
    `PP: ${pctStat(stats.goals.visitor.pp, stats.penalties.home.total)}`,
    `PIM: **${stats.penalties.visitor.pim}**`,
    `FO: ${pctStat(
      stats.faceoffs.visitor.won,
      stats.faceoffs.visitor.attempted,
    )}`,
  ].join("\n");
  const homeStats = [
    `${homeEmoji} ${game.HomeNickname}`,
    `PP: ${pctStat(stats.goals.home.pp, stats.penalties.visitor.total)}`,
    `PIM: **${stats.penalties.home.pim}**`,
    `FO: ${pctStat(stats.faceoffs.home.won, stats.faceoffs.home.attempted)}`,
  ].join("\n");

  let visitorGoalieChange: GamePlayByPlayEventGoalieChange | undefined;
  let homeGoalieChange: GamePlayByPlayEventGoalieChange | undefined;
  for (const play of plays) {
    if (play.event === GamePlayByPlayEvent.GoalieChange) {
      if (play.team_id === game.VisitorID) {
        visitorGoalieChange = play;
      } else {
        homeGoalieChange = play;
      }
    }
  }

  return new EmbedBuilder()
    .setAuthor({
      name: `${game.VisitorLongName} @ ${game.HomeLongName}`,
      url: utils.gameCenter(game.ID),
    })
    .setThumbnail(getHtTeamLogoUrl(league, game.HomeID))
    .setColor(getTeamColor(league, game.HomeID))
    .addFields(
      {
        name: "Score",
        value: [
          `${visitorEmoji} ${game.VisitorCode} **${stats.goals.visitor.total}** (${stats.shots.visitor} shots)`,
          `${homeEmoji} ${game.HomeCode} **${stats.goals.home.total}** (${stats.shots.home} shots)`,
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
      text: `${game.VisitorCode} @ ${game.HomeCode} - Game #${game.game_number}\n🆔 ${league}:${game.ID}`,
    })
    .toJSON();
};

export const getHtLineupEmbed = (
  league: HockeyTechLeague,
  game: GameSummary,
) => {
  const lines = {
    visitor: {
      f: game.visitor_team_lineup.players.filter((p) => p.position === "8"),
      d: game.visitor_team_lineup.players.filter((p) => p.position === "1"),
      g: game.visitor_team_lineup.goalies,
    },
    home: {
      f: game.home_team_lineup.players.filter((p) => p.position === "8"),
      d: game.home_team_lineup.players.filter((p) => p.position === "1"),
      g: game.home_team_lineup.goalies,
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
        value: lines.visitor.f
          .map((player) => `#${player.jersey_number} ${player.last_name}`)
          .join("\n")
          .slice(0, 1024),
        inline: true,
      },
      {
        name: "_ _\nDefense",
        value: lines.visitor.d
          .map((player) => `#${player.jersey_number} ${player.last_name}`)
          .join("\n")
          .slice(0, 1024),
        inline: true,
      },
      {
        name: "_ _\nGoalie",
        value: lines.visitor.g
          .map((player) => `#${player.jersey_number} ${player.last_name}`)
          .join("\n")
          .slice(0, 1024),
        inline: true,
      },
      {
        name: `${getTeamEmoji(league, game.home.id)} ${
          game.home.nickname
        }\nForwards`,
        value: lines.home.f
          .map((player) => `#${player.jersey_number} ${player.last_name}`)
          .join("\n")
          .slice(0, 1024),
        inline: true,
      },
      {
        name: "_ _\nDefense",
        value: lines.home.d
          .map((player) => `#${player.jersey_number} ${player.last_name}`)
          .join("\n")
          .slice(0, 1024),
        inline: true,
      },
      {
        name: "_ _\nGoalie",
        value: lines.home.g
          .map((player) => `#${player.jersey_number} ${player.last_name}`)
          .join("\n")
          .slice(0, 1024),
        inline: true,
      },
    )
    .setFooter({
      text: `${game.visitor.code} @ ${game.home.code} - Game #${game.meta.game_number}\nPlayers are sorted by number. Actual line position is not shown.`,
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
        ? {
            id: p.period_id,
            name:
              "period_long_name" in p
                ? p.period_long_name
                : "period" in p
                  ? p.period
                  : periodNameFromId(p.period_id),
          }
        : "period" in p
          ? {
              id: p.period,
              name: periodNameFromId(p.period),
            }
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
        period_name: period.name,
        time: "0:00",
        s: 0,
      }) as GamePlayByPlayEventPeriodStart,
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
      period_name: period.name,
      time: "20:00",
      // Overtime period ends as soon as the final goal is scored
      s: Number(period) > 3 ? lastPlay.s : 1200,
    } as GamePlayByPlayEventPeriodEnd);
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
  //       period_name: period.name,
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

  for (const league of Object.keys(channelIds) as League[]) {
    switch (league) {
      case "ahl":
      case "pwhl": {
        const client = getHtClient(league);
        const scorebar = (await client.getScorebar(2, 1)).SiteKit.Scorebar;

        for (const game of scorebar) {
          const start = new Date(game.GameDateISO8601);
          // Don't send anything more than 6 hours in advance
          if (start.getTime() - now.getTime() > 3600000 * 6) break;

          interface EventData {
            postedPreview?: boolean;
            postedLineups?: boolean;
            postedPbpEventIds?: string[];
          }

          const kvKey = `${league}-${game.ID}-eventData`;
          const kvData = await env.KV.get<EventData>(kvKey, "json");

          const channelConfigs = [
            ...Object.entries(channelIds[league][game.HomeID] ?? {}),
            ...Object.entries(channelIds[league][game.VisitorID] ?? {}),
          ];

          let postedPreview = kvData?.postedPreview ?? false;
          let postedLineups = kvData?.postedLineups ?? false;
          if (game.GameStatus === GameStatus.NotStarted) {
            if (!kvData?.postedPreview) {
              const previewChannelIds = filterConfigChannels(
                channelConfigs,
                (c) => c.preview,
              );
              const threadChannelIds = filterConfigChannels(
                channelConfigs,
                (c) => c.threads,
              );
              const standings = await getHtStandings(client);
              for (const channelId of previewChannelIds) {
                ctx.waitUntil(
                  logErrors(
                    (async () => {
                      const message = (await rest.post(
                        Routes.channelMessages(channelId),
                        {
                          body: {
                            embeds: [
                              getHtGamePreviewEmbed(
                                league,
                                game,
                                standings ?? undefined,
                              ),
                            ],
                          },
                        },
                      )) as APIMessage;
                      if (threadChannelIds.includes(channelId)) {
                        await rest.post(Routes.threads(channelId, message.id), {
                          body: {
                            name: `${game.VisitorCode} @ ${
                              game.HomeCode
                            } - ${new Date(
                              game.GameDateISO8601,
                            ).toLocaleDateString(undefined, {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}`,
                          },
                        });
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
              start.getTime() - now.getTime() <= 3600000
            ) {
              const channelIds = filterConfigChannels(
                channelConfigs,
                (c) => c.lineups,
              );

              if (channelIds.length !== 0) {
                const summary = (await client.getGameSummary(Number(game.ID)))
                  .GC.Gamesummary;

                if (
                  summary.home_team_lineup.players.length !== 0 &&
                  summary.visitor_team_lineup.players.length !== 0
                ) {
                  for (const channelId of channelIds) {
                    ctx.waitUntil(
                      logErrors(
                        rest.post(Routes.channelMessages(channelId), {
                          body: {
                            embeds: [getHtLineupEmbed(league, summary)],
                          },
                        }),
                      ),
                    );
                  }
                }
              }
              postedLineups = true;
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
                  // 2 weeks
                  expirationTtl: 14 * 86400,
                },
              );
            }

            continue;
          }

          let summary: GameSummary | undefined = undefined;
          const getSummary = async () =>
            (await client.getGameSummary(Number(game.ID))).GC.Gamesummary;

          const allPlays = getPlaysWithPeriods(
            (await client.getGamePlayByPlay(Number(game.ID))).GC.Pxpverbose,
            game.GameStatus,
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
                const dateString = new Date(
                  game.GameDateISO8601,
                ).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                });

                for (const channelId of channelIds) {
                  ctx.waitUntil(
                    logErrors(
                      (async () => {
                        const message = (await rest.post(
                          Routes.channelMessages(channelId),
                          {
                            body: {
                              content: `**${period.period_name} Period Starting - ${game.VisitorCode} @ ${game.HomeCode}**`,
                              embeds: [
                                getHtPeriodStatusEmbed(league, game, allPlays),
                              ],
                            },
                          },
                        )) as APIMessage;
                        if (
                          threadChannelIds.includes(channelId) &&
                          period.period_id === "1"
                        ) {
                          await rest.post(
                            Routes.threads(channelId, message.id),
                            {
                              body: {
                                name: `${game.VisitorCode} @ ${game.HomeCode} - ${dateString}`,
                              },
                            },
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
                        rest.post(Routes.threads(channelId), {
                          body: {
                            name: `${game.VisitorCode} @ ${game.HomeCode} - ${dateString}`,
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
                      rest.post(Routes.channelMessages(channelId), {
                        body: {
                          embeds: [
                            getHtGoalEmbed(league, summary, goalPlays, play),
                          ],
                        },
                      }),
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
                    rest.post(Routes.channelMessages(channelId), {
                      body: {
                        embeds: [getHtPenaltyEmbed(league, summary, play)],
                      },
                    }),
                  );
                }
                break;
              }
              case ExtraPXPEvent.PeriodEnd: {
                if (
                  !(
                    (game.GameStatus === GameStatus.UnofficialFinal ||
                      game.GameStatus === GameStatus.Final) &&
                    game.Period === play.period_id
                  )
                ) {
                  break;
                }

                const channelIds = filterConfigChannels(channelConfigs, (c) =>
                  game.GameStatus === GameStatus.UnofficialFinal
                    ? c.end
                    : c.final,
                );
                if (channelIds.length === 0) break;

                if (!summary) summary = await getSummary();
                for (const channelId of channelIds) {
                  ctx.waitUntil(
                    logErrors(
                      rest.post(Routes.channelMessages(channelId), {
                        body: {
                          embeds: [
                            getHtStatusEmbed(league, summary),
                            getHtGoalsEmbed(league, summary),
                          ],
                        },
                      }),
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
              // 2 weeks
              expirationTtl: 14 * 86400,
            },
          );
        }
        break;
      }
      default:
        break;
    }
  }
};
