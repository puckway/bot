import fetchAdapter from "@haverstack/axios-fetch-adapter";
import HockeyTech from "hockeytech";

export type HockeyTechLeague =
  | "pwhl"
  | "ahl"
  | "ohl"
  | "lhjmq"
  | "whl"
  | "sphl"
  | "khl"
  | "zhhl"
  | "mhl";

export interface HockeyTechLeagueConfiguration {
  clientCode: string;
  key: string;
  proxy?: string;
  watch?: {
    platform: string;
    url: string;
  };
}

// export const khlProxyOrigin = "http://localhost:51996";
export const khlProxyOrigin = "https://khl.shayy.workers.dev";

export const isKhl = (league: HockeyTechLeague) =>
  ["khl", "zhhl", "mhl"].includes(league);

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
    watch: {
      platform: "FloHockey",
      url: "https://www.flohockey.tv/leagues/10826833",
    },
  },
  ohl: {
    // ontario
    clientCode: "ohl",
    // key: "4767a11864244441",
    key: "f1aa699db3d81487",
    watch: {
      platform: "CHL TV",
      url: "https://watch.chl.ca/ohl_chl",
    },
  },
  lhjmq: {
    // quebec major junior
    clientCode: "lhjmq",
    key: "f1aa699db3d81487",
    watch: {
      platform: "CHL TV",
      url: "https://watch.chl.ca/qmjhl_chl",
    },
  },
  whl: {
    // western
    clientCode: "whl",
    key: "41b145a848f4bd67",
    watch: {
      platform: "CHL TV",
      url: "https://watch.chl.ca/whl_chl",
    },
  },
  sphl: {
    // southern professional
    clientCode: "sphl",
    key: "8fa10d218c49ec96",
    watch: {
      platform: "FloHockey",
      url: "https://www.flohockey.tv/leagues/10826834",
    },
  },
  // mjhl: {
  //   // maritime junior
  //   clientCode: "mhl",
  //   key: "4a948e7faf5ee58d",
  // },
  // khl leagues (hockeytech imitation proxy server)
  khl: {
    // kontinental
    clientCode: "khl",
    key: "khl",
    proxy: `${khlProxyOrigin}?url=`,
    // They might be migrating to yandex (KHL plus) instead?
    // There is also KHL prime, a TV channel
    watch: {
      platform: "video.khl.ru",
      url: "https://video.khl.ru/page/broadcasts/",
    },
  },
  zhhl: {
    // women's (Женская)
    clientCode: "whl",
    key: "whl",
    proxy: `${khlProxyOrigin}?url=`,
    watch: {
      platform: "YouTube",
      url: "https://www.youtube.com/@whl_ru/streams",
    },
  },
  mhl: {
    // minor (Молодежная)
    clientCode: "mhl",
    key: "mhl",
    proxy: `${khlProxyOrigin}?url=`,
    watch: {
      platform: "YouTube",
      url: "https://www.youtube.com/@mhl_rus/streams",
    },
  },
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
  return (points / (gamesPlayed * gamesWorth || 1)).toFixed(3);
};

export const GLOBAL_GAME_ID_REGEX =
  /^🆔 (pwhl|ahl|ohl|lhjmq|whl|sphl|khl|zhhl|mhl):(\d+)$/m;
