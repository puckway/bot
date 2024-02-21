import { HockeyTechLeague } from "./client";

export const htPlayerImageUrl = (
  league: HockeyTechLeague,
  playerId: string | number,
) => `https://assets.leaguestat.com/${league}/120x160/${playerId}.jpg`;
