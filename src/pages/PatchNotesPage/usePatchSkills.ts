import { useEffect, useState } from "react";
import type { DataLocale } from "@/data/contracts/staticData";
import type { PatchNotesReport } from "@/data/contracts/patchNotes";
import { decodePatchSkillArchive, type PatchSkillArchive } from "@/data/contracts/patchSkills";
import { createStaticDataClient } from "@/data/http/staticDataClient";

const client = createStaticDataClient();

export function usePatchSkills(report: PatchNotesReport | undefined, locale: DataLocale) {
  const [loaded, setLoaded] = useState<{ key: string; archive?: PatchSkillArchive; failed?: boolean }>();
  const [attempt, setAttempt] = useState(0);
  const patchVersion = report?.patchVersion;
  const ddragon = report?.sources.ddragon;
  const cdragon = report?.sources.cdragon;
  const key = `${patchVersion}:${ddragon}:${cdragon}:${locale}`;
  useEffect(() => {
    if (!patchVersion || !ddragon || !cdragon) return;
    let active = true;
    client.getJson(`patch-notes/skills/${patchVersion}.${locale}.json`, value => {
      decodePatchSkillArchive(value, { patchVersion, sources: { ddragon, cdragon }, locale });
    }).then(value => {
      const archive = decodePatchSkillArchive(value, { patchVersion, sources: { ddragon, cdragon }, locale });
      if (active) setLoaded({ key, archive });
    }).catch(() => { if (active) setLoaded({ key, failed: true }); });
    return () => { active = false; };
  }, [patchVersion, ddragon, cdragon, locale, key, attempt]);
  return {
    archive: loaded?.key === key ? loaded.archive : undefined,
    failed: loaded?.key === key && loaded.failed,
    retry: () => setAttempt(value => value + 1),
  };
}
