import { VideoAPIEvent, VideoAPIEventTeam } from "./games";
import { KhlEvent } from "./webcaster";

export interface VideoAPITeam {
  id: number;
  khl_id: number;
  name: string;
  image: string;
  tickets_site: string | null;
  about_team: string;
}

export type StageType = "regular" | "playoff";

export interface VideoAPIStage {
  id: number;
  khl_id: number;
  title: string;
  type: StageType;
  season: string;
  percent_points_scored: boolean;
}

export interface VideoAPIGetSiteData {
  safe_live_shift: number;
  stages_v2: VideoAPIStage[];
  about_khl: null;
  current_stage_id: number;
  mastercard_enabled_stage_ids: number[];
  android_app_version: string;
  ios_app_version: string;
  server_time: number;
  remote_ip: string;
  teams: VideoAPITeam[];
  /** Includes divisions as pseudo-teams */
  teams_for_filter: VideoAPITeam[];
  current_customer: null;
  push_notification_subscriptions: Array<unknown>;
  transaction_types: {
    id: number;
    android_app_product_id?: string;
    ios_app_product_id?: string;
    season: boolean;
    events_filter_rule: string;
    event_ids?: string;
    teams_filter_rule: string;
    team_ids?: string;
    stages_filter_rule: string;
    stage_ids?: string;
    description?: string;
    custom_data: null;
    amount: number;
    name: string;
  }[];
  transactions: Array<unknown>;
  mqtt_broker: {
    host: string;
    port: number;
    secure: boolean;
    event_topic: string;
  };
  mastercard_api: string;
  stages: string[];
  sms_data: unknown;
  server_day: number;
  test_event: KhlEvent;
  stat_url: string;
  exchange_rate_usd: number;
  video_types: {
    id: string;
    title: string;
  }[];
  selections: {
    url: string;
    name: string;
  }[];
  balance_payment_services: {
    id: string;
    title: string;
    desc: string;
  }[];
  geo_error: null;
  country: string;
}

export type VideoAPIGetEvents = { event: KhlEvent }[];

export type VideoAPIGetCalendarEvents = VideoAPIEvent[];

export interface VideoAPIGetGameInfo {
  live: boolean;
  score: string;
  team_a: VideoAPIEventTeam;
  team_b: VideoAPIEventTeam;
}
