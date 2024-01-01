import { KhlMinimalPlayer } from "./players";
import { StageType, VideoAPIGetEvents } from "./video";

export interface KhlTeamArena {
  id: number;
  capacity: number;
  phone: string;
  website: string;
  name: string;
  address: string;
  city: string;
  image: string;
  geo: { lat: string; long: string };
}

export enum KhlStatId {
  GamesPlayed = "gp",
  Wins = "w",
  Losses = "l",
  Points = "pts",
  Goals = "gf",
  GoalsAllowed = "ga",
  PenaltyInMinutes = "pim",
  PenaltyInMinutesAgainst = "pima",
  // Players
  /** Minutes */
  TimeOnIce = "toi",
  /** Hours */
  TimeOnIceHours = "time_on_ice",
  /** Kilometers per hour */
  TopSpeed = "top_speed",
  /** Kilometers */
  DistanceSkated = "distance_travelled",
  // Skaters
  /** Minutes */
  GameAverageTimeOnIce = "toi_avg",
  GameAverageShifts = "sft_avg",
  FaceoffsWon = "fow",
  ShootoutWins = "sds",
  GameAveragePenaltyInMinutes = "pim_avg",
  PlusMinus = "pm",
  // Goalies
  ShootoutsPlayed = "sop",
  Saves = "sv",
  Shutouts = "so",
}

/** Some of these are the same as KhlStatId but the values are different and
 * would conflict confusingly with that enum. "LongStat" refers to the keys
 * tending away from abbreviations. */
export enum KhlLongStatId {
  Shots = "shots",
  Goals = "goals",
  Faceoffs = "fo",
  FaceoffsWon = "fow",
  TimeOnIce = "toi",
  Shifts = "si",
  PenaltyInMinutes = "pim",
  Hits = "hits",
  BlockedShots = "bls",
  /** Kilometers per hour */
  TopSpeed = "topSpeed",
  DistanceSkated = "distanceTravelled",
  Passes = "allPasses",
  SuccessfulPasses = "successfulPasses",
}

export interface KhlStat {
  id: KhlStatId;
  title: string;
  val: number;
  max: number;
  min?: number;
}

export type KhlLongStat = KhlStat & {
  id: KhlLongStat;
};

export interface KhlTeamWithDivision {
  id: number;
  khl_id: number;
  name: string;
  location: string;
  image: string;
  division: string;
  division_key: string;
  conference: string;
  conference_key: string;
}

export type KhlTeamWithInfo = KhlTeamWithDivision & {
  stage: StageType;
  feed_items: {
    type: "News";
    date: number;
    id: number;
    title: string;
    image: string | null;
    body: string;
    body_w_media: string;
    outer_url: string;
  }[];
  arena: KhlTeamArena;
  arenas: KhlTeamArena[];
  calendar_events: VideoAPIGetEvents;
  recent_events: VideoAPIGetEvents;
  website: string;
  mail: string;
  foundation_year: string;
  photo: string;
  phone: string;
  head_coach: {
    photo: string;
    name: string;
  };
  /** Strings may be empty */
  social_networks: {
    /** Twitter */
    tw: string;
    vk: string;
    ok: string;
    /** Facebook */
    fb: string;
    instagram: string;
    youtube: string;
    telegram: string;
  };
  apps: { ios: string; android: string; windows: string };
  address: string;
  stats: KhlStat[];
  players: KhlMinimalPlayer[];
};
