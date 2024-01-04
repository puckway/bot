import { Env } from "..";

export const khlTeamEmoji = (env: Env, team: { id: number }) =>
  `<:_:${env[`KHL_TEAM_EMOJI_${team.id}` as keyof Env]}>`;
