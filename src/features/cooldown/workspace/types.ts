import type { Champion } from "@/domain/game/types";

export interface ChampionWithInfo extends Champion {
  fullInfo?: Champion;
  isLoading?: boolean;
  skinIndex?: number;
}
