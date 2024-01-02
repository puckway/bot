import { KhlPlayer } from "../types/players";
import { APIBaseEnum, KhlApiError, KhlClientMethodOptions, requestJson } from "./rest";

export const getPlayer = async (playerId: number, options?: KhlClientMethodOptions) => {
  const data = await requestJson<{ player: KhlPlayer }[]>(
    APIBaseEnum.KHL_WEBCASTER,
    "/khl_mobile/players_v2.json",
    {
      params: {
        "q[id_in][]": playerId,
        locale: options?.locale,
        stage_id: options?.stageId,
      }
    }
  );

  if (data.length === 0) {
    throw new KhlApiError("Player ID returned no results");
  }
  return data[0].player;
}
