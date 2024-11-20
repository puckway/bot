import { HockeyTechLeague, isKhl, khlProxyOrigin } from "./client";

export const htPlayerImageUrl = (
  league: HockeyTechLeague,
  playerId: string | number,
) =>
  isKhl(league)
    ? `${khlProxyOrigin}/assets/${league}/players/${playerId}`
    : `https://assets.leaguestat.com/${league}/120x160/${playerId}.jpg`;
