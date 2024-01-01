import { KhlStat, KhlTeamWithDivision } from "./teams";
import { KhlEventQuote } from "./webcaster";

export type KhlPlayerRoleKey = "forward" | "defenseman" | "goaltender";

export interface KhlMinimalPlayer {
  id: number;
  khl_id: number;
  image: string | null;
  flag_image_url: string | null;
  g: number;
  a: number;
  role_key: KhlPlayerRoleKey;
  name: string;
  shirt_number: number;
  country: string;
}

export interface KhlPlayer extends Omit<KhlMinimalPlayer, "g" | "a"> {
  /** Centimeters */
  height: number;
  /** Kilograms */
  weight: number;
  /** Years */
  age: number;
  role: string;
  /** Timestamp in seconds */
  birthday: number | null;
  stick: "l" | "r" | null;
  team: KhlTeamWithDivision;
  stats: KhlStat[];
  teams: Omit<
    KhlTeamWithDivision,
    "division" | "division_key" | "conference" | "conference_key"
  > &
    { season: string }[];
  quotes: KhlEventQuote[];
  seasons_count: {
    khl: number;
    team: number;
  };
  positions: Array<unknown>;
}
