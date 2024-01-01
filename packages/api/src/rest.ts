// import { JSDOM, ConstructorOptions } from "jsdom";

export const DocBaseEnum = {
  RU: "https://www.khl.ru",
  EN: "https://en.khl.ru",
  CN: "https://cn.khl.ru",
  TEXT: "https://text.khl.ru",
} as const;

export const APIBaseEnum = {
  WEBCASTER: "https://webcaster.pro/api",
  KHL_WEBCASTER: "https://khl.api.webcaster.pro/api",
  VIDEO_API: "https://api-video.khl.ru/api",
} as const;

export interface DocFetchOptions {
  base?: (typeof DocBaseEnum)[keyof typeof DocBaseEnum];
  // jsdom?: ConstructorOptions;
}

export interface JsonFetchOptions {
  method?: "GET";
  params?: Record<string, string | number | boolean | undefined>;
}

export interface KhlClientMethodOptions {
  language?: "RU" | "EN" | "CN";
  stageId?: number;
}

export class KhlApiError extends Error {}

export const requestJson = async <T>(
  base: (typeof APIBaseEnum)[keyof typeof APIBaseEnum],
  path: string,
  options?: JsonFetchOptions,
) => {
  const method = options?.method ?? "GET";
  const url = new URL(base + path);
  if (options?.params) {
    for (const [key, val] of Object.entries(options.params)) {
      if (val !== undefined) {
        url.searchParams.set(key, String(val));
      }
    }
  }

  const response = await fetch(url, {
    method,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new KhlApiError(
      `Failed to ${method} ${url.href} (${response.status}): ${text}`,
    );
  }

  return JSON.parse(text) as T;
};

// export const getParsableDoc = async (
//   path: string,
//   options?: DocFetchOptions,
// ) => {
//   // const method = options?.method ?? "GET";
//   const method = "GET";
//   const base = options?.base ?? DocBaseEnum.EN;
//   const url = base + path;
//   const response = await fetch(url, {
//     method,
//   });

//   const text = await response.text();
//   if (!response.ok) {
//     throw new KhlApiError(
//       `Failed to ${method} ${url} (${response.status}): ${text}`,
//     );
//   }

//   return new JSDOM(text, options?.jsdom).window.document;
// };
