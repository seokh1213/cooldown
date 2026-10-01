/** 고정된 모델을 앱의 대화 의존성으로 연결한다. 모델·거절 기준은 재학습하지 않는다. */
import { correctNames, inputFeatures, predict, queryFor } from "./core";
import type { LinearModel } from "./contracts";
import type { PlanDeps } from "../../../src/lib/advisor/planTypes";

export function appStatClassifier(load: () => Promise<LinearModel>): NonNullable<PlanDeps["inferStatQuery"]> {
  return async (resolved, memory, ctx) => {
    if (!ctx.data) return undefined;
    const corrected = correctNames(resolved.text, ctx.data);
    const rule = queryFor(corrected.text, memory, ctx);
    if (rule) return rule;
    const model = await load();
    const decision = predict(model, inputFeatures(corrected.text, memory, ctx.data));
    return queryFor(corrected.text, memory, ctx, decision.label) ?? undefined;
  };
}
