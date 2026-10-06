import type { ResolvedQuestion } from "./resolvedQuestion";
import type { PlanDeps } from "./planTypes";
import { asksAboutHelper, isSmallTalk } from "./intent";

export async function classifyRequestInput(resolved: ResolvedQuestion, deps: PlanDeps): Promise<ResolvedQuestion> {
  if (!deps.classifyRequest || resolved.requestIntent) return resolved;
  const requestIntent = await deps.classifyRequest(resolved).catch(() => undefined);
  if (requestIntent && (requestIntent.scope === "identity" && !asksAboutHelper(resolved.text)
    || requestIntent.scope === "chat" && !isSmallTalk(resolved.text))) return resolved;
  return requestIntent ? { ...resolved, requestIntent } : resolved;
}
