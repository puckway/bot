import { KhlPlayerRoleKey } from "./players";
import { KhlLongStat, KhlTeamArena } from "./teams";
import { StageType } from "./video";

export type KhlGameStateKey = "not_yet_started" | "in_progress" | "finished";

// All of these are from site data except for
// PlayoffMoment, Broadcast, and Top10
export enum KhlEventTypeId {
  // Type 2 events do not seem to have a type name.
  // It is probably deprecated because the only examples
  // I could find were from the 2013 postseason, including
  // many GoPro clips of the postgame(s). One was labeled
  // Salei cup (likely https://internationalhockeywiki.com/ihw?curid=11169).
  // PlayoffMoment = 2,
  Highlight = 4,
  Moment = 6,
  BodyCheck = 10,
  Penalty = 18,
  Broadcast = 24,
  Goal = 28,
  ScoringChance = 30,
  Save = 32,
  Fight = 34,
  Shootout = 36,
  Top10 = 37,
  ShootoutSeries = 38,
  InterestingMoment = 45,
}

export interface KhlEventTeam {
  id: number;
  khl_id: number;
  image: string;
  tv_image?: string;
  name: string;
  location: string;
}

export interface KhlMinimalEvent {
  id: number;
  score: string;
  type_id: KhlEventTypeId;
  /** KHL.ru game ID (type_id 2) */
  khl_id: number;
  /** Home */
  team_a: KhlEventTeam;
  /** Away */
  team_b: KhlEventTeam;
  name: string;
  /** Timestamp in ms */
  start_at: number;
  /** Timestamp in ms */
  event_start_at: number;
  /** Timestamp in ms */
  end_at: number;
  scores: {
    first_period: string | null;
    second_period: string | null;
    third_period: string | null;
    overtime: string | null;
    /** Буллит - untranslated for some reason. It means shootout (or perhaps penalty shot?) */
    bullitt: string | null;
  };
}

export type KhlBalancerType = "file" | "record" | "quote" | "live";

export interface KhlEvent extends KhlMinimalEvent {
  game_state_key: KhlGameStateKey;
  /** Could be `-1` for a `finished` game */
  period: number | null;
  hd: boolean;
  stage_id: number | null;
  commentator: boolean;
  likes_enabled: boolean | null;
  tickets: string | null;
  location: string | null;
  /** Timestamp in seconds */
  start_at_day: number;
  not_regular: boolean | null;
  score: string;
  sscore: null;
  image: string;
  condensed_game_id: null;
  highlight_id: null;
  infographics: string;
  infographics_enabled: boolean;
  has_video: boolean;
  m3u8_url: string | null;
  feed_url: string | null;
  iframe_url: string | null;
  iframe_code: string | null;
  free: boolean;
  yandex_rights: boolean;
  yandex_id: string | null;
  match_id: string | null;
  balancer_type: KhlBalancerType;
  event_or_quote_type_name: string | null;
  /** KHL.ru season ID */
  outer_stage_id: number | null;
  /** Season name, e.g. Regular 2023/2024 */
  stage_name: string | null;
}

export interface KhlEventTeamWithInfoPlayer {
  id: number;
  khl_id: number;
  shirt_number: number;
  name: string;
  role_key: KhlPlayerRoleKey;
  image: string | null;
}

export interface KhlEventTeamWithInfo extends KhlEventTeam {
  shots: number;
  gf: number;
  ppg: number;
  shg: number;
  ppc: number;
  vbr: number;
  pim: number;
  total_puck_control_time: number;
  total_distance_travelled: number;
  offensive_blue_line_crossings_count: number;
  top_players: {
    id:
      | "hardestShot"
      | "playerWithMostDistanceTravelled"
      | "playerWithHighestTopSpeed";
    name: string;
    value: string;
    player: Omit<KhlEventTeamWithInfoPlayer, "role_key">;
  }[];
  start_fives: KhlEventTeamWithInfoPlayer;
  players: Array<
    KhlEventTeamWithInfoPlayer & {
      match_stats: KhlLongStat[];
    }
  >;
  active: boolean;
}

