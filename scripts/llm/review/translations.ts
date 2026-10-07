import type { ReviewCase } from "./packet";

export interface KoreanTranslation { source: string; ko: string }

export function koreanTranslations(entries: KoreanTranslation[]): Record<string, string> {
  const translations: Record<string, string> = Object.create(null);
  for (const entry of entries) {
    if (!entry.source || !entry.ko?.trim() || Object.hasOwn(translations, entry.source))
      throw new Error("Review translations contain empty or duplicate text");
    const numbers = (text: string) => text.match(/\d+(?:\.\d+)?/g) ?? [];
    if (JSON.stringify(numbers(entry.source)) !== JSON.stringify(numbers(entry.ko)))
      throw new Error("Review translation changed numeric values or their order");
    translations[entry.source] = entry.ko;
  }
  return translations;
}

export function untranslatedReviewText(cases: ReviewCase[], translations: Record<string, string>): string[] {
  const foreign = (text: string) => /\p{Script=Han}/u.test(text)
    || /[A-Za-z]/.test(text) && !/\p{Script=Hangul}/u.test(text);
  const texts = cases.flatMap(row => [row.question, ...row.current.flatMap(answer => [answer.text, answer.evidence])]);
  return [...new Set(texts.filter(text => foreign(text) && !Object.hasOwn(translations, text)))];
}
