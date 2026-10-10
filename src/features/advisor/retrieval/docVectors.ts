import { fetchJudgeFile } from "../storage/storage";

/** 문서 벡터 파일(`doc-vectors.json` + `.bin`, 언어마다 [문서 수 × dim] fp16). `dual_graph_check.py` 가 만든다. */
export interface DocVectors {
  dim: number;
  prompt: Record<string, string>;
  languages: Record<string, { ids: string[]; matrix: Float32Array }>;
}

/** fp16 → fp32 */
function halfToFloat(h: number): number {
  const sign = h & 0x8000 ? -1 : 1;
  const exponent = (h >> 10) & 0x1f;
  const fraction = h & 0x3ff;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 31) return fraction ? NaN : sign * Infinity;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

export async function loadDocVectors(base: string): Promise<DocVectors> {
  const [metaRes, binRes] = await Promise.all([fetchJudgeFile(`${base}.json`), fetchJudgeFile(`${base}.bin`)]);
  if (!metaRes.ok || !binRes.ok) throw new Error(`문서 벡터 ${base} 를 받지 못했습니다`);
  const meta = (await metaRes.json()) as { dim: number; prompt: Record<string, string>; languages: Record<string, { offset: number; ids: string[] }> };
  const half = new Uint16Array(await binRes.arrayBuffer());
  const languages: DocVectors["languages"] = {};
  for (const [lang, { offset, ids }] of Object.entries(meta.languages)) {
    const matrix = new Float32Array(ids.length * meta.dim);
    for (let i = 0; i < matrix.length; i += 1) matrix[i] = halfToFloat(half[offset + i]);
    languages[lang] = { ids, matrix };
  }
  return { dim: meta.dim, prompt: meta.prompt, languages };
}

/** 코사인 순으로 늘어놓은 문서. 둘 다 정규화되어 있어 내적이 곧 코사인이다. */
export function ranked(query: Float32Array, matrix: Float32Array, ids: string[]): Array<{ id: string; score: number }> {
  const dim = query.length;
  return ids
    .map((id, k) => {
      let dot = 0;
      for (let i = 0; i < dim; i += 1) dot += query[i] * matrix[k * dim + i];
      return { id, score: dot };
    })
    .sort((a, b) => b.score - a.score);
}

export const nearest = (query: Float32Array, matrix: Float32Array, ids: string[]) => ranked(query, matrix, ids)[0];
