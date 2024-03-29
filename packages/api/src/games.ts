import {
  APIRouteBases,
  type RESTGetAPIEvent,
  type RESTGetAPIEvents,
  Routes,
} from "khl-api-types";
import { KhlClientMethodOptions, requestJson } from "./rest";

export const getGames = async (
  options?: KhlClientMethodOptions & {
    date?: Date;
    /** Stage ID takes precedent over date insofar as retrieving games from a
     * specific timeframe. This is useful if you want games from a season
     * that you can find in `data.json`, but you do not have a `Date`.
     */
    stageId?: number;
  },
) => {
  const day = options?.date ?? new Date();
  const time = Math.ceil(day.getTime() / 1000);

  // This endpoint seems decrepit and we might not want to use it
  // const data = await requestJson<VideoAPIGetCalendarEvents>(
  //   APIBaseEnum.VIDEO_API,
  //   "/calendar_events",
  //   { params: { time, locale: options?.language } },
  // );

  // This is not strictly required since it defaults to the current ID
  // const { current_stage_id } = await requestJson<VideoAPIGetSiteData>(
  //   APIBaseEnum.VIDEO_API,
  //   "/khl_site/data.json",
  // );

  const data = await requestJson<RESTGetAPIEvents>(
    APIRouteBases.khl,
    Routes.events(),
    {
      params: {
        locale: options?.locale,
        stage_id: options?.stageId,
        "q[start_at_lt_time_from_unixtime]": time,
        order_direction: "desc",
      },
    },
  );

  return data.map((e) => e.event);
};

export const getGame = async (
  eventId: number,
  options?: KhlClientMethodOptions,
) => {
  const data = await requestJson<RESTGetAPIEvent>(
    APIRouteBases.khl,
    Routes.event(),
    {
      params: {
        id: eventId,
        locale: options?.locale,
      },
    },
  );

  return data.event;
};
