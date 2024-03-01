import fetchAdapter from "@haverstack/axios-fetch-adapter";
import HockeyTech from "hockeytech";

export type HockeyTechLeague = "pwhl" | "ahl";

export interface HockeyTechLeagueConfiguration {
  clientCode: string;
  key: string;
}

export const hockeyTechLeagues: Record<
  HockeyTechLeague,
  HockeyTechLeagueConfiguration
> = {
  pwhl: {
    clientCode: "pwhl",
    key: "694cfeed58c932ee",
  },
  ahl: {
    clientCode: "ahl",
    key: "ccb91f29d6744675",
  },
};

export const getHtClient = (league: HockeyTechLeague, locale?: "en" | "fr") => {
  const config = hockeyTechLeagues[league];
  return new HockeyTech(config.key, config.clientCode, locale, undefined, {
    adapter: fetchAdapter,
  });
};

export const getPointsPct = (
  league: HockeyTechLeague,
  points: number,
  gamesPlayed: number,
): string => {
  // The number of points that a team gets for a regulation win; this is how
  // much an individual game is "worth". Hockeytech uses a static value for
  // this and doesn't account for the PWHL's max 3 points per game.
  const gamesWorth = league === "pwhl" ? 3 : 2;
  return (points / (gamesPlayed * (gamesWorth ?? 1))).toPrecision(3);
};

export const GLOBAL_GAME_ID_REGEX = /^🆔 (pwhl|ahl):(\d+)$/m;
