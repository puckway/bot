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

type HockeyTechTeam = Pick<
  TeamsBySeason,
  "id" | "name" | "city" | "code" | "nickname"
>;

type HockeyTechSeason = {
  id: string;
  names: {
    en: string;
    fr?: string;
  };
  type: "regular" | "exhibition" | "playoff";
};

export const allPwhlSeasons: HockeyTechSeason[] = [
  {
    id: "1",
    names: { en: "2024 Regular Season", fr: "Saison Régulière 2024" },
    type: "regular",
  },
  {
    id: "2",
    names: { en: "2024 Preseason" },
    type: "exhibition",
  },
];

export const allPwhlTeams: HockeyTechTeam[] = [
  {
    id: "1",
    name: "PWHL Boston",
    city: "Boston",
    code: "BOS",
    nickname: "Boston",
  },
  {
    id: "2",
    name: "PWHL Minnesota",
    city: "Minnesota",
    code: "MIN",
    nickname: "Minnesota",
  },
  {
    id: "3",
    name: "PWHL Montreal",
    city: "Montreal",
    code: "MON",
    nickname: "Montreal",
  },
  {
    id: "4",
    name: "PWHL New York",
    city: "New York",
    code: "NY",
    nickname: "New York",
  },
  {
    id: "5",
    name: "PWHL Ottawa",
    city: "Ottawa",
    code: "OTT",
    nickname: "Ottawa",
  },
  {
    id: "6",
    name: "PWHL Toronto",
    city: "Toronto",
    code: "TOR",
    nickname: "Toronto",
  },
];

export const allAhlTeams: HockeyTechTeam[] = [
  {
    id: "440",
    name: "Abbotsford Canucks",
    city: "Abbotsford",
    nickname: "Canucks",
    code: "ABB",
  },
  {
    id: "402",
    name: "Bakersfield Condors",
    city: "Bakersfield",
    nickname: "Condors",
    code: "BAK",
  },
  {
    id: "413",
    name: "Belleville Senators",
    city: "Belleville",
    nickname: "Senators",
    code: "BEL",
  },
  {
    id: "317",
    name: "Bridgeport Islanders",
    city: "Bridgeport",
    nickname: "Islanders",
    code: "BRI",
  },
  {
    id: "444",
    name: "Calgary Wranglers",
    city: "Calgary",
    nickname: "Wranglers",
    code: "CGY",
  },
  {
    id: "384",
    name: "Charlotte Checkers",
    city: "Charlotte",
    nickname: "Checkers",
    code: "CLT",
  },
  {
    id: "330",
    name: "Chicago Wolves",
    city: "Chicago",
    nickname: "Wolves",
    code: "CHI",
  },
  {
    id: "373",
    name: "Cleveland Monsters",
    city: "Cleveland",
    nickname: "Monsters",
    code: "CLE",
  },
  {
    id: "445",
    name: "Coachella Valley Firebirds",
    city: "Coachella Valley",
    nickname: "Firebirds",
    code: "CV",
  },
  {
    id: "419",
    name: "Colorado Eagles",
    city: "Colorado",
    nickname: "Eagles",
    code: "COL",
  },
  {
    id: "328",
    name: "Grand Rapids Griffins",
    city: "Grand Rapids",
    nickname: "Griffins",
    code: "GR",
  },
  {
    id: "307",
    name: "Hartford Wolf Pack",
    city: "Hartford",
    nickname: "Wolf Pack",
    code: "HFD",
  },
  {
    id: "437",
    name: "Henderson Silver Knights",
    city: "Henderson",
    nickname: "Silver Knights",
    code: "HSK",
  },
  {
    id: "319",
    name: "Hershey Bears",
    city: "Hershey",
    nickname: "Bears",
    code: "HER",
  },
  {
    id: "389",
    name: "Iowa Wild",
    city: "Iowa",
    nickname: "Wild",
    code: "IA",
  },
  {
    id: "415",
    name: "Laval Rocket",
    city: "Laval",
    nickname: "Rocket",
    code: "LAV",
  },
  {
    id: "313",
    name: "Lehigh Valley Phantoms",
    city: "Lehigh Valley",
    nickname: "Phantoms",
    code: "LV",
  },
  {
    id: "321",
    name: "Manitoba Moose",
    city: "Manitoba",
    nickname: "Moose",
    code: "MB",
  },
  {
    id: "327",
    name: "Milwaukee Admirals",
    city: "Milwaukee",
    nickname: "Admirals",
    code: "MIL",
  },
  {
    id: "403",
    name: "Ontario Reign",
    city: "Ontario",
    nickname: "Reign",
    code: "ONT",
  },
  {
    id: "309",
    name: "Providence Bruins",
    city: "Providence",
    nickname: "Bruins",
    code: "PRO",
  },
  {
    id: "323",
    name: "Rochester Americans",
    city: "Rochester",
    nickname: "Americans",
    code: "ROC",
  },
  {
    id: "372",
    name: "Rockford IceHogs",
    city: "Rockford",
    nickname: "IceHogs",
    code: "RFD",
  },
  {
    id: "404",
    name: "San Diego Gulls",
    city: "San Diego",
    nickname: "Gulls",
    code: "SD",
  },
  {
    id: "405",
    name: "San Jose Barracuda",
    city: "San Jose",
    nickname: "Barracuda",
    code: "SJ",
  },
  {
    id: "411",
    name: "Springfield Thunderbirds",
    city: "Springfield",
    nickname: "Thunderbirds",
    code: "SPR",
  },
  {
    id: "324",
    name: "Syracuse Crunch",
    city: "Syracuse",
    nickname: "Crunch",
    code: "SYR",
  },
  {
    id: "380",
    name: "Texas Stars",
    city: "Texas",
    nickname: "Stars",
    code: "TEX",
  },
  {
    id: "335",
    name: "Toronto Marlies",
    city: "Toronto",
    nickname: "Marlies",
    code: "TOR",
  },
  {
    id: "412",
    name: "Tucson Roadrunners",
    city: "Tucson",
    nickname: "Roadrunners",
    code: "TUC",
  },
  {
    id: "390",
    name: "Utica Comets",
    city: "Utica",
    nickname: "Comets",
    code: "UTC",
  },
  {
    id: "316",
    name: "Wilkes-Barre/Scranton Penguins",
    city: "Wilkes-Barre/Scranton",
    nickname: "Penguins",
    code: "WBS",
  },
];

export const getLeagueTeams = (league: HockeyTechLeague): HockeyTechTeam[] =>
  league === "pwhl" ? allPwhlTeams : allAhlTeams;
