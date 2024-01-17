export type PwhlTeamId = "1" | "2" | "3" | "4" | "5" | "6";

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
  } as Record<PwhlTeamId, number>,
  khl: 0x306da9,
};
