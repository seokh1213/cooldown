import { ADVISOR_MODEL } from "../../../src/lib/advisor/config";
import { createRuntime } from "../conversational-advisor/runtime";
import type { JudgeQuestion } from "../../../src/lib/advisor/judge";

const runtime = createRuntime({ strict: true, model: { ...ADVISOR_MODEL,
  graph: new URLSearchParams(location.search).get("graph") ?? ADVISOR_MODEL.graph } });
let pending = Promise.resolve<unknown>(undefined);
const rpc = async (method: "judge" | "search" | "generate", args: unknown[]) => {
  const run = () => method === "judge" ? runtime.judge(args[0] as string, args[1] as string, args[2] as JudgeQuestion[])
    : method === "search" ? runtime.search(args[0] as string, args[1] as string)
    : runtime.generate(args[0] as string, args[1] as string, args[2] as number, args[3] as "grounded-summary" | "grounded-numeric");
  const result = pending.then<unknown>(run);
  pending = result.catch(() => undefined);
  return result;
};
Object.assign(window, { qualityRuntime: { rpc, load: runtime.load, calls: runtime.calls, close: runtime.close } });
