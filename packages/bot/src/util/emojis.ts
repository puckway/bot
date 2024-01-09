import { Env } from "..";

export const khlTeamEmoji = (env: Env, team: { id: number }) => {
  const key = `KHL_TEAM_EMOJI_${team.id}`;
  if (key in env) {
    return `<:_:${env[key as keyof Env]}>`;
  }
  return "❔";
};

export const pwhlTeamEmoji = (env: Env, teamId: string | number) => {
  const key = `PWHL_TEAM_EMOJI_${teamId}`;
  if (key in env) {
    return `<:_:${env[key as keyof Env]}>`;
  }
  return "❔";
};

export const countryCodeEmoji = (cc: string) =>
  String.fromCodePoint(
    // biome-ignore lint/style/noNonNullAssertion:
    ...[...cc.toUpperCase()].map((c) => c.codePointAt(0)! + 127397),
  );
