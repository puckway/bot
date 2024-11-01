import { HockeyTechLeague } from "../client";
import { HockeyTechTeam } from "../team";

import pwhlTeams from "./pwhl";
import ahlTeams from "./ahl";

export const leagueTeams: Record<HockeyTechLeague, HockeyTechTeam[]> = {
  pwhl: pwhlTeams,
  ahl: ahlTeams,
  ohl: [],
  whl: [],
  lhjmq: [],
  sphl: [],
};
