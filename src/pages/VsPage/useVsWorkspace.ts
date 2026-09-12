import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { readStorage, writeStorage } from "@/data/storage/appStorage";
import { championRepository } from "@/data/repositories/championRepository";
import type { ChampionDetailV2 } from "@/data/contracts/championData";
import type {
  DataLocale,
  StaticDataIdentity,
} from "@/data/contracts/staticData";
import type { Champion } from "@/types";
import {
  parseVsState,
  serializeVsState,
  VS_STORAGE_KEY,
  type VsState,
} from "./vsState";

export function useVsState(champions: Champion[] | null) {
  const [params, setParams] = useSearchParams();
  const [saved] = useState(() => readStorage(VS_STORAGE_KEY) ?? "");
  const search = params.toString();
  const state = parseVsState(search || saved);
  const knownIds = new Set(champions?.map((champion) => champion.id));
  if (!knownIds.has(state.mine.id)) state.mine.id = "";
  if (!knownIds.has(state.opponent.id)) state.opponent.id = "";
  const serialized = serializeVsState(state);

  useEffect(() => {
    if (search && champions) writeStorage(VS_STORAGE_KEY, serialized);
  }, [champions, search, serialized]);

  useEffect(() => {
    if (!search && saved) setParams(saved, { replace: true });
  }, [saved, search, setParams]);

  const update = (next: VsState) => {
    const serialized = serializeVsState(next);
    writeStorage(VS_STORAGE_KEY, serialized);
    // An explicit empty selection keeps a reset from restoring the previous pair.
    setParams(serialized || "a=&t=", { replace: true });
  };
  return { state, update };
}

export function useVsChampion(input: {
  id: string;
  identity: StaticDataIdentity;
  locale: DataLocale;
}) {
  const { id, identity, locale } = input;
  const [result, setResult] = useState<{
    key: string;
    detail?: ChampionDetailV2;
    error?: boolean;
  }>();
  const [attempt, setAttempt] = useState(0);
  const key = `${identity.patchVersion}:${identity.sources.ddragon}:${identity.sources.cdragon}:${locale}:${id}`;
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    championRepository.getDetail(identity, locale, id).then(
      (detail) => {
        if (!cancelled) setResult({ key, detail });
      },
      () => {
        if (!cancelled) setResult({ key, error: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, identity, key, locale, attempt]);
  return {
    detail: result?.key === key ? result.detail : undefined,
    error: result?.key === key && result.error,
    retry: () => {
      setResult(undefined);
      setAttempt((value) => value + 1);
    },
  };
}
