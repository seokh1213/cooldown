import * as fs from "node:fs";
import * as path from "node:path";
import type { DocVectors } from "../../../src/lib/advisor/docVectors";

export function readVectors(directory: string): DocVectors {
  const meta = JSON.parse(fs.readFileSync(path.join(directory, "doc-vectors.json"), "utf8")) as {
    dim: number; prompt?: Record<string, string>; languages: Record<string, { offset: number; ids: string[] }>;
  };
  const binary = fs.readFileSync(path.join(directory, "doc-vectors.bin"));
  const half = new Uint16Array(binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength));
  const toFloat = (h: number) => {
    const sign = h & 0x8000 ? -1 : 1, exponent = (h >> 10) & 31, fraction = h & 1023;
    if (exponent === 31) return fraction ? NaN : sign * Infinity;
    return exponent === 0 ? sign * 2 ** -14 * fraction / 1024 : sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
  };
  const languages = Object.fromEntries(Object.entries(meta.languages).map(([lang, { offset, ids }]) =>
    [lang, { ids, matrix: Float32Array.from(half.subarray(offset, offset + ids.length * meta.dim), toFloat) }]));
  return { dim: meta.dim, languages, prompt: meta.prompt ?? {
    ko_KR: '이 글 "{}" 을 한 낱말로 줄이면:', en_US: 'This text: "{}" means in one word:', zh_CN: '这段话"{}"用一个词概括是：',
  } };
}
