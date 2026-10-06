import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { createStaticDataClient } from "@/data/http/staticDataClient";
import { decodePatchNotesIndex, decodePatchNotesReport, type PatchNotesIndex, type PatchNotesReport } from "@/data/contracts/patchNotes";

const client = createStaticDataClient();

export function usePatchNotes() {
  const [params, setParams] = useSearchParams();
  const [index, setIndex] = useState<PatchNotesIndex>();
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState<{ patch: string; report?: PatchNotesReport; failed?: boolean }>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    client.getJson("patch-notes/index.json", decodePatchNotesIndex).then(value => {
      if (active) { setIndex(decodePatchNotesIndex(value)); setError(false); }
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [attempt]);

  const available = index?.patches.filter(record => record.previousPatchVersion !== null);
  const patch = available?.find(record => record.patchVersion === params.get("patch")) ??
    available?.find(record => record.patchVersion === index?.latest);
  const selected = patch?.patchVersion;
  const previous = patch?.previousPatchVersion;

  useEffect(() => {
    if (!selected || !previous) return;
    let active = true;
    client.getJson(`patch-notes/${selected}.json`, value => { decodePatchNotesReport(value, selected); }).then(value => {
      const report = decodePatchNotesReport(value, selected);
      if (active) setLoaded({ patch: selected, report });
    }).catch(() => { if (active) setLoaded({ patch: selected, failed: true }); });
    return () => { active = false; };
  }, [selected, previous, attempt]);

  return {
    index, patch, report: loaded?.patch === selected ? loaded?.report : undefined,
    failed: error || (loaded?.patch === selected && loaded?.failed),
    selectPatch: (version: string) => setParams(version === index?.latest ? {} : { patch: version }),
    retry: () => { setError(false); setAttempt(value => value + 1); },
  };
}
