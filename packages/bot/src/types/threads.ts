export type ThreadsGraphQLResponse<T> = {
  data: T;
  extensions: Record<string, boolean>;
};

export interface ThreadsPageInfo {
  end_cursor: number | null;
  has_next_page: boolean;
  has_previous_page: boolean;
  start_cursor: number | null;
}

export type ThreadsPostType = "thread";

export interface XDTUserTextPostsResponseEdge {
  node: {
    thread_header_context: null;
    thread_items: XDTThreadItem[];
    thread_type: ThreadsPostType;
    id: string;
    __typename: "XDTThread";
  };
  __typename: "XDTUserTextPostsResponseEdge";
  cursor: string;
}

export type ThreadsCarouselMediaItem = Pick<
  ThreadsItemPost,
  | "accessibility_caption"
  | "has_audio"
  | "original_width"
  | "original_height"
  | "pk"
  | "video_versions"
  | "id"
> & {
  image_versions2: NonNullable<ThreadsItemPost["image_versions2"]>;
  code: string | null;
};

export interface ThreadsImageCandidate {
  height: number;
  width: number;
  url: string;
}

export interface ThreadsItemPost {
  pk: string;
  user: {
    friendship_status: null;
    id: null;
    pk: string;
    transparency_label: null;
    transparency_product: null;
    transparency_product_enabled: boolean;
    is_verified: boolean;
    username: string;
    profile_pic_url: string;
  };
  text_post_app_info: {
    is_post_unavailable: boolean;
    pinned_post_info: {
      is_pinned_to_profile: boolean;
      is_pinned_to_parent_post: boolean;
    };
    share_info: {
      reposted_post: null;
      quoted_post: null;
      __typename: "XDTShareInfo";
      can_quote_post: boolean;
      can_repost: boolean;
      is_reposted_by_viewer: boolean;
      repost_restricted_reason: "private";
    };
    reply_to_author: null;
    direct_reply_count: number;
    impression_count: null;
    hush_info: null;
    can_reply: boolean;
    is_reply: boolean;
    link_preview_attachment: null;
    fediverse_info: null;
    post_unavailable_reason: null;
  };
  id: string;
  is_paid_partnership: null;
  is_fb_only: null;
  is_internal_only: null;
  code: string;
  carousel_media: ThreadsCarouselMediaItem[] | null;
  image_versions2: {
    /** First item is highest resolution */
    candidates: ThreadsImageCandidate[];
  } | null;
  original_height: number;
  original_width: number;
  video_versions: null;
  like_count: number;
  audio: null;
  caption?: {
    text: string;
  };
  caption_is_edited: boolean;
  transcription_data: null;
  accessibility_caption: null;
  has_audio: null;
  media_type: number;
  has_liked: boolean;
  caption_add_on: null;
  giphy_media_info: null;
  text_with_entities: null;
  /** Timestamp in seconds */
  taken_at: number;
  organic_tracking_token: string;
  media_overlay_info: null;
  like_and_view_counts_disabled: boolean;
}

export interface XDTThreadItem {
  post: ThreadsItemPost;
  reply_facepile_users: Array<unknown>;
  line_type: string;
  should_show_replies_cta: boolean;
  __typename: "XDTThreadItem";
}

export type ThreadsAPIGetPosts = ThreadsGraphQLResponse<{
  mediaData: {
    edges: XDTUserTextPostsResponseEdge[];
    page_info: ThreadsPageInfo;
  };
  viewer: {
    user: null;
  };
}>;
