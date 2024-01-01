export interface VideoAPIEventTeam {
  name: string;
  location: string;
  image: string;
}

export interface VideoAPIEvent {
  id: number;
  condensed_game_id: number | null;
  highlight_id: number | null;
  quality: "HD";
  score: string;
  price: number | null;
  type: "past" | "future";
  start_date: string;
  start_time: string;
  team_a: VideoAPIEventTeam;
  team_b: VideoAPIEventTeam;
}
