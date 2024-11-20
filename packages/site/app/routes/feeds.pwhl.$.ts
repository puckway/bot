import { json, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { Feed } from "feed";

const base = "https://www.thepwhl.com";

// In Nov 2024, the PWHL removed their RSS feed and refactored the news page.
// This endpoint re-creates the news feed via their API.
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { "*": file } = params;
  const [locale, extension] = (file ?? "").split(".");
  if (!locale || !["fr", "en"].includes(locale)) {
    return json({ message: "Invalid locale" }, 400);
  }
  if (!extension || !["rss", "atom", "json"].includes(extension)) {
    return json({ message: "Invalid extension" }, 400);
  }
  const { origin, searchParams } = new URL(request.url);
  const tags = searchParams.get("tags")?.split(",") ?? ["News"];
  const matchAllTags = searchParams.get("all-tags") === "true";

  const response = await fetch(`${base}/api/featuredContent`, {
    method: "POST",
    body: JSON.stringify({
      contentFilter: {
        content_types: {
          // entries_available must be specified (and not 0) or nothing can be returned
          article: { entries_available: 21, entries_loaded: 0 },
        },
        content_tags: tags,
        match_all_tags: matchAllTags,
        limit: 20,
        more_entries_to_load: true,
      },
      langCode: locale,
    }),
    headers: { "Content-Type": "application/json", Accept: "application/json" },
  });
  // console.log(response.status, await response.text())
  const data = (await response.json()) as PWHLGetFeaturedContent;

  const feed = new Feed({
    id: `pwhl-${locale}:${tags.join(",")}`,
    title: locale === "fr" ? "Nouvelles" : "News",
    copyright: "Professional Women's Hockey League",
    link: `${base}/${locale}/${locale === "fr" ? "nouvelles" : "news"}`,
    ttl: 10,
    generator: "Puckway (https://puckway.shay.cat)",
    language: locale,
    feedLinks: {
      rss: `${origin}/feeds/pwhl/${locale}.rss`,
      atom: `${origin}/feeds/pwhl/${locale}.atom`,
      json: `${origin}/feeds/pwhl/${locale}.json`,
    },
  });
  for (const tag of data.content_filters.content_tags) feed.addCategory(tag);
  feed.addCategory("Sports");
  feed.addCategory("Hockey");

  for (const entry of data.entries) {
    feed.addItem({
      id: entry.uid,
      link: `${base}${entry.url}`,
      title: entry.title,
      description: entry.description.replace(entry.title, "").trim(),
      date: new Date(entry.date),
      image: entry.preview_image[0]?.secure_url,
      category: entry.tags.map((tag) => ({ name: tag.title })),
    });
  }

  switch (extension) {
    case "rss": {
      return new Response(feed.rss2(), {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }
    case "atom": {
      return new Response(feed.atom1(), {
        status: 200,
        headers: { "Content-Type": "application/rss+xml" },
      });
    }
    case "json": {
      return new Response(feed.json1(), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  }
};

enum PWHLContentType {
  Article = "Article",
}

interface PWHLGetFeaturedContent {
  entries: {
    uid: string;
    type: PWHLContentType;
    content_type: PWHLContentType;
    card_type: string;
    /** Relative path */
    url: string;
    title: string;
    description: string;
    preview_image: [
      {
        public_id: string;
        resource_type: "image";
        type: string;
        format: string;
        version: number;
        url: string;
        secure_url: string;
        width: number;
        height: number;
        bytes: number;
        access_mode: string;
      },
    ];
    show_button: boolean;
    date: string;
    /** Locale code (like en-us) */
    token: string;
    tags: {
      uid: string;
      seo_id: string;
      url: string;
      title: string;
      display_title: string;
    }[];
    thumbnail_image: Array<unknown>;
  }[];
  content_filters: {
    content_types: Record<
      string,
      { entries_available: number; entries_loaded: number }
    >;
    content_tags: string[];
    match_all_tags: boolean;
    limit: number;
    more_entries_to_load: boolean;
  };
}
