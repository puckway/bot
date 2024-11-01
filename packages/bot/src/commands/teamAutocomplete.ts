import * as api from "api";
import { AppCommandAutocompleteCallback } from "../commands";
import { League } from "../db/schema";
import { getKhlLocale } from "../util/l10n";
import { leagueTeams } from "../ht/teams";

export const teamAutocomplete: AppCommandAutocompleteCallback = async (ctx) => {
  const league = ctx.getStringOption("league").value as League;
  const query = ctx.getStringOption("team").value;

  switch (league) {
    case "khl": {
      const locale_ = getKhlLocale(ctx);
      const locale =
        locale_ === "cn" ? "en" : (locale_.toLowerCase() as "en" | "ru");
      const sorted = api.allTeams
        .filter(
          (t) =>
            t.names[locale].toLowerCase().includes(query.toLowerCase()) ||
            t.locations[locale].toLowerCase().includes(query.toLowerCase()),
        )
        .sort((a, b) => (a.names.en > b.names.en ? 1 : -1));

      return sorted.map((team) => ({
        name: `${team.names.en} (${team.locations.en})`,
        name_localizations: {
          ru: `${team.names.ru} (${team.locations.ru})`,
        },
        value: String(team.id),
      }));
    }
    default:
      return leagueTeams[league]
        .filter(
          (t) =>
            t.name.toLowerCase().includes(query.toLowerCase()) ||
            t.nickname.toLowerCase().includes(query.toLowerCase()) ||
            t.city.toLowerCase().includes(query.toLowerCase()),
        )
        .map((t) => ({
          name: t.name,
          value: t.id,
        }));
  }
};
