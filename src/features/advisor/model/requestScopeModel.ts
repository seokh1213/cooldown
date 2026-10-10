/** 낮은 확신의 요청만 같은 0.8B에 보내고, 모순된 범위는 채택하지 않는다. */
import prompt from "./requestScopePrompt.json";
import { REQUEST_SCOPES, type RequestIntent } from "../understanding/requests/requestIntent";
import { normalizeMessage } from "./offlineJudge";
import type { ResolvedQuestion } from "../understanding/resolvedQuestion";
import type { AdvisorChatMessage } from "../contracts/protocol";
import type { Language } from "../../../shared/i18n";

const breadth = { overview: "mixed", statsAll: "all", stats: "specific", skills: "all", ability: "specific", combo: "sequence",
  counterplay: "unspecified", advice: "unspecified", chat: "unspecified", identity: "unspecified", other: "unspecified" };

export function readRequestScope(output: string): RequestIntent | undefined {
  try {
    const value = JSON.parse(output);
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 3) return undefined;
    const { scope, slots, breadth: width } = value;
    if (!REQUEST_SCOPES.includes(scope) || !Array.isArray(slots) || slots.some(slot => !["P", "Q", "W", "E", "R"].includes(slot))) return undefined;
    if (new Set(slots).size !== slots.length || width !== breadth[scope as keyof typeof breadth]) return undefined;
    if (scope === "skills" && slots.length === 1) return undefined;
    // 0은 확률 없음 표시다. 슬롯은 검사용이며 대화의 대상·기억을 덮어쓰지 않는다.
    return { scope, confidence: 0 };
  } catch { return undefined; }
}

export function requestScopePrompt(text: string, language: Language) {
  const examples = prompt.examples[language] as AdvisorChatMessage[];
  return { system: prompt.system, messages: [...examples, { role: "user", content: text } as AdvisorChatMessage], maxTokens: 80 };
}

export function withRequestModel(
  fast: (resolved: ResolvedQuestion) => Promise<RequestIntent | undefined>,
  model?: (text: string) => Promise<RequestIntent | undefined>,
) {
  return async (resolved: ResolvedQuestion): Promise<RequestIntent | undefined> => {
    const intent = await fast(resolved);
    if (intent || !model) return intent;
    const names = resolved.mentions.map(mention => resolved.text.slice(mention.index, mention.index + mention.length));
    return model(normalizeMessage(resolved.text, names)).catch(() => undefined);
  };
}
