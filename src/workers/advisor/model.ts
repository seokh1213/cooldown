import {
  AutoModelForCausalLM,
  AutoTokenizer,
  type PreTrainedModel,
  type PreTrainedTokenizer,
} from "@huggingface/transformers";
import type { AdvisorFileProgress, AdvisorModelSpec } from "@/lib/advisor/protocol";
import { hideLoraInput } from "./lora";
import { installCache } from "./modelCache";
import { post } from "./port";

let tokenizer: PreTrainedTokenizer | null = null;
let model: PreTrainedModel | null = null;
let loading: Promise<void> | null = null;

const progressByFile = new Map<string, AdvisorFileProgress>();

function reportProgress() {
  const files = [...progressByFile.values()];
  const loadedBytes = files.reduce((sum, f) => sum + f.loaded, 0);
  const totalBytes = files.reduce((sum, f) => sum + f.total, 0);
  post({ type: "progress", files, loadedBytes, totalBytes });
}

interface HfProgress {
  status: string;
  file?: string;
  loaded?: number;
  total?: number;
}

function onProgress(event: HfProgress) {
  if (!event.file) return;
  if (event.status === "progress" || event.status === "download") {
    progressByFile.set(event.file, {
      file: event.file,
      loaded: event.loaded ?? 0,
      total: event.total ?? 0,
    });
    reportProgress();
  } else if (event.status === "done") {
    const current = progressByFile.get(event.file);
    if (current) {
      progressByFile.set(event.file, { ...current, loaded: current.total });
      reportProgress();
    }
  }
}

export async function load(spec: AdvisorModelSpec): Promise<void> {
  if (loading) return loading;
  installCache(spec.graph);
  progressByFile.clear();
  loading = (async () => {
    tokenizer = await AutoTokenizer.from_pretrained(spec.id, {
      progress_callback: onProgress,
    });
    // dtype 은 문자열 하나로 준다. 모듈마다 다른 값을 주면 세션 구성이 어긋난다.
    model = await AutoModelForCausalLM.from_pretrained(spec.id, {
      dtype: spec.dtype as "q4f16",
      device: "webgpu",
      progress_callback: onProgress,
    });
    if (spec.graph) hideLoraInput(model);
    post({ type: "loaded" });
  })().catch((error: unknown) => {
    releaseModel();
    throw error;
  });
  return loading;
}

export function getTokenizer(): PreTrainedTokenizer | null {
  return tokenizer;
}

export function getModel(): PreTrainedModel | null {
  return model;
}

export function releaseModel() {
  model = null;
  tokenizer = null;
  loading = null;
}
