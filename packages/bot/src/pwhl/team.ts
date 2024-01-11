import { Season, TeamsBySeason } from "hockeytech";

type PwhlTeam = Pick<
  TeamsBySeason,
  "id" | "name" | "city" | "code" | "nickname"
>;

type PwhlSeason = {
  id: string;
  names: {
    en: string;
    fr?: string;
  };
  type: "regular" | "exhibition" | "playoff";
};

export const allSeasons: PwhlSeason[] = [
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

export const allTeams: PwhlTeam[] = [
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

export const pwhlTeamLogoUrl = (teamId: string | number) =>
  `https://assets.leaguestat.com/pwhl/logos/${teamId}.png`;
