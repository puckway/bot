import { Env } from "..";
import { League } from "../db/schema";

export const getTeamEmoji = (
  env: Env,
  league: League,
  teamId: string | number,
) => {
  const key = `${league.toUpperCase()}_TEAM_EMOJI_${teamId}`;
  if (key in env) {
    return `<:_:${env[key as keyof Env]}>`;
  }
  // A question mark looked pretty bad. Players that have been transferred to
  // other leagues may still show up, so we want to compensate for them.
  return "📃";
};

export const khlTeamEmoji = (env: Env, team: { id: number }) =>
  getTeamEmoji(env, "khl", team.id);

export const getLeagueLogoUrl = (env: Env, league: League) => {
  const key = `${league.toUpperCase()}_LOGO`;
  if (key in env) {
    return env[key as keyof Env] as string;
  }
  return undefined;
};

export const countryCodeEmoji = (cc: string) =>
  String.fromCodePoint(
    // biome-ignore lint/style/noNonNullAssertion:
    ...[...cc.toUpperCase()].map((c) => c.codePointAt(0)! + 127397),
  );
