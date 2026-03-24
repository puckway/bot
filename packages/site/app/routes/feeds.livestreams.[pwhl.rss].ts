import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { XMLParser } from "fast-xml-parser";
import { Feed } from "feed";

const parser = new XMLParser();

const youtubeStrategy = async (feed: Feed) => {
  try {
    const siteResponse = await fetch("https://www.thepwhl.com/en/pwhl-live-1", {
      method: "GET",
      headers: { Accept: "text/html" },
    });
    // They haven't streamed on twitch since 2024-25 so I'm not sure what this
    // page would look like for those games. There would probably be similar
    // indications of a twitch embed.
    const youtubeIds: string[] = [];
    if (siteResponse.ok) {
      const txt = await siteResponse.text();
      const matches = txt.matchAll(/"live-chat-panel-([\w-]+)"/g);
      for (const match of matches) {
        const [, id] = match;
        if (!youtubeIds.includes(id)) youtubeIds.push(id);
      }
      // We're only sure about getting info for one game right now, but this
      // element might simply be duplicated & sensibly in order for multiple
      // games (don't know yet!)
      if (youtubeIds.length === 1) {
        const infoMatch = txt.match(
          /<h2 style="text-align: ?center;">([^<]+)(?:<br>([^<]+))?(?:<br>([^<]+))?/,
        );
        if (infoMatch) {
          const videoId = youtubeIds[0];

          const [, matchup, date, time] = infoMatch;
          let title = matchup ?? `PWHL: ${videoId}`;
          if (date) title += ` - ${date}`;

          // Most of the season takes place during standard time so we have to
          // guess a little bit for convenience
          const dt = new Date(`${date} ${time.replace("ET", "EST")}`);
          feed.addItem({
            id: videoId,
            title,
            link: `https://www.youtube.com/watch?v=${videoId}`,
            date: dt,
            published: dt,
            image:
              "https://hockey-bot.s3.us-east-005.backblazeb2.com/leagues/pwhl.jpg",
            author: [{ name: "The PWHL", link: "https://www.thepwhl.com" }],
          });
          // We have sufficient video info so we don't need to fetch the RSS data
          return;
        }
      }
    }
    // Either our method broke or there are no upcoming streams. Our previous
    // method involved only the youtube feed, but I think youtube was detecting
    // that I was a bot when I fetched the page to see if it was a livestream,
    // and I didn't want to deal with that.
    if (youtubeIds.length === 0) return;

    // Fall back to youtube's rss feed to get the video title and date
    const ytResponse = await fetch(
      "https://www.youtube.com/feeds/videos.xml?channel_id=UCNKUkQV2R0JKakyE1vuC1lQ",
      { method: "GET", headers: { Accept: "text/xml,application/xml" } },
    );
    if (ytResponse.ok) {
      const ytFeed = parser.parse(await ytResponse.text()).feed;
      const entries = (
        Array.isArray(ytFeed.entry) ? ytFeed.entry : [ytFeed.entry]
      ) as YTFeedEntry[];

      for (const video of entries) {
        const videoId = video["yt:videoId"];
        if (!videoId) continue;
        if (!youtubeIds.includes(videoId)) continue;

        feed.addItem({
          id: video.id,
          title: video.title,
          link: `https://www.youtube.com/watch?v=${videoId}`,
          date: new Date(video.published),
          published: new Date(video.published),
          image:
            "https://hockey-bot.s3.us-east-005.backblazeb2.com/leagues/pwhl.jpg",
          author: [video.author],
        });
      }
    }
  } catch (e) {
    console.error(e);
  }
};

const twitchStrategy = async (feed: Feed): Promise<void> => {
  try {
    for (const channel of ["thepwhl", "thepwhl2"]) {
      const twResponse = await fetch(
        `https://twitchrss.appspot.com/vod/${channel}`,
        { method: "GET", headers: { Accept: "text/xml,application/xml" } },
      );
      if (twResponse.ok) {
        const twFeed = parser.parse(await twResponse.text())?.rss?.channel;
        if (!twFeed || !twFeed.item) continue;

        // if there's only one item it doesn't return an array
        const vods = (
          Array.isArray(twFeed.item) ? twFeed.item : [twFeed.item]
        ) as TwitchFeedEntry[];
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
  } catch (e) {
    console.error(e);
  }
};

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

  await Promise.all([youtubeStrategy(feed), twitchStrategy(feed)]);

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
