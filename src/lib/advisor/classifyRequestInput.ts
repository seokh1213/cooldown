import type { ResolvedQuestion } from "./resolvedQuestion";
import type { PlanDeps } from "./planTypes";
import { asksAboutHelper, isSmallTalk } from "./intent";
import { asksWholeKit, asksScenarioAdvice } from "./askWords";
import { asksSpellNumbers } from "./spellFocus";

export async function classifyRequestInput(resolved: ResolvedQuestion, deps: PlanDeps): Promise<ResolvedQuestion> {
  if (!deps.classifyRequest || resolved.requestIntent) return resolved;
  const requestIntent = await deps.classifyRequest(resolved).catch(() => undefined);
  if (asksScenarioAdvice(resolved.text) && !asksWholeKit(resolved.text) && !asksSpellNumbers(resolved.text)
    && ["overview", "skills", "statsAll", "stats", "ability"].includes(requestIntent?.scope ?? "")) return resolved;
  if (asksSpellNumbers(resolved.text) && resolved.champions.length
    && ["overview", "skills", "combo", "advice", "counterplay"].includes(requestIntent?.scope ?? "")) return resolved;
  if (resolved.slot && !asksWholeKit(resolved.text) && !asksScenarioAdvice(resolved.text)
    && ["overview", "statsAll", "skills"].includes(requestIntent?.scope ?? "")) return resolved;
  if (resolved.champions.length && resolved.slot && asksSpellNumbers(resolved.text)
    && requestIntent?.scope === "counterplay") return resolved;
  if (requestIntent && (requestIntent.scope === "identity" && !asksAboutHelper(resolved.text)
    || requestIntent.scope === "chat" && !isSmallTalk(resolved.text))) return resolved;
  return requestIntent ? { ...resolved, requestIntent } : resolved;
}
