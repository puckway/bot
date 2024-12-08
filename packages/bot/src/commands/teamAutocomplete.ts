import { AppCommandAutocompleteCallback } from "../commands";
import { League } from "../db/schema";
import { isKhl } from "../ht/client";
import { leagueTeams } from "../ht/teams";

export const teamAutocomplete: AppCommandAutocompleteCallback = async (ctx) => {
  const league = ctx.getStringOption("league").value as League;
  const query = ctx.getStringOption("team").value;

  return leagueTeams[league]
    .filter(
      (t) =>
        t.name.toLowerCase().includes(query.toLowerCase()) ||
        t.nickname.toLowerCase().includes(query.toLowerCase()) ||
        t.city.toLowerCase().includes(query.toLowerCase()),
    )
    .map((t) => ({
      name: isKhl(league) ? `${t.nickname} (${t.city})` : t.name,
      value: t.id,
    }))
    .sort((a, b) => (b.name < a.name ? 1 : -1));
};
