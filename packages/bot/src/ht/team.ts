import type { TeamsBySeason } from "hockeytech";
import { type HockeyTechLeague, khlProxyOrigin } from "./client";

export const getHtTeamLogoUrl = (
  league: HockeyTechLeague,
  teamId: string | number,
) =>
  ["khl", "zhhl", "mhl"].includes(league)
    ? `${khlProxyOrigin}/assets/${league}/logos/${teamId}`
    : `https://assets.leaguestat.com/${league}/logos/${
        // Sometimes the size is required
        league === "ahl" ? "50x50/" : ""
      }${teamId}.png`;

export type HockeyTechTeam = Pick<
  TeamsBySeason,
  "id" | "name" | "city" | "code" | "nickname"
>;
