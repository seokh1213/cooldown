import type { ResolvedQuestion } from "./resolvedQuestion";
import type { PlanDeps } from "./planTypes";

export async function classifyRequestInput(resolved: ResolvedQuestion, deps: PlanDeps): Promise<ResolvedQuestion> {
  if (!deps.classifyRequest || resolved.requestIntent) return resolved;
  const requestIntent = await deps.classifyRequest(resolved).catch(() => undefined);
  return requestIntent ? { ...resolved, requestIntent } : resolved;
}
