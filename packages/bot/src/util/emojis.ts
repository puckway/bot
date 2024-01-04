import { Env } from "..";

export const khlTeamEmoji = (env: Env, team: { id: number }) => {
  const key = `KHL_TEAM_EMOJI_${team.id}`;
  if (key in env) {
    return `<:_:${env[key as keyof Env]}>`;
  }
  return "❔";
};
