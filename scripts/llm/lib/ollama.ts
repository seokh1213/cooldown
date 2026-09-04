/**
 * Ollama /api/chat 최소 클라이언트 (스트리밍)
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  host?: string;
  /** gemma4 등 thinking 지원 모델의 사고 출력 여부 */
  think?: boolean;
  temperature?: number;
  numCtx?: number;
  numPredict?: number;
  onToken?: (token: string) => void;
  onThinking?: (token: string) => void;
}

export interface ChatStats {
  model: string;
  promptTokens: number;
  outputTokens: number;
  /** 초 */
  promptSeconds: number;
  generateSeconds: number;
  totalSeconds: number;
  tokensPerSecond: number;
  /**
   * 첫 토큰이 화면에 나오기까지 걸린 시간(초).
   * 스트리밍 UI 의 체감 대기 시간이며, 대부분 프롬프트 prefill 시간이다.
   */
  firstTokenSeconds: number;
}

export interface ChatResult {
  content: string;
  thinking: string;
  stats: ChatStats;
}

interface OllamaChunk {
  message?: { role: string; content?: string; thinking?: string };
  done?: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
  error?: string;
}

export const DEFAULT_OLLAMA_HOST = process.env.OLLAMA_HOST?.startsWith("http")
  ? process.env.OLLAMA_HOST
  : "http://127.0.0.1:11434";

export async function ollamaChat(opts: ChatOptions): Promise<ChatResult> {
  const host = opts.host ?? DEFAULT_OLLAMA_HOST;
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    stream: true,
    think: opts.think ?? false,
    options: {
      temperature: opts.temperature ?? 0.3,
      num_ctx: opts.numCtx ?? 16384,
      ...(opts.numPredict ? { num_predict: opts.numPredict } : {}),
    },
  };

  // 첫 토큰 지연 측정은 요청 직전부터 센다.
  // ollama 는 prefill 이 끝날 때까지 응답 헤더를 보내지 않으므로 fetch 이후부터 재면 0 이 나온다.
  const startedAt = Date.now();
  const res = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama 응답 오류 ${res.status}: ${text}`);
  }

  let firstTokenAt: number | undefined;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let thinking = "";
  let final: OllamaChunk | undefined;

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    const chunk = JSON.parse(line) as OllamaChunk;
    if (chunk.error) throw new Error(`Ollama: ${chunk.error}`);
    if (chunk.message?.thinking) {
      thinking += chunk.message.thinking;
      opts.onThinking?.(chunk.message.thinking);
    }
    if (chunk.message?.content) {
      if (firstTokenAt === undefined) firstTokenAt = Date.now();
      content += chunk.message.content;
      opts.onToken?.(chunk.message.content);
    }
    if (chunk.done) final = chunk;
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx = buffer.indexOf("\n");
    while (idx >= 0) {
      handleLine(buffer.slice(0, idx));
      buffer = buffer.slice(idx + 1);
      idx = buffer.indexOf("\n");
    }
  }
  if (buffer.trim()) handleLine(buffer);

  const ns = 1e9;
  const promptTokens = final?.prompt_eval_count ?? 0;
  const outputTokens = final?.eval_count ?? 0;
  const generateSeconds = (final?.eval_duration ?? 0) / ns;
  return {
    content,
    thinking,
    stats: {
      model: opts.model,
      promptTokens,
      outputTokens,
      promptSeconds: (final?.prompt_eval_duration ?? 0) / ns,
      generateSeconds,
      totalSeconds: (final?.total_duration ?? 0) / ns,
      tokensPerSecond: generateSeconds > 0 ? outputTokens / generateSeconds : 0,
      firstTokenSeconds: ((firstTokenAt ?? Date.now()) - startedAt) / 1000,
    },
  };
}

export async function listOllamaModels(host = DEFAULT_OLLAMA_HOST): Promise<string[]> {
  const res = await fetch(`${host}/api/tags`);
  if (!res.ok) throw new Error(`Ollama 연결 실패 (${res.status}) — ollama serve 실행 여부 확인`);
  const data = (await res.json()) as { models?: Array<{ name: string }> };
  return (data.models ?? []).map((m) => m.name);
}
