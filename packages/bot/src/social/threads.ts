import { EmbedBuilder } from "@discordjs/builders";
import { Env } from "..";
import { League } from "../db/schema";
import { ThreadsAPIGetPosts, ThreadsItemPost } from "../types/threads";
import { colors, getTeamColor } from "../util/colors";

// I'm using Threads because my options are basically between Twitter and
// Threads, and I don't want to use Twitter.

/** `league`.`teamId` to Threads account ID */
export const threadsIds: Partial<Record<League, Record<string, string>>> = {
  // Only these teams regularly post lineups, so we don't bother checking the others
  pwhl: {
    2: "61509961436",
    3: "61484996634",
    5: "61355202040",
  },
};

export const THREADS_BASE = "https://www.threads.net";

/*
  Thanks to https://github.com/m1guelpf/threads-re for his documentation
*/
export const findLatestLineupPost = async (
  league: League,
  teamId: string,
  // env: Env,
) => {
  const accountId = threadsIds[league]?.[teamId];
  if (accountId === undefined) {
    return undefined;
  }

  // const deviceId_ = await env.KV.get("threads_device_id");
  // const did = deviceId_ ?? `android-${(Math.random() * 1e24).toString(36)}`;
  // if (!deviceId_) {
  //   await env.KV.put("threads_device_id", did);
  // }

  const lsd = "";
  const response = await fetch(`${THREADS_BASE}/api/graphql`, {
    headers: {
      "User-Agent": "Mozilla/5.0 Firefox/122.0",
      "Content-Type": "application/x-www-form-urlencoded",
      "X-IG-App-ID": "238260118697367",
      "X-FB-LSD": lsd,
      "Sec-Fetch-Site": "same-origin",
    },
    body: new URLSearchParams({
      lsd,
      variables: JSON.stringify({
        userID: accountId,
        __relay_internal__pv__BarcelonaIsThreadContextHeaderEnabledrelayprovider: false,
        __relay_internal__pv__BarcelonaOptionalCookiesEnabledrelayprovider: true,
        // __relay_internal__pv__BarcelonaIsLoggedInrelayprovider: false,
        __relay_internal__pv__BarcelonaIsViewCountEnabledrelayprovider: false,
        // __relay_internal__pv__BarcelonaShouldShowFediverseM075Featuresrelayprovider: false,
      }),
      doc_id: "24786876960957444",
    }),
    method: "POST",
  });
  const raw = (await response.json()) as ThreadsAPIGetPosts;

  const posts = raw.data.mediaData.edges.map(
    (e) => e.node.thread_items[0].post,
  );
  const now = new Date().getTime();
  const possiblePosts = posts.filter((p) => {
    const caption = p.caption?.text?.toLowerCase() ?? "";
    return (
      // Post must be from at most 1 day ago
      now / 1000 - p.taken_at <= 86400 &&
      (caption.includes("lineup") ||
        caption.includes("starters") ||
        (caption.includes("start") &&
          (caption.includes("today") || caption.includes("tonight")))) &&
      p.user.pk === accountId
    );
  });

  return possiblePosts;
};

export const getThreadsPostEmbed = (
  post: ThreadsItemPost,
  league?: League,
  teamId?: string,
) => {
  const url = `${THREADS_BASE}/@${post.user.username}/post/${post.code}`;
  const embed = new EmbedBuilder()
    .setColor(
      league && teamId
        ? getTeamColor(league, teamId)
        : league
          ? colors[league]
          : colors.main,
    )
    .setAuthor({
      name: post.user.username,
      url: `${THREADS_BASE}/@${post.user.username}`,
      iconURL: post.user.profile_pic_url || undefined,
    })
    .setURL(url)
    .setDescription(post.caption?.text ?? null)
    .setTimestamp(post.taken_at * 1000);

  const imageEmbeds: EmbedBuilder[] = [];

  if (post.image_versions2?.candidates?.length) {
    embed.setImage(post.image_versions2.candidates[0].url);
  }
  if (post.carousel_media && post.carousel_media.length > 1) {
    // Skip the first one and keep the next 3
    for (const media of post.carousel_media.slice(1, 4)) {
      imageEmbeds.push(
        new EmbedBuilder()
          .setURL(url)
          .setImage(media.image_versions2.candidates[0].url),
      );
    }
  }

  if (!post.like_and_view_counts_disabled) {
    embed.setFooter({
      text: `${post.like_count} likes`,
    });
  }

  return [embed, ...imageEmbeds];
};
