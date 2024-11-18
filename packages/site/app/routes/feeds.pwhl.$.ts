import { json, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { Feed } from "feed";

const base = "https://www.thepwhl.com";

// In Nov 2024, the PWHL removed their RSS feed and refactored the news page.
// This new news page is using Vike (https://vike.dev) which injects the page
// data into a `script` tag called `vike_pageContent`, which we can parse out
// into an RSS-compatible response.
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { origin } = new URL(request.url);
  // const locale = searchParams.get("locale") ?? "en";
  const { "*": file } = params;
  const [locale, extension] = (file ?? "").split(".");
  if (!locale || !["fr", "en"].includes(locale)) {
    return json({ message: "Invalid locale" }, 400);
  }
  if (!extension || !["rss", "atom", "json"].includes(extension)) {
    return json({ message: "Invalid extension" }, 400);
  }

  const scrapeUrl = new URL("https://web.scraper.workers.dev");
  scrapeUrl.searchParams.set(
    "url",
    `${base}${locale === "en" ? "/en/news" : "/fr/nouvelles"}`,
  );
  const selector = 'script[type="application/json"]#vike_pageContext' as const;
  scrapeUrl.searchParams.set("selector", selector);
  scrapeUrl.searchParams.set("scrape", "text");
  const response = await fetch(scrapeUrl, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const data = (await response.json()) as {
    result: Record<typeof selector, string[]>;
  };
  const raw = data.result[selector][0];
  const parsed = JSON.parse(raw) as VikePageContext;
  const content = parsed.props.pageData.content.find(
    (c) => "featured_content" in c,
  );

  const feed = new Feed({
    id: parsed.props.pageData.uid,
    title: parsed.props.pageData.title,
    description: content?.featured_content.title,
    copyright: "Professional Women's Hockey League",
    link: `${base}${parsed.urlParsed.pathname}`,
    ttl: 10,
    generator: "Puckway (https://puckway.shay.cat)",
    language: parsed.props.langCode,
    // feedLinks: {
    //   rss: `${origin}/api/news/pwhl/${locale}.rss`,
    //   atom: `${origin}/api/news/pwhl/${locale}.atom`,
    //   json: `${origin}/api/news/pwhl/${locale}.json`,
    // },
  });
  feed.addCategory("News");
  feed.addCategory("Sports");
  feed.addCategory("Hockey");

  for (const item of content?.featured_content.entries ?? []) {
    feed.addItem({
      id: item.uid,
      link: `${base}${item.url}`,
      title: item.title,
      description: item.description.replace(item.title, "").trim(),
      date: new Date(item.date),
      image: item.preview_image[0]?.secure_url,
      category: item.tags.map((tag) => ({ name: tag.display_title })),
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

interface VikePageContext {
  pageProps: string;
  urlPathname: "/en/news";
  props: {
    domain: string;
    contentEnv: string;
    contentToken: string;
    content_type: string;
    langCode: string;
    layout: {
      site_header: unknown;
      site_footer: unknown;
      notifications: [];
    };
    pageData: {
      visible_title: string;
      page_type: string;
      header: string;
      link_strip: unknown;
      content: [
        { banana_block: { name: string; uid: string; className: string } },
        {
          featured_content: {
            title: string;
            layout_template: string;
            entries: {
              uid: string;
              type: string;
              content_type: string;
              card_type: string;
              /** Relative path */
              url: string;
              title: string;
              description: string;
              preview_image: {
                public_id: string;
                resource_type: "image";
                type: "upload";
                format: string;
                version: number;
                url: string;
                secure_url: string;
                width: number;
                height: number;
                bytes: number;
                access_mode: "public";
              }[];
              show_button: boolean;
              /** ISO 8601 */
              date: string;
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
              content_types: {
                article: { entries_available: number; entries_loaded: number };
              };
              content_tags: string[];
              match_all_tags: boolean;
              limit: number;
              more_entries_to_load: boolean;
            };
            _metadata: { uid: string };
          };
        },
      ];
      iframe_block: unknown;
      uid: string;
      url: string;
      title: string;
      contains_forms: false;
      content_tags: [];
      open_graph_settings: {
        preview_image: [];
        image_is_logo: boolean;
        title: string;
        url: string;
        type: string;
      };
      seo: unknown;
      disable_ads: boolean;
      page_layout: unknown;
      appVersion: string;
      consentValues: unknown;
      feature_flags: unknown;
      queryParams: Record<string, string>;
    };
    teamToken: string;
  };
  urlParsed: {
    href: string;
    protocol: string | null;
    hostname: string | null;
    port: string | null;
    origin: string | null;
    pathname: string;
    pathnameOriginal: string;
    search: Record<string, string>;
    searchAll: Record<string, string[]>;
    searchOriginal: string | null;
  };
  abortReason: string;
  _urlRewrite: string | null;
  _urlRedirect: string;
  abortStatusCode: string;
  _abortCall: string;
  _pageContextInitIsPassedToClient: boolean;
  _pageId: string;
  routeParams: unknown;
  data: string;
}
