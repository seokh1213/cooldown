/** 모델 종류를 바꾸지 않고 실제 앱 워커에서 요청 범위만 생성한다. */
import { ADVISOR_MODEL } from "../../../../src/features/advisor/model/config";
import type { AdvisorChatMessage, AdvisorRequest, AdvisorResponse } from "../../../../src/features/advisor/contracts/protocol";
import { readRequestScope, requestScopePrompt } from "../../../../src/features/advisor/model/requestScopeModel";
import type { RequestIntent } from "../../../../src/features/advisor/understanding/requests/requestIntent";
import type { Language } from "../../../../src/shared/i18n";

interface Case { language: Language; question?: string; text: string; expected: string; group?: string; fastIntent?: RequestIntent }
interface Pack { system: string; examples: Record<string, AdvisorChatMessage[]>; cases: Case[]; classification: Case[]; holdout: Case[]; sources: Record<string, string> }
const worker = new Worker(new URL("../../../../src/features/advisor/worker/advisor.worker.ts", import.meta.url), { type: "module" });
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const output = document.querySelector<HTMLPreElement>("#result-json")!;
const loadButton = document.querySelector<HTMLButtonElement>("#load")!;
const runButton = document.querySelector<HTMLButtonElement>("#run")!;
const classifyButton = document.querySelector<HTMLButtonElement>("#classify")!;
const holdoutButton = document.querySelector<HTMLButtonElement>("#holdout")!;
let nextId = 1;

function request(message: AdvisorRequest): Promise<AdvisorResponse> {
  return new Promise((resolve, reject) => {
    const id = "id" in message ? message.id : undefined;
    const finish = (value?: AdvisorResponse, error?: Error) => {
      clearTimeout(timer);
      worker.removeEventListener("message", listener);
      if (error) reject(error);
      else resolve(value!);
    };
    const listener = (event: MessageEvent<AdvisorResponse>) => {
      const value = event.data;
      if ("id" in value && value.id !== undefined && value.id !== id) return;
      if (value.type === "error") finish(undefined, new Error(value.message));
      else if (value.type === "done" || value.type === "loaded") finish(value);
      else if (value.type === "progress") status.textContent = `모델 적재 ${Math.round(value.loadedBytes / 1e6)}MB`;
    };
    const timer = setTimeout(() => finish(undefined, new Error(`${message.type} timeout`)), 180_000);
    worker.addEventListener("message", listener);
    worker.postMessage(message);
  });
}

loadButton.addEventListener("click", async () => {
  loadButton.disabled = true;
  status.textContent = "앱 Q4 모델 적재 중";
  try {
    await request({ type: "load", model: ADVISOR_MODEL });
    status.textContent = "앱 Q4 모델 준비 완료";
    runButton.disabled = classifyButton.disabled = holdoutButton.disabled = false;
  } catch (error) { status.textContent = `모델 적재 실패: ${String(error)}`; }
});

async function run(group: "flow" | "classification" | "holdout") {
  runButton.disabled = classifyButton.disabled = holdoutButton.disabled = true;
  const pack = await (await fetch("/research/llm-evals/request-classifier/comparison/hybrid/browser-pack-final.json")).json() as Pack;
  const rows: Array<Record<string, unknown>> = [];
  const cases = group === "flow" ? pack.cases : group === "holdout" ? pack.holdout : pack.classification;
  for (const entry of cases) {
    status.textContent = `요청 판정 ${rows.length + 1}/${cases.length}: ${entry.language}`;
    try {
      if (group === "holdout" && entry.fastIntent) {
        rows.push({ ...entry, scope: entry.fastIntent.scope, usedModel: false });
        continue;
      }
      const result = await request({ type: "generate", id: nextId++, model: ADVISOR_MODEL, ...requestScopePrompt(entry.text, entry.language),
        purpose: "grounded-summary", loopGuard: false });
      if (result.type !== "done") throw new Error("generation did not complete");
      const scope = readRequestScope(result.text)?.scope;
      rows.push({ ...entry, ...result, text: entry.text, output: result.text, scope, usedModel: true });
    } catch (error) { rows.push({ ...entry, error: String(error) }); }
    output.textContent = JSON.stringify({ model: ADVISOR_MODEL, variant: "structured", group, sources: pack.sources, rows,
      limits: "앱 Q4 WebGPU 워커와 일반 생성 어댑터. Ollama의 JSON 강제 디코딩은 브라우저에 없음. 모델은 현재 질문만 판정한다." }, null, 2);
  }
  status.textContent = `검증 완료: ${rows.length}건`;
  output.textContent = JSON.stringify({ model: ADVISOR_MODEL, variant: "structured", group, sources: pack.sources, rows }, null, 2);
  runButton.disabled = classifyButton.disabled = holdoutButton.disabled = false;
}
runButton.addEventListener("click", () => void run("flow"));
classifyButton.addEventListener("click", () => void run("classification"));
holdoutButton.addEventListener("click", () => void run("holdout"));
