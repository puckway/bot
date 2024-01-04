import { AppCommandAutocompleteCallback } from "../commands";
import * as api from "api";
import { getKhlLocale } from "../util/l10n";

export const teamAutocomplete: AppCommandAutocompleteCallback = async (ctx) => {
  const query = ctx.getStringOption("team").value;
  const locale_ = getKhlLocale(ctx);
  const locale =
    locale_ === "CN" ? "en" : (locale_.toLowerCase() as "en" | "ru");
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
};