export interface KhlGenericEvent {
  id: number;
  start_ts: number;
  finish_ts: number;
  description: string;
  image_url: string;
  m3u8_url: string;
  feed_url: string;
  iframe_url: string;
  iframe_code: string;
  audio_tracks: { id: string; title: string }[];
  stage_id: number;
  free: boolean;
  yandex_rights: boolean;
  yandex_id: string | null;
  match_id: string;
  balancer_type: KhlBalancerType;
  event_or_quote_type_name: string;
  outer_stage_id: number;
  stage_name: string;
}

export interface KhlEventQuote extends KhlGenericEvent {
  quote_type_name_key: string;
  quote_type_name: string;
  balancer_type: "quote";
}

export interface KhlEventGoal {
  time: number;
  score: string;
  period: number;
  status: string;
  status_abbr: string;
  assistants: { shirt_number: number; name: string; aps: number }[];
  author: {
    shirt_number: number;
    name: string;
    gps: number;
    team_id: number;
  };
  quote: KhlEventQuote;
}

export interface KhlEventViolation {
  time: number;
  penalty_time: number;
  period: number;
  penalty_reason: string;
  violator: {
    shirt_number: number;
    name: string;
    team_id: number;
    team: { id: number };
  };
  quote: KhlEventQuote;
}

export enum KhlTextEventType {
  Info = "info",
  Goal = "goal",
  GoaltenderChange = "replace",
  State = "state",
  Penalty = "violation",
}

export interface KhlTextEvent {
  seconds: number;
  type: KhlTextEventType;
  period: number | null;
  time_s: string;
  text: string;
  score: string;
  m3u8_url: string | null;
  feed_url: string | null;
  iframe_url: string | null;
  iframe_code: string | null;
  quote_id: number | null;
  quote_name: string | null;
  stage_id: number;
  free: boolean;
  yandex_rights: boolean;
  yandex_id: string | null;
  match_id: string;
  balancer_type: KhlBalancerType | null;
  event_or_quote_type_name: string | null;
  outer_stage_id: number;
  stage_name: string;
}

export interface KhlTransactionType {
  id: number;
  android_app_product_id: string;
  ios_app_product_id: string;
  smarttv_app_product_id: string;
  name: string;
  time: number;
  amount: number;
  season: boolean;
  events_filter_rule: string;
  event_ids: string;
  teams_filter_rule: string;
  team_ids: string;
  stages_filter_rule: string;
  stage_ids: string;
  description: string;
  custom_data: unknown | null;
}

export interface KhlEventWithInfo extends KhlEvent {
  season: string;
  arena: KhlTeamArena;
  team_a: KhlEventTeamWithInfo;
  team_b: KhlEventTeamWithInfo;
  quotes: { quote: KhlEventQuote }[];
  goals: KhlEventGoal[];
  violations: KhlEventViolation[];
  other_events_with_both_teams: {
    event: KhlMinimalEvent;
  }[];
  social_tags: string[];
  stage_name: string;
  parent_id: number | null;
  mref1: string;
  mref2: string;
  lref1: string;
  lref2: string;
  announce: null;
  views: string;
  stage_type: StageType;
  audio_tracks: { id: string; title: string }[];
  image_big: string | null;
  text_events: KhlTextEvent[];
  condensed_game: KhlGenericEvent;
  highlight: KhlGenericEvent;
  outer_url: string;
  this_pair_stat: {
    events_count: number;
    team_a: { wins_count: number; goals_count: number; points_count: number };
    team_b: { wins_count: number; goals_count: number; points_count: number };
  };
  transaction_types: KhlTransactionType[];
  commentators_names: string;
  bets: {
    team_a_win: number;
    draw: number;
    team_b_win: number;
    url: string;
  };
  transactions: Array<unknown>;
  geo_error: null;
}
