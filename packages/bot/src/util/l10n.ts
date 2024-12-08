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
  <
    L extends Record<string, string>,
    T extends {
      en: L;
      fr?: L;
      ru?: L;
      [key: string]: L | undefined;
    },
  >(
    localizations: T,
  ) =>
  (ctx: InteractionContext<APIInteraction> | string, key: keyof T["en"]) => {
    const locale = (
      typeof ctx === "string" ? ctx : getKeyableLocale(ctx)
    ) as keyof T;
    const engStrings = localizations.en;
    const strings = localizations[locale];
    if (strings && key in strings) {
      return strings[key as keyof Record<string, string>];
    }
    return engStrings[key] ?? key;
  };

/** Translations that we need in several places */
export const uni = transformLocalizations({
  en: {
    khl: "KHL",
    ahl: "AHL",
    pwhl: "PWHL",
    zhhl: "ZhHL",
    mhl: "MHL",
    ohl: "OHL",
    whl: "WHL",
    lhjmq: "QMJHL",
    sphl: "SPHL",
  },
  ru: {
    khl: "КХЛ",
    ahl: "АХЛ",
    pwhl: "ПЖХЛ",
    zhhl: "ЖХЛ",
    mhl: "MХЛ",
  },
  fr: {
    pwhl: "LPHF",
    ahl: "LAH",
    ohl: "LHO",
    lhjmq: "LHJMQ",
  },
});
