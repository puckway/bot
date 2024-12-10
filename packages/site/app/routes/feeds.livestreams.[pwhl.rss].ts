import { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { Feed } from "feed";
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser();

// Filters out livestreams from three sources and returns them as one feed
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { origin } = new URL(request.url);

  const feed = new Feed({
    id: "live:pwhl",
    title: "PWHL Livestreams",
    link: "https://www.thepwhl.com",
    description:
      "An aggregation of active livestreams for the PWHL across three channels: YouTube @thepwhlofficial, Twitch @thepwhl, and Twitch @thepwhl2",
    copyright: "Professional Women's Hockey League",
    ttl: 15,
    generator: "Puckway (https://puckway.shay.cat)",
    language: "en",
    feedLinks: { rss: `${origin}/feeds/livestreams/pwhl.rss` },
  });
  feed.addCategory("Sports");
  feed.addCategory("Hockey");

  const ytResponse = await fetch(
    "https://www.youtube.com/feeds/videos.xml?channel_id=UCNKUkQV2R0JKakyE1vuC1lQ",
    { method: "GET", headers: { Accept: "text/xml,application/xml" } },
  );
  if (ytResponse.ok) {
    const ytFeed = parser.parse(await ytResponse.text()).feed;
    const entries = ytFeed.entry as YTFeedEntry[];
    for (const video of entries) {
      if (!video["yt:videoId"]) continue;
      const link = `https://www.youtube.com/watch?v=${video["yt:videoId"]}`;
      const vidResponse = await fetch(link, { method: "GET" });
      if (vidResponse.ok) {
        const raw = await vidResponse.text();
        if (raw.includes(`{"key":"is_viewed_live","value":"True"}`)) {
          feed.addItem({
            id: video.id,
            title: video.title,
            link,
            date: new Date(video.published),
            published: new Date(video.published),
            image:
              "https://hockey-bot.s3.us-east-005.backblazeb2.com/leagues/pwhl.jpg",
            // description: video["media:group"].description,
            author: [video.author],
          });
          // Multiple livestreams may be active, so we don't break here
        } else {
          break;
        }
      }
    }
  }

  // They only ever stream 2 games at a time at most, but in
  // theory 3 could be played at the same time (6 teams)
  if (feed.items.length < 3) {
    for (const channel of ["thepwhl", "thepwhl2"]) {
      const twResponse = await fetch(
        `https://twitchrss.appspot.com/vod/${channel}`,
        { method: "GET", headers: { Accept: "text/xml,application/xml" } },
      );
      if (twResponse.ok) {
        const twFeed = parser.parse(await twResponse.text())?.rss?.channel;
        const vods = (twFeed.item ?? []) as TwitchFeedEntry[];
        const live = vods.find((v) => v.category === "live");
        if (live) {
          feed.addItem({
            id: `twitch:${live.category}:${live.guid}`,
            title: live.title.replace(/ - LIVE$/, ""),
            date: new Date(live.pubDate),
            published: new Date(live.pubDate),
            link: live.link,
            image:
              "https://hockey-bot.s3.us-east-005.backblazeb2.com/leagues/pwhl.jpg",
            author: [{ name: "ThePWHL", link: live.link }],
          });
        }
      }
    }
  }

  // The reader I made this for just reposts the base feed info
  // when there are no entries
  if (feed.items.length === 0) {
    feed.addItem({
      id: "pwhl:placeholder",
      title: "Placeholder",
      link: "https://thepwhl.com",
      description:
        "Prevents the items from being empty, confusing some readers",
      date: new Date(2024, 1, 1),
    });
  }

  return new Response(feed.rss2(), {
    status: 200,
    headers: { "Content-Type": "application/xml" },
  });
};

interface YTFeedEntry {
  id: string;
  "yt:videoId": string;
  "yt:channelId": string;
  title: string;
  link: string;
  author: { name: string; uri: string };
  published: string;
  updated: string;
  "media:group": {
    title: string;
    // description: string;
    // content: { url: string; type: string; width: string; height: string };
    // thumbnail: { url: string; width: string; height: string };
  };
}

interface TwitchFeedEntry {
  title: string;
  link: string;
  /** HTML */
  description: string;
  guid: number;
  /** `Date`-parseable */
  pubDate: string;
  category: string;
}
