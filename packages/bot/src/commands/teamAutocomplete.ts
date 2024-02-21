import * as api from "api";
import { AppCommandAutocompleteCallback } from "../commands";
import { getKhlLocale } from "../util/l10n";
import { League } from "../db/schema";
import { getLeagueTeams } from "../ht/team";

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
    case "ahl":
    case "pwhl":
      return getLeagueTeams(league).map((t) => ({
        name: t.name,
        value: t.id,
      }));
    default:
      return [];
  }
};
