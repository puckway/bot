import fetchAdapter from "@haverstack/axios-fetch-adapter";
import HockeyTech from "hockeytech";

export type HockeyTechLeague = "pwhl";

export const getPwhlClient = (locale?: "en" | "fr") => {
  return new HockeyTech("694cfeed58c932ee", "pwhl", locale, undefined, {
    adapter: fetchAdapter,
  });
};
