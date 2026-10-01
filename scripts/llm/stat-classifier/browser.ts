/** 개발 서버에서만 켜는 실험. 연구 가중치를 실제 앱 대화에 연결한다. */
import { appStatClassifier } from "./appClassifier";
import type { LinearModel } from "./contracts";

let model: Promise<LinearModel> | undefined;
export const inferStatQuery = appStatClassifier(() => model ??= fetch("/research/llm-evals/stat-query/ml/context.json")
  .then(response => {
    if (!response.ok) throw Error("실험용 능력치 가중치를 읽지 못했습니다");
    return response.json() as Promise<LinearModel>;
  }));
