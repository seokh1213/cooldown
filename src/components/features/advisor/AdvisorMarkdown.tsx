/**
 * 조언 본문 서식
 *
 * 답변은 코드가 조립하거나 모델이 쓴 평문이다. 둘 다 `## 소제목` 과 `- 항목` 을 쓰는데
 * 그대로 뿌리면 우물 정 두 개가 화면에 보인다. 규칙 답변은 모델을 거치지 않고
 * 그대로 나가기 때문에 특히 눈에 띈다.
 *
 * 마크다운 파서를 들이지 않는다. 우리가 만드는 문법이 위 세 가지뿐이라 그만큼만 그린다.
 * HTML 문자열을 만들지 않고 React 노드로 조립하므로 본문이 태그로 해석될 여지가 없다.
 */
import type { ReactNode } from "react";

/** `**굵게**` 와 `_출처_` 만 인라인으로 처리한다 */
function inline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
  if (parts.length === 1) return text;
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("_") && part.endsWith("_") && part.length > 2) {
      return (
        <em key={index} className="not-italic text-muted-foreground">
          {part.slice(1, -1)}
        </em>
      );
    }
    return part;
  });
}

export function AdvisorMarkdown({ text }: { text: string }): ReactNode {
  const nodes: ReactNode[] = [];
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const heading = /^#{2,3}\s+(.*)$/.exec(line);
    if (heading) {
      nodes.push(
        <p
          key={i}
          className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground first:mt-0"
        >
          {inline(heading[1])}
        </p>,
      );
      continue;
    }
    // 하위 항목은 앞 항목의 예시라 한 단계 더 들여쓴다
    const child = /^\s*·\s+(.*)$/.exec(line);
    if (child) {
      nodes.push(
        <p key={i} className="ml-5 text-muted-foreground before:mr-1 before:content-['·']">
          {inline(child[1])}
        </p>,
      );
      continue;
    }
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      nodes.push(
        <p key={i} className="ml-1 before:mr-1 before:content-['–']">
          {inline(bullet[1])}
        </p>,
      );
      continue;
    }
    if (!line.trim()) continue;
    nodes.push(
      <p key={i} className="mt-1 first:mt-0">
        {inline(line)}
      </p>,
    );
  }

  return <div className="space-y-0.5">{nodes}</div>;
}
