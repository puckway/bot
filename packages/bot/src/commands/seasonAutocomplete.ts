import { APIApplicationCommandOptionChoice } from "discord-api-types/v10";
import { AppCommandAutocompleteCallback } from "../commands";
import { HockeyTechLeague, getHtClient } from "../ht/client";
import { leagues } from "../db/schema";

export const seasonAutocomplete: AppCommandAutocompleteCallback = async (
  ctx,
) => {
  const guildId = ctx.interaction.guild_id;
  if (!guildId) throw Error("Guild only");

  const league = ctx.getStringOption("league").value as HockeyTechLeague;
  if (!leagues.includes(league)) return [];

  const query = ctx.getStringOption("season").value;
  const client = getHtClient(league);
  const seasons = (await client.getSeasonList()).SiteKit.Seasons;

  return seasons
    .filter((season) => season.season_name.startsWith(query.toLowerCase()))
    .map(
      (season) =>
        ({
          name: season.season_name,
          value: season.season_id,
        }) satisfies APIApplicationCommandOptionChoice,
    );
};
