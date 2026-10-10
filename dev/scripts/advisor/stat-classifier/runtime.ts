/** 고정된 자료를 사용하는 Node 실험 어댑터. 브라우저도 동일 core를 사용한다. */
import { loadData } from "../kev-agent/lib";
import { translations } from "../../../../src/shared/i18n/translations";
import type { DialogueMemory } from "../../../../src/features/advisor/conversation/memory/dialogueState";
import type { PlanContext } from "../../../../src/features/advisor/contracts/planTypes";
import * as core from "./core";
export { jamo, grams, predict } from "./core";

export const data = loadData("ko_KR");
const ctx: PlanContext = { data, lang: "ko_KR", copy: translations.ko_KR.advisor, turns: [], championIds: [],
  consented: false, canUseModel: false, retrieval: false, judge: "none" };
export const correctNames = (question: string) => core.correctNames(question, data);
export const inputFeatures = (question: string, memory: DialogueMemory) => core.inputFeatures(question, memory, data);
export const queryFor = (question: string, memory: DialogueMemory, label?: ReturnType<typeof core.predict>["label"]) => core.queryFor(question, memory, ctx, label);
