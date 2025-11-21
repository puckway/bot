import { League } from "../db/schema";

type PwhlTeamId = "1" | "2" | "3" | "4" | "5" | "6" | "8" | "9";

export const colors = {
  main: 0x985df5,
  pwhl: 0x2e0887,
  pwhlTeams: {
    "1": 0x244635,
    "2": 0x2b1b44,
    "3": 0x7b2d35,
    "4": 0x4fafa8,
    "5": 0x982932,
    "6": 0x467ddb,
    "8": 0x255357,
    "9": 0xa46d4e,
  } satisfies Record<PwhlTeamId, number> as Record<PwhlTeamId, number>,
  khl: 0x306da9,
  zhhl: 0x306da9,
  mhl: 0x306da9,
  ahl: 0xc9353c,
  ohl: 0x3d7ab1,
  lhjmq: 0x2d69dc,
  whl: 0xbd2c34,
  sphl: 0x0d2959,
};

export const getTeamColor = (league: League, teamId: string) =>
  league === "pwhl"
    ? colors.pwhlTeams[teamId as PwhlTeamId] ?? colors[league]
    : colors[league];
