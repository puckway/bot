import { HockeyTechLeague } from "../client";
import { HockeyTechTeam } from "../team";

import ahlTeams from "./ahl";
import khlTeams from "./khl";
import mhlTeams from "./mhl";
import pwhlTeams from "./pwhl";
import zhhlTeams from "./zhhl";

export const leagueTeams: Record<HockeyTechLeague, HockeyTechTeam[]> = {
  pwhl: pwhlTeams,
  ahl: ahlTeams,
  ohl: [],
  whl: [],
  lhjmq: [],
  sphl: [],
  khl: khlTeams,
  zhhl: zhhlTeams,
  mhl: mhlTeams,
};
