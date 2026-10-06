import { ollamaChat, DEFAULT_OLLAMA_HOST } from "../lib/ollama";

export async function openOllama(model: string, signal: AbortSignal) {
  const host = DEFAULT_OLLAMA_HOST;
  const read = async (endpoint: string) => {
    const response = await fetch(`${host}/api/${endpoint}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) });
    if (!response.ok) throw new Error(`Ollama ${endpoint} failed (${response.status})`);
    return response.json() as Promise<{ models: Array<{ name: string; model?: string; digest: string }> }>;
  };
  const loaded = (await read("ps")).models.some(entry => entry.name === model || entry.model === model);
  const identity = (await read("tags")).models.find(entry => entry.name === model);
  if (!identity) throw new Error("Requested Ollama model is not installed");
  let used = false;
  return { revision: identity.digest,
    generate: async (system: string, prompt: string, maxTokens: number) => {
      used = true;
      return (await ollamaChat({ model, host, signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]),
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }], think: false,
        temperature: 0, numCtx: 2048, numPredict: maxTokens, keepAlive: "5m" })).content;
    },
    close: async () => {
      // Leave models that were already loaded, and the shared Ollama server, running.
      if (!used || loaded) return;
      const response = await fetch(`${host}/api/generate`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, keep_alive: 0 }), signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error("Evaluation model unload failed");
    },
  };
}
