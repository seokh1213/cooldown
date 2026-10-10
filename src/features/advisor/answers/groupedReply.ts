/** 두 상성에서 같은 근거 문단을 보여 줬을 때 한 번만 묶는다. 표현이 다른 문장은 합치지 않는다. */
import type { Language } from "@/shared/i18n";

interface ReplySection { heading?: string; text: string; enemy?: string }

export function groupedReply(parts: ReplySection[], lang: Language): string {
  const paragraphs = parts.map(part => part.text.split("\n\n"));
  const ownerPrefix = (paragraph: string, enemy?: string) => {
    const title = /^\*\*[^*\n]+\*\*\n/.exec(paragraph)?.[0];
    return title && enemy && paragraph.startsWith(title + enemy) ? title + enemy : undefined;
  };
  const normalize = (paragraph: string, enemy?: string) => {
    const prefix = ownerPrefix(paragraph, enemy);
    return prefix ? paragraph.replace(prefix, prefix.slice(0, -enemy!.length) + "{opponents}") : paragraph;
  };
  const shared = paragraphs[0]?.filter(paragraph => paragraph.length > 60 && paragraph.startsWith("**")
    && paragraphs.length > 1 && paragraphs.every((list, index) => list.some(p => normalize(p, parts[index].enemy) === normalize(paragraph, parts[0].enemy)))) ?? [];
  const keys = shared.map(p => normalize(p, parts[0].enemy));
  const individual = parts.map((part, index) => {
    const text = paragraphs[index].filter(p => !keys.includes(normalize(p, part.enemy))).join("\n\n");
    return text ? [part.heading, text].filter(Boolean).join("\n") : "";
  });
  const common = shared.map(paragraph => {
    const prefix = ownerPrefix(paragraph, parts[0].enemy);
    const names = parts.map(p => p.enemy).filter(Boolean);
    return prefix && names.length === parts.length ? paragraph.replace(prefix, prefix.slice(0, -parts[0].enemy!.length) + names.join("·")) : paragraph;
  });
  const title = lang === "ko_KR" ? "### 공통 조언" : lang === "en_US" ? "### Shared advice" : "### 共同建议";
  return [...individual, common.length ? `${title}\n${common.join("\n\n")}` : ""].filter(Boolean).join("\n\n");
}
