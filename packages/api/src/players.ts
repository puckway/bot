import {
  Routes,
  type RESTGetAPIPlayers,
  type RESTGetAPIPlayersLight,
  APILightPlayer,
  APIPlayer,
  APIRouteBases,
} from "khl-api-types";
import { KhlApiError, KhlClientMethodOptions, requestJson } from "./rest";

export async function getPlayers(
  options?: KhlClientMethodOptions & {
    light: true;
  },
): Promise<APILightPlayer[]>;
export async function getPlayers(
  options?: KhlClientMethodOptions & {
    light: false | undefined;
  },
): Promise<APIPlayer[]>;
export async function getPlayers(
  options?: KhlClientMethodOptions & {
    light?: boolean;
  },
): Promise<APILightPlayer[] | APIPlayer[]> {
  if (options?.light) {
    return await requestJson<RESTGetAPIPlayersLight>(
      APIRouteBases.khl,
      Routes.playersLight(),
      {
        params: {
          locale: options?.locale,
          stage_id: options?.stageId,
        },
      },
    );
  }
  const data = await requestJson<RESTGetAPIPlayers>(
    APIRouteBases.khl,
    Routes.players(),
    {
      params: {
        locale: options?.locale,
        stage_id: options?.stageId,
      },
    },
  );
  return data.map((d) => d.player);
}

export async function getPlayer(
  playerId: number,
  options?: KhlClientMethodOptions & {
    light: false | undefined;
  },
): Promise<APIPlayer>;
export async function getPlayer(
  playerId: number,
  options?: KhlClientMethodOptions & {
    light: true;
  },
): Promise<APILightPlayer>;
export async function getPlayer(
  playerId: number,
  options?: KhlClientMethodOptions & {
    light?: boolean;
  },
): Promise<APILightPlayer | APIPlayer> {
  if (options?.light) {
    const data = await requestJson<RESTGetAPIPlayersLight>(
      APIRouteBases.khl,
      Routes.playersLight(),
      {
        params: {
          "q[id_in][]": playerId,
          locale: options?.locale,
          stage_id: options?.stageId,
        },
      },
    );

    if (data.length === 0) {
      throw new KhlApiError("Player ID returned no results");
    }
    return data[0];
  }
  const data = await requestJson<RESTGetAPIPlayers>(
    APIRouteBases.khl,
    Routes.players(),
    {
      params: {
        "q[id_in][]": playerId,
        locale: options?.locale,
        stage_id: options?.stageId,
      },
    },
  );

  if (data.length === 0) {
    throw new KhlApiError("Player ID returned no results");
  }
  return data[0].player;
}
