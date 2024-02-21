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
