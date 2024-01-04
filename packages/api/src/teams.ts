import { KhlTeamWithDivision, KhlTeamWithInfo } from "../types/teams";
import { APIBaseEnum, KhlClientMethodOptions, requestJson } from "./rest";

// I didn't want to hardcode the teams like this but it tends to make a lot of
// things easier, especially since the API is scant on providing abbreviations.
// I implemented this in particular for autocomplete to deal less with caching.
export const allTeams: {
  id: number;
  khl_id: number;
  names: { en: string; ru: string };
  locations: { en: string; ru: string };
  abbreviations: { en: string; ru: string };
}[] = [
  {
    id: 18,
    khl_id: 7,
    names: { en: "Spartak", ru: "Спартак" },
    locations: { en: "Moscow", ru: "Москва" },
    abbreviations: { en: "SPR", ru: "СПР" },
  },
  {
    id: 30,
    khl_id: 37,
    names: { en: "Metallurg Mg", ru: "Металлург Мг" },
    locations: { en: "Magnitogorsk", ru: "Магнитогорск" },
    abbreviations: { en: "MMG", ru: "ММГ" },
  },
  {
    id: 26,
    khl_id: 1,
    names: { en: "Lokomotiv", ru: "Локомотив" },
    locations: { en: "Yaroslavl", ru: "Ярославль" },
    abbreviations: { en: "LOK", ru: "ЛОК" },
  },
  {
    id: 44,
    khl_id: 24,
    names: { en: "SKA", ru: "СКА" },
    locations: { en: "Saint Petersburg", ru: "Санкт-Петербург" },
    abbreviations: { en: "SKA", ru: "СКА" },
  },
  {
    id: 8,
    khl_id: 719,
    names: { en: "Dynamo Msk", ru: "Динамо М" },
    locations: { en: "Moscow", ru: "Москва" },
    abbreviations: { en: "DYN", ru: "ДИН" },
  },
  {
    id: 10,
    khl_id: 34,
    names: { en: "Avangard", ru: "Авангард" },
    locations: { en: "Omsk Region", ru: "Омск" },
    abbreviations: { en: "AVG", ru: "АВГ" },
  },
  {
    id: 32,
    khl_id: 38,
    names: { en: "Salavat Yulaev", ru: "Салават Юлаев" },
    locations: { en: "Ufa", ru: "Уфа" },
    abbreviations: { en: "SAL", ru: "СЮЛ" },
  },
  {
    id: 56,
    khl_id: 190,
    names: { en: "Avtomobilist", ru: "Автомобилист" },
    locations: { en: "Ekaterinburg", ru: "Екатеринбург" },
    abbreviations: { en: "AVT", ru: "АВТ" },
  },
  {
    id: 105,
    khl_id: 66,
    names: { en: "Lada", ru: "Лада" },
    locations: { en: "Togliatti", ru: "Тольятти" },
    abbreviations: { en: "LAD", ru: "ЛАД" },
  },
  {
    id: 22,
    khl_id: 26,
    names: { en: "Torpedo", ru: "Торпедо" },
    locations: { en: "Nizhny Novgorod", ru: "Нижний Новгород" },
    abbreviations: { en: "TOR", ru: "ТОР" },
  },
  {
    id: 28,
    khl_id: 25,
    names: { en: "Traktor", ru: "Трактор" },
    locations: { en: "Chelyabinsk", ru: "Челябинск" },
    abbreviations: { en: "TRK", ru: "ТРК" },
  },
  {
    id: 40,
    khl_id: 53,
    names: { en: "Ak Bars", ru: "Ак Барс" },
    locations: { en: "Kazan", ru: "Казань" },
    abbreviations: { en: "AKB", ru: "АКБ" },
  },
  {
    id: 24,
    khl_id: 29,
    names: { en: "Sibir", ru: "Сибирь" },
    locations: { en: "Novosibirsk Region", ru: "Новосибирская область" },
    abbreviations: { en: "SIB", ru: "СИБ" },
  },
  {
    id: 16,
    khl_id: 2,
    names: { en: "CSKA", ru: "ЦСКА" },
    locations: { en: "Moscow", ru: "Москва" },
    abbreviations: { en: "CSK", ru: "ЦСК" },
  },
  {
    id: 42,
    khl_id: 56,
    names: { en: "Severstal", ru: "Северсталь" },
    locations: { en: "Cherepovets", ru: "Череповец" },
    abbreviations: { en: "SEV", ru: "СЕВ" },
  },
  {
    id: 12,
    khl_id: 54,
    names: { en: "Amur", ru: "Амур" },
    locations: { en: "Khabarovsk", ru: "Хабаровск" },
    abbreviations: { en: "AMR", ru: "АМР" },
  },
  {
    id: 36,
    khl_id: 71,
    names: { en: "Neftekhimik", ru: "Нефтехимик" },
    locations: { en: "Nizhnekamsk", ru: "Нижнекамск" },
    abbreviations: { en: "NKH", ru: "НХК" },
  },
  {
    id: 38,
    khl_id: 207,
    names: { en: "Dinamo Mn", ru: "Динамо Мн" },
    locations: { en: "Minsk", ru: "Минск" },
    abbreviations: { en: "DMN", ru: "ДМН" },
  },
  {
    id: 46,
    khl_id: 198,
    names: { en: "Barys", ru: "Барыс" },
    locations: { en: "Astana", ru: "Астана" },
    abbreviations: { en: "BAR", ru: "БАР" },
  },
  {
    id: 61,
    khl_id: 418,
    names: { en: "Admiral", ru: "Адмирал" },
    locations: { en: "Vladivostok", ru: "Владивосток" },
    abbreviations: { en: "ADM", ru: "АДМ" },
  },
  {
    id: 34,
    khl_id: 19,
    names: { en: "Vityaz", ru: "Витязь" },
    locations: { en: "Moscow Region", ru: "Московская область" },
    abbreviations: { en: "VIT", ru: "ВИТ" },
  },
  {
    id: 315,
    khl_id: 568,
    names: { en: "Kunlun RS", ru: "Куньлунь РС" },
    locations: { en: "Beijing", ru: "Пекин" },
    abbreviations: { en: "KRS", ru: "КРС" },
  },
  {
    id: 113,
    khl_id: 451,
    names: { en: "HC Sochi", ru: "ХК Сочи" },
    locations: { en: "Sochi", ru: "Сочи" },
    abbreviations: { en: "SCH", ru: "СОЧ" },
  },
];

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
