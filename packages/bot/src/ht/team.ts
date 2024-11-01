import { TeamsBySeason } from "hockeytech";
import { HockeyTechLeague } from "./client";

export const getHtTeamLogoUrl = (
  league: HockeyTechLeague,
  teamId: string | number,
) =>
  `https://assets.leaguestat.com/${league}/logos/${
    // Sometimes the size is required
    league === "ahl" ? "50x50/" : ""
  }${teamId}.png`;

export type HockeyTechTeam = Pick<
  TeamsBySeason,
  "id" | "name" | "city" | "code" | "nickname"
>;
