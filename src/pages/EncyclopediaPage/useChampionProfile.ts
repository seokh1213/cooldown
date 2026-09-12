import { useEffect, useState } from "react";
import type { DataLocale, StaticDataIdentity } from "@/data/contracts/staticData";
import type { ChampionProfile } from "@/data/contracts/championProfile";
import { gameDataRepository } from "@/data/repositories/gameDataRepository";

export function useChampionProfile(id: string, identity: StaticDataIdentity, locale: DataLocale) {
  const [result, setResult] = useState<{ key: string; profile?: ChampionProfile; error?: boolean }>();
  const [attempt, setAttempt] = useState(0);
  const key = `${identity.patchVersion}:${identity.sources.ddragon}:${identity.sources.cdragon}:${locale}:${id}`;
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    gameDataRepository.getChampionProfile(identity, locale, id).then(
      (profile) => { if (!cancelled) setResult({ key, profile }); },
      () => { if (!cancelled) setResult({ key, error: true }); },
    );
    return () => { cancelled = true; };
  }, [id, identity, key, locale, attempt]);
  return {
    profile: result?.key === key ? result.profile : undefined,
    error: result?.key === key && result.error,
    retry: () => { setResult(undefined); setAttempt((value) => value + 1); },
  };
}
