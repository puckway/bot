import fetchAdapter from "@haverstack/axios-fetch-adapter";
import HockeyTech from "hockeytech";

export type HockeyTechLeague =
  | "pwhl"
  | "ahl"
  | "ohl"
  | "lhjmq"
  | "whl"
  | "sphl";

export interface HockeyTechLeagueConfiguration {
  clientCode: string;
  key: string;
  proxy?: string;
  watch?: {
    platform: string;
    url: string;
  };
}

export const hockeyTechLeagues: Record<
  HockeyTechLeague,
  HockeyTechLeagueConfiguration
> = {
  pwhl: {
    // professional women's
    clientCode: "pwhl",
    key: "694cfeed58c932ee",
    watch: {
      platform: "YouTube",
      url: "https://youtube.com/@thepwhlofficial/streams",
    },
  },
  ahl: {
    // american
    clientCode: "ahl",
    key: "ccb91f29d6744675",
  },
  ohl: {
    // ontario
    clientCode: "ohl",
    // key: "4767a11864244441",
    key: "f1aa699db3d81487",
  },
  lhjmq: {
    // quebec major junior
    clientCode: "lhjmq",
    key: "f1aa699db3d81487",
  },
  whl: {
    // western
    clientCode: "whl",
    key: "41b145a848f4bd67",
  },
  sphl: {
    // southern professional
    clientCode: "sphl",
    key: "8fa10d218c49ec96",
  },
  // mjhl: {
  //   // maritime junior
  //   clientCode: "mhl",
  //   key: "4a948e7faf5ee58d",
  // },
  // khl leagues (hockeytech imitation proxy server)
  // khl: {
  //   // kontinental
  //   clientCode: "khl",
  //   key: "",
  //   proxy: "",
  //   // They might be migrating to yandex (KHL plus) instead?
  //   // There is also KHL prime, a TV channel
  //   // watch: {
  //   //   platform: "video.khl.ru",
  //   //   url: "https://video.khl.ru/page/broadcasts/",
  //   // },
  // },
  // zhhl: {
  //   // women's (Женская)
  //   clientCode: "zhhl",
  //   key: "",
  //   proxy: "",
  //   watch: {
  //     platform: "YouTube",
  //     url: "https://www.youtube.com/@whl_ru/streams",
  //   },
  // },
  // mhl: {
  //   // 
  //   clientCode: "mhl",
  //   key: "",
  //   proxy: "",
  //   watch: {
  //     platform: "YouTube",
  //     url: "https://www.youtube.com/@mhl_rus/streams",
  //   },
  // },
};

export const getHtClient = (league: HockeyTechLeague, locale?: "en" | "fr") => {
  const config = hockeyTechLeagues[league];
  return new HockeyTech(config.key, config.clientCode, locale, config.proxy, {
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
  return (points / (gamesPlayed * gamesWorth || 1)).toPrecision(3);
};

export const GLOBAL_GAME_ID_REGEX = /^🆔 (pwhl|ahl|ohl|lhjmq|whl|sphl):(\d+)$/m;
