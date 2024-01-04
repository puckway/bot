import { APIInteraction } from "discord-api-types/v10";
import { InteractionContext } from "./interactions";

export const getKhlLocale = (
  ctx: InteractionContext<APIInteraction>,
  defaultLocale?: string,
) => {
  const locale = ctx.getLocale(defaultLocale);
  if (locale.endsWith("CN")) {
    return "CN";
  } else if (locale === "ru") {
    return "RU";
  }
  return "EN";
};

export const transformLocalizations =
  <T>(localizations: T) =>
  (ctx: InteractionContext<APIInteraction>, key: string): string => {
    const locale = getKhlLocale(ctx).toLowerCase() as keyof T;
    const engStrings = localizations["en" as keyof T];
    const strings = localizations[locale];
    if (key in (strings as Record<string, string>)) {
      // @ts-ignore
      return strings[key];
    }
    // @ts-ignore
    return engStrings[key] ?? key;
  };

/** Translations that we need in several places */
export const uni = transformLocalizations({
  en: {
    khl: "KHL",
    pwhl: "PWHL",
    zhhl: "ZhHL",
  },
  ru: {
    khl: "КХЛ",
    pwhl: "Пжхл",
    zhhl: "ЖХЛ",
  },
});
