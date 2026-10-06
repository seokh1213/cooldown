import * as path from "node:path";
import { AutoTokenizer, type PreTrainedTokenizer } from "@huggingface/transformers";
import { ranked } from "../../../src/lib/advisor/docVectors";
import { ADVISOR_MODEL } from "../../../src/lib/advisor/config";
import { questionLanguage } from "../../../src/lib/advisor/questionLanguage";
import { readVectors } from "../tuning/node_vectors";

/** Opt-in full app evaluation, using real q4 query features and the app's vectors. */
export function evaluationSearch(root: string, env: NodeJS.ProcessEnv = process.env) {
  if (env.RETRIEVAL_EVAL !== "1") return async () => { throw new Error("Node retrieval disabled"); };
  const vectors = readVectors(env.RETRIEVAL_DOC_DIR ?? path.join(root, "public/models/kev/b3e"));
  const url = env.RETRIEVAL_FEATURES_URL ?? env.HIDDEN_JUDGE;
  if (!url) throw new Error("Full evaluation requires a q4 feature server");
  let tokenizer: Promise<PreTrainedTokenizer> | undefined;
  return async (question: string, lang: string) => {
    const asked = questionLanguage(question) ?? lang;
    const tok = await (tokenizer ??= AutoTokenizer.from_pretrained(ADVISOR_MODEL.id));
    const text = vectors.prompt[asked].replace("{}", question);
    const ids = (tok.encode(text, { add_special_tokens: false }) as number[]).slice(0, 512);
    const response = await fetch(`${url}/hidden`, { method: "POST", body: JSON.stringify({
      ids, positions: [ids.length - 1], gate: "embed_scale",
    }) });
    if (!response.ok) throw new Error(`Retrieval feature server returned ${response.status}`);
    const { hidden } = await response.json() as { hidden: number[][] };
    const norm = Math.sqrt(hidden[0].reduce((sum, value) => sum + value * value, 0)) + 1e-9;
    const query = Float32Array.from(hidden[0], (value) => value / norm);
    const block = vectors.languages[asked];
    return ranked(query, block.matrix, block.ids);
  };
}
