import { HockeyTechLeague } from "../client";
import { HockeyTechTeam } from "../team";

import pwhlTeams from "./pwhl";
import ahlTeams from "./ahl";
import khlTeams from "./khl";
import zhhlTeams from "./zhhl";
import mhlTeams from "./mhl";

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
