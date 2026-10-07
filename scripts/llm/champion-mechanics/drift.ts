/** 패치 번호·수집 진단과 스킬 의미의 변경을 구분한다. 모델 호출과 승인은 하지 않는다. */
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import type { Draft, Job, Manifest } from "./contract";
import { acceptedReview, type ReviewDecision } from "./export";
import { checkDirectory } from "./check";
import { ROOT } from "./prepare";
import { buildInventory, digest, promptHash, readJson } from "./sources";

export interface Baseline {
  manifest: Manifest; jobs: Job[]; drafts: Map<string, Draft>; decisions: ReviewDecision[];
  overview?: Map<string, Record<string, unknown>>;
}
export interface DriftSlot {
  id: string; action: "reuse" | "regenerate" | "remove"; reasons: string[];
  sourceHash: string | null; previousSourceHash: string | null; retainedReview: boolean;
}
/** provenance와 진단만 제외한다. 수치·CC·형태 변경은 보수적으로 재작성한다. */
export function semanticFingerprint(job: Job): string {
  const facts = Object.fromEntries(Object.entries(job.facts).filter(([key]) => !["provenance", "diagnostics"].includes(key)));
  if (Array.isArray(facts.forms)) facts.forms = facts.forms.map(form => Object.fromEntries(
    Object.entries(form).filter(([key]) => key !== "iconVersion")));
  return digest({ champion: job.champion, slot: job.slot, slotRole: job.slotRole, sources: job.sources, numbers: job.numbers, variants: job.variants, facts });
}
export function compareInventory(baseline: Baseline, current: { patch: string; jobs: Job[]; overview?: Array<Record<string, unknown>> }) {
  const previous = new Map(baseline.jobs.map(job => [job.id, job]));
  const slots: DriftSlot[] = current.jobs.map(job => {
    const old = previous.get(job.id), draft = baseline.drafts.get(job.id);
    const reasons: string[] = [];
    if (!old) reasons.push("added");
    if (old && semanticFingerprint(old) !== semanticFingerprint(job)) reasons.push("source_content");
    if (old && old.promptHash !== job.promptHash) reasons.push("schema_or_guide");
    if (!draft) reasons.push("missing_candidate");
    const decision = baseline.decisions.find(item => item.id === job.id);
    return { id: job.id, action: reasons.length ? "regenerate" : "reuse", reasons,
      sourceHash: job.sourceHash, previousSourceHash: old?.sourceHash ?? null,
      retainedReview: !reasons.length && Boolean(old && draft && acceptedReview(old, draft, decision)) };
  });
  const currentIds = new Set(current.jobs.map(job => job.id));
  for (const old of baseline.jobs.filter(job => !currentIds.has(job.id))) {
    slots.push({ id: old.id, action: "remove", reasons: ["removed"], sourceHash: null, previousSourceHash: old.sourceHash, retainedReview: false });
  }
  const regenerate = slots.filter(slot => slot.action === "regenerate").length;
  const removed = slots.filter(slot => slot.action === "remove").length;
  const metadata = slots.filter(slot => slot.action === "reuse" && slot.sourceHash !== slot.previousSourceHash).length;
  const commonUpdates = (current.overview ?? []).filter(common => baseline.overview?.get(String(common.id))?.sourceHash !== common.sourceHash).map(common => String(common.id));
  return { schemaVersion: 1, previousPatch: baseline.manifest.patch, currentPatch: current.patch,
    hasChanges: regenerate > 0 || removed > 0 || metadata > 0 || commonUpdates.length > 0 || baseline.manifest.patch !== current.patch,
    counts: { total: current.jobs.length, reuse: slots.filter(slot => slot.action === "reuse").length,
      regenerate, removed, metadata, retainedReview: slots.filter(slot => slot.retainedReview).length }, commonUpdates, slots };
}
export async function baselineDirectory(root = ROOT): Promise<string> {
  const directory = (await readJson<{ directory: string }>(path.join(root, "research/champion-mechanics/current.json"))).directory;
  if (!/^[\w.-]+$/.test(directory) || directory === "." || directory === "..") throw new Error("Invalid mechanics baseline directory");
  return path.join(root, "research/champion-mechanics", directory);
}
export async function loadBaseline(directory: string): Promise<Baseline> {
  const manifest = await readJson<Manifest>(path.join(directory, "manifest.json"));
  const jobs = await Promise.all(manifest.jobs.map(job => readJson<Job>(path.join(directory, "inputs", `${job.id}.json`))));
  for (const job of jobs) {
    const frozen = manifest.jobs.find(row => row.id === job.id);
    const { champion, slot, patch, slotRole, sources, variants, facts } = job;
    if (!frozen || digest({ champion, slot, patch, slotRole, sources, variants, facts }) !== job.sourceHash
      || job.sourceHash !== frozen.sourceHash || job.promptHash !== frozen.promptHash || job.promptHash !== manifest.promptHash) {
      throw new Error(`Frozen mechanics input mismatch: ${job.id}`);
    }
  }
  // 새 계약으로 옛 초안을 검사하면 정상적인 schema migration도 막힌다.
  // 이전 계약은 동봉한 schema로 확인하고 전부 재작성하며, 승인을 이어받지 않는다.
  if (manifest.promptHash === promptHash()) {
    const checked = await checkDirectory(directory, manifest.jobs.map(job => job.id));
    const broken = checked.records.filter(row => !row.valid && !row.errors.every(e => e.code === "read" && e.detail.includes("ENOENT")));
    if (broken.length) throw new Error("Invalid mechanics baseline; inspect its frozen inputs and candidates");
  }
  const schema = await readJson<Record<string, unknown>>(path.join(directory, "draft.schema.json"));
  const validate = new Ajv({ coerceTypes: false, removeAdditional: false }).compile(schema);
  const drafts = new Map<string, Draft>();
  for (const job of jobs) {
    const draft = await readJson<Draft>(path.join(directory, "candidates", `${job.id}.json`)).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (!draft) continue;
    if (!validate(draft)) throw new Error(`Candidate differs from its frozen schema: ${job.id}`);
    drafts.set(job.id, draft);
  }
  const ledger = await readJson<{ decisions: ReviewDecision[] }>(path.join(directory, "review-ledger.json"));
  const overview = new Map<string, Record<string, unknown>>();
  for (const champion of new Set(jobs.map(job => job.champion))) {
    const common = await readJson<Record<string, unknown>>(path.join(directory, "overview", `${champion}.common.json`));
    const content = Object.fromEntries(Object.entries(common).filter(([key]) => !["schemaVersion", "sourceHash", "status", "author"].includes(key)));
    if (digest(content) !== common.sourceHash) throw new Error(`Frozen common input mismatch: ${champion}`);
    overview.set(String(common.id), common);
  }
  return { manifest, jobs, drafts, decisions: ledger.decisions, overview };
}
export function driftMarkdown(report: ReturnType<typeof compareInventory>): string {
  const changed = report.slots.filter(slot => slot.action !== "reuse");
  return ["## 챔피언 메커니즘 변경 감지", "", `${report.previousPatch} → ${report.currentPatch}`, "",
    `재사용 ${report.counts.reuse} · 재작성 ${report.counts.regenerate} · 삭제 ${report.counts.removed} · 유지 가능한 검수 ${report.counts.retainedReview}`, "",
    ...(changed.length ? ["| 슬롯 | 작업 | 이유 |", "|---|---|---|", ...changed.map(slot => `| ${slot.id} | ${slot.action} | ${slot.reasons.join(", ")} |`)] : ["스킬 내용 변경 없음."]), "",
    `코드로 다시 복사할 공통 정보: ${report.commonUpdates.length}개.`, "",
    "패치·수집 메타데이터만 바뀐 자료는 새 디렉터리에서 재검증해 재사용한다. 내용·계약이 바뀐 슬롯은 기존 승인을 물려받지 않는다.", ""].join("\n");
}
export async function detectDrift(options: { root?: string; baseline?: string; output: string }) {
  const root = options.root ?? ROOT;
  const [baseline, current] = await Promise.all([loadBaseline(options.baseline ?? await baselineDirectory(root)), buildInventory(root)]);
  const report = compareInventory(baseline, current);
  if (current.jobs.some(job => job.promptHash !== promptHash())) throw new Error("Current extraction contract mismatch");
  await mkdir(path.dirname(options.output), { recursive: true });
  await writeFile(`${options.output}.json`, `${JSON.stringify(report, null, 2)}\n`);
  const markdown = driftMarkdown(report);
  await writeFile(`${options.output}.md`, markdown);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `has_changes=${report.hasChanges}\nchanged_slots=${report.counts.regenerate}\n`);
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await detectDrift({ output: path.resolve(process.argv[2] ?? "research/champion-mechanics/reports/drift") });
  console.log(JSON.stringify({ previousPatch: report.previousPatch, currentPatch: report.currentPatch, ...report.counts, hasChanges: report.hasChanges }));
}
