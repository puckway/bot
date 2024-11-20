import { League } from "../db/schema";
import { khlProxyOrigin } from "../ht/client";

export const getExternalUtils = <L = League>(league: L, locale_?: string) => {
  const locale = locale_ ?? "en";
  switch (league) {
    case "mhl":
    case "zhhl":
    case "khl": {
      const site =
        league === "khl"
          ? `https://${locale === "ru" ? "www" : locale}.khl.ru`
          : league === "mhl"
            ? locale === "en"
              ? "https://engmhl.khl.ru"
              : "https://mhl.khl.ru"
            : "https://whl.khl.ru";
      return {
        site,
        player: (playerId: string | number) =>
          `${khlProxyOrigin}/${league}/player/${playerId}?lang=${locale}`,
        team: (teamId: string | number) =>
          `${khlProxyOrigin}/${league}/team/${teamId}?lang=${locale}`,
        gameCenter: (gameId: string) =>
          `${khlProxyOrigin}/${league}/game-center/${gameId}?lang=${locale}`,
        standings: () => `${site}/standings/`,
      };
    }
    case "pwhl": {
      const site = `https://thepwhl.com/${locale}`;
      return {
        site,
        player: (playerId: string | number) =>
          `${site}/stats/${locale === "fr" ? "joueur" : "player"}/${playerId}`,
        teamRoster: (teamId: string | number, seasonId?: string | number) =>
          `${site}/stats/${
            locale === "fr" ? "alignement" : "roster"
          }/${teamId}/${seasonId ?? ""}`,
        teamSite: (subdomain: string) => `https://${subdomain}.thepwhl.com`,
        gameCenter: (gameId: string) =>
          `${site}/stats/${
            locale === "fr" ? "game-centre" : "game-center"
          }/${gameId}`,
        standings: () => `${site}/stats/standings`,
      };
    }
    case "ahl":
    case "sphl": {
      const site =
        league === "ahl" ? "https://theahl.com" : "https://thesphl.com";
      return {
        site,
        player: (playerId: string | number) =>
          `${site}/stats/player/${playerId}`,
        teamRoster: (teamId: string | number, seasonId?: string | number) =>
          `${site}/stats/roster/${teamId}/${seasonId ?? ""}`,
        gameCenter: (gameId: string) => `${site}/stats/game-center/${gameId}`,
        standings: () => `${site}/stats/standings`,
      };
    }
    case "ohl":
    case "whl":
    case "lhjmq": {
      const site = `https://chl.ca/${league}`;
      return {
        site,
        player: (playerId: string | number) => `${site}/players/${playerId}/`,
        teamRoster: (teamSlug: string | number, seasonId?: string | number) =>
          `${site}-${teamSlug}/roster/${seasonId ? `7/${seasonId}/` : ""}`,
        gameCenter: (gameId: string) => `${site}/gamecentre/${gameId}/`,
        standings: () => `${site}/standings/`,
      };
    }
    default:
      throw Error("League not supported. No utilities are available.");
  }
};

export type ExternalUtils<L = League> = ReturnType<typeof getExternalUtils<L>>;
