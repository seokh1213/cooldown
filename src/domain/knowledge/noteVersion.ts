import lifecycle from "../../../dev/data/knowledge/game-lifecycle.json";
import { josa } from "./text";

export interface NoteVersion {
  baselinePatch: string;
  sourcePatch: string | null;
  lastChangedPatch: string | null;
  verifiedThroughPatch: string | null;
  lastReviewedAt: string | null;
  sourceFetchedAt: string | null;
  scope: string | null;
  lifecycle: {
    state: "active" | "removed" | "unknown";
    asOfPatch: string;
    introducedInPatch: string | null;
    removedInPatch: string | null;
    basis: "backfill" | "source-review" | "official-note";
  };
}

export interface VersionContext {
  baselinePatch: string;
  sourcePatch?: string;
  verifiedThroughPatch?: string;
  reviewedAt?: string;
  fetchedAt?: string;
  scope?: string;
}

export interface LifecycleEntity {
  id: string;
  page: string;
  state: NoteVersion["lifecycle"]["state"];
  changedInPatch: string;
  introducedInPatch?: string;
  removedInPatch: string | null;
  scope: string;
  basis?: NoteVersion["lifecycle"]["basis"];
}

export function normalizePatch(patch: unknown): string | null {
  if (typeof patch !== "string" || !/^\d+\.\d+$/.test(patch)) return null;
  const [major, minor] = patch.split(".").map(Number);
  return `${major}.${minor}`;
}

export function noteVersion(note: object, context: VersionContext, entities = lifecycle.entities as LifecycleEntity[]): NoteVersion {
  const fields = note as Record<string, unknown>;
  const previous = fields.version as NoteVersion | undefined;
  const entity = entities.find(entity => fields.id === entity.id || fields.page === entity.page);
  const evidence = fields.evidence as { patch?: string } | undefined;
  const compatibility = fields.compatibility as { checkedThroughPatch?: string } | undefined;
  const verified = normalizePatch(compatibility?.checkedThroughPatch) ?? normalizePatch(fields.verifiedPatch) ?? normalizePatch(context.verifiedThroughPatch);
  return {
    baselinePatch: context.baselinePatch,
    sourcePatch: normalizePatch(fields.verifiedPatch) ?? normalizePatch(evidence?.patch) ?? previous?.sourcePatch ?? normalizePatch(context.sourcePatch),
    lastChangedPatch: entity?.changedInPatch ?? previous?.lastChangedPatch ?? null,
    verifiedThroughPatch: verified ?? previous?.verifiedThroughPatch ?? null,
    lastReviewedAt: typeof fields.reviewedAt === "string" ? fields.reviewedAt : context.reviewedAt ?? previous?.lastReviewedAt ?? null,
    sourceFetchedAt: context.fetchedAt ?? previous?.sourceFetchedAt ?? null,
    scope: entity?.scope ?? (typeof fields.scope === "string" ? fields.scope : context.scope ?? previous?.scope ?? null),
    lifecycle: entity ? {
      state: entity.state, asOfPatch: context.baselinePatch, introducedInPatch: entity.introducedInPatch ?? null,
      removedInPatch: entity.removedInPatch, basis: entity.basis ?? "official-note",
    } : previous?.lifecycle ?? {
      state: "active", asOfPatch: context.baselinePatch, introducedInPatch: null, removedInPatch: null,
      basis: context.verifiedThroughPatch ? "source-review" : "backfill",
    },
  };
}

export function removalNotice(name: string, version: NoteVersion | undefined, lang: string): string | undefined {
  if (version?.lifecycle.state !== "removed") return undefined;
  const patch = version.lifecycle.removedInPatch;
  if (lang.startsWith("en")) return `${name} is currently removed from Summoner's Rift.${patch ? ` It was removed in patch ${patch}.` : ""}`;
  if (lang.startsWith("zh")) return `${name}目前已从召唤师峡谷移除。${patch ? `移除版本为 ${patch}。` : ""}`;
  return `${josa(name, "은/는")} 현재 소환사의 협곡에서 제거된 요소입니다.${patch ? ` ${patch} 패치에서 제거됐습니다.` : ""}`;
}
