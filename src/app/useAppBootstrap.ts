import { useCallback, useEffect, useState } from "react";
import type { Language } from "@/i18n";
import type { Champion } from "@/types";
import { getChampionList } from "@/data/queries/championQueries";
import { championRepository } from "@/data/repositories/championRepository";
import { gameDataRepository } from "@/data/repositories/gameDataRepository";
import { manifestRepository } from "@/data/repositories/manifestRepository";
import type { StaticDataSources } from "@/data/contracts/staticData";

export interface AppRuntimeData {
  patchVersion: string;
  sources: StaticDataSources;
  championList: Champion[];
}

type BootstrapState =
  | { status: "loading" }
  | { status: "ready"; data: AppRuntimeData }
  | { status: "error"; error: Error };

export function useAppBootstrap(language: Language): {
  state: BootstrapState;
  retry: () => void;
} {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<BootstrapState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    void (async () => {
      try {
        const manifest = await manifestRepository.get();
        championRepository.clearExceptPatch(manifest.patchVersion);
        gameDataRepository.clearExceptPatch(manifest.patchVersion);
        const championList = await getChampionList(
          manifest.patchVersion,
          language
        );
        if (!active) return;
        if (championList.length === 0) {
          throw new Error("Champion data is empty");
        }
        setState({ status: "ready", data: { ...manifest, championList } });
      } catch (value) {
        if (!active) return;
        const error = value instanceof Error ? value : new Error(String(value));
        setState({ status: "error", error });
      }
    })();
    return () => {
      active = false;
    };
  }, [language, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { state, retry };
}
