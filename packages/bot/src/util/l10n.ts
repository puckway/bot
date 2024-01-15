import { APIInteraction } from "discord-api-types/v10";
import { InteractionContext } from "../interactions";

export const getKhlLocale = (
  ctx: InteractionContext<APIInteraction>,
  defaultLocale?: string,
) => {
  const locale = ctx.getLocale(defaultLocale);
  if (locale.endsWith("CN")) {
    return "cn";
  } else if (locale === "ru") {
    return "ru";
  }
  return "en";
};

export const getHtLocale = (
  ctx: InteractionContext<APIInteraction>,
  defaultLocale?: string,
) => {
  const locale = ctx.getLocale(defaultLocale);
  return locale === "fr" ? "fr" : "en";
};

export const getKeyableLocale = (
  ctx: InteractionContext<APIInteraction>,
  defaultLocale?: string,
) => {
  const locale = ctx.getLocale(defaultLocale);
  if (locale.endsWith("CN")) return "cn";
  switch (locale) {
    case "ru":
    case "fr":
      return locale;
    default:
      return "en";
  }
};

export const transformLocalizations =
  <T>(localizations: T) =>
  (ctx: InteractionContext<APIInteraction>, key: string): string => {
    const locale = getKeyableLocale(ctx) as keyof T;
    const engStrings = localizations["en" as keyof T];
    const strings = localizations[locale];
    if (strings && key in (strings as Record<string, string>)) {
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
