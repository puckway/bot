import type { NumericBoolean, PlayerBio, RosterPlayer } from "hockeytech";
import { DBWithSchema } from "../db";
import { League, players } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { HockeyTechLeague } from "../ht/client";

export interface EliteProspectsSearchResult {
  id: string;
  fullname: string;
  matches: [number, number][];
  slug: string;
  country: string;
  countryName: string;
  position: string;
  // Birth year
  age: string;
  photo: string;
  verified: NumericBoolean;
  verifiedHidden: NumericBoolean;
  verifiedStyle: null;
  team: string;
  season: string;
  experience: string;
  _type: string;
}

export const epSearchAll = async (fullName: string) => {
  const response = await fetch(
    `https://autocomplete.eliteprospects.com/all?${new URLSearchParams({
      q: fullName.toLowerCase(),
      hideNotActiveLeagues: "1",
    })}`,
  );
  return (await response.json()) as EliteProspectsSearchResult[];
};

export const dbGetPlayer = async (
  playerId: string,
  league: League,
  db: DBWithSchema,
) =>
  await db.query.players.findFirst({
    where: and(eq(players.league, league), eq(players.nativeId, playerId)),
    columns: {
      fullName: true,
      epId: true,
      epSlug: true,
      epImage: true,
      country: true,
      height: true,
      weight: true,
    },
  });

export const epSearchHtPlayer = async (
  player: RosterPlayer | PlayerBio,
  teamName?: string,
) => {
  const results = await epSearchAll(player.name);
  return results.find(
    (p) =>
      p._type === "player" &&
      p.fullname === player.name &&
      (p.age && player.birthdate
        ? p.age === String(new Date(player.birthdate).getUTCFullYear())
        : true) &&
      (teamName ? p.team === teamName : true),
  );
};

export const getEpHtPlayer = async (
  playerId: string,
  player: RosterPlayer | PlayerBio,
  league: HockeyTechLeague,
  db: DBWithSchema,
  teamName?: string,
) => {
  const dbPlayer = await dbGetPlayer(playerId, league, db);
  if (dbPlayer) {
    return {
      country: dbPlayer.country,
      epId: dbPlayer.epId,
      epSlug: dbPlayer.epSlug,
      epImage: dbPlayer.epImage,
      height: dbPlayer.height,
      weight: dbPlayer.weight,
    };
  }
  const searchResult = await epSearchHtPlayer(player, teamName);
  if (searchResult) {
    return (
      await db
        .insert(players)
        .values({
          league,
          nativeId: playerId,
          country: searchResult.countryName,
          epId: searchResult.id,
          epSlug: searchResult.slug,
          epImage: searchResult.photo,
          fullName: searchResult.fullname,
        })
        .returning({
          country: players.country,
          epId: players.epId,
          epSlug: players.epSlug,
          epImage: players.epImage,
          height: players.height,
          weight: players.weight,
        })
    )[0];
  }
};
