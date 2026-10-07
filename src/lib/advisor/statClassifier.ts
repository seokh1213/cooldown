import { correctNames, inputFeatures, predict, queryFor } from "./statClassifierCore";
import type { LinearModel } from "./statClassifierTypes";
import type { PlanDeps } from "./planTypes";
import { asksAllStats, detectStats } from "./statQuery";
import { asksMatchup } from "./askWords";

export function statClassifier(load: () => Promise<LinearModel>): NonNullable<PlanDeps["inferStatQuery"]> {
  let pending: Promise<LinearModel> | undefined;
  return async (resolved, memory, ctx) => {
    if (!ctx.data || resolved.slot || resolved.matchup) return undefined;
    if (asksAllStats(resolved.text)) return undefined;
    if (asksMatchup(resolved.text) && !detectStats(resolved.text).length) return undefined;
    if (memory.active === "matchup" && !detectStats(resolved.text).length) return undefined;
    const corrected = correctNames(resolved.text, ctx.data);
    const rule = queryFor(corrected.text, memory, ctx);
    // Explicit selections have several fields; the classifier predicts one label.
    const overview = resolved.requestIntent?.scope === "overview";
    if (overview && memory.active !== "stat") return undefined;
    if (!overview && rule) return rule;
    pending ??= load().catch(error => { pending = undefined; throw error; });
    const decision = predict(await pending, inputFeatures(corrected.text, memory, ctx.data));
    if (overview) return decision.accepted && decision.label === "inherit"
      ? queryFor(corrected.text, memory, ctx, "inherit") ?? undefined : undefined;
    return (decision.accepted ? queryFor(corrected.text, memory, ctx, decision.label) : null) ?? rule ?? undefined;
  };
}
