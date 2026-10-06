import * as path from "node:path";

/** Keep experiment caches and replacement heads separate from app artifacts. */
export function evaluationPaths(root: string, env: NodeJS.ProcessEnv = process.env) {
  return {
    cache: env.JUDGE_CACHE_FILE ?? path.join(root, "research/llm-evals/kev-agent/.app-judge-cache.json"),
    heads: env.JUDGE_HEAD_DIR
      ? [path.resolve(env.JUDGE_HEAD_DIR)]
      : [path.join(root, "public/models/judge"), path.join(root, "research/llm-evals/kev-agent/heads")],
    namespace: env.JUDGE_CACHE_NAMESPACE ?? "legacy",
  };
}
