import { League } from "../db/schema";

export const getExternalUtils = <L = League>(league: L, locale_?: string) => {
  const locale = locale_ ?? "en";
  switch (league) {
    // case "mhl":
    // case "zhhl":
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
        player: (playerId: string | number) => `${site}/players/${playerId}`,
        club: (slug: string) => `${site}/clubs/${slug}`,
        gameCenter: (gameId: string, seasonId?: string) =>
          `${site}/game/${seasonId}/${gameId}/resume/`,
        standings: (seasonId?: string, part?: string) =>
          seasonId
            ? `${site}/standings/${seasonId}/${part ?? "conference"}/`
            : `${site}/standings/`,
      };
    }
    case "pwhl": {
      const site = `https://www.thepwhl.com/${locale}`;
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
    case "ahl": {
      const site = "https://theahl.com";
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
    default:
      throw Error("League not supported. No utilities are available.");
  }
};

export type ExternalUtils<L = League> = ReturnType<typeof getExternalUtils<L>>;
