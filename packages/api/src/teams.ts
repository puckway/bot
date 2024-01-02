import { KhlTeamWithDivision, KhlTeamWithInfo } from "../types/teams";
import { APIBaseEnum, KhlClientMethodOptions, requestJson } from "./rest";

export const getTeams = async (options?: KhlClientMethodOptions) => {
  const data = await requestJson<{ team: KhlTeamWithDivision }[]>(
    APIBaseEnum.VIDEO_API,
    "/khl_mobile/teams_v2.json",
    {
      params: {
        locale: options?.locale,
      },
    },
  );

  return data.map((d) => d.team);
};

export const getTeam = async (
  teamId: number,
  options?: KhlClientMethodOptions & { stageId?: number },
) => {
  const { team } = await requestJson<{ team: KhlTeamWithInfo }>(
    APIBaseEnum.KHL_WEBCASTER,
    "/khl_mobile/team_v2.json",
    {
      params: {
        id: teamId,
        locale: options?.locale,
        stage_id: options?.stageId,
      },
    },
  );
  return team;
};
