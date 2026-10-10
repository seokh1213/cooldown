/** 답변의 제목·목록·강조·코드를 안전한 React 요소로 표시한다. */
import type { ReactNode } from "react";
import { publicAnswerText } from "@/features/advisor/answers/presentation/publicAnswerText";

function inline(text: string): ReactNode {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\]\([^\s)]+\))/g).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.92em]">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("_") && part.endsWith("_")) {
      return <em key={index} className="not-italic text-muted-foreground">{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

function listItem(line: string) {
  const match = /^\s*(?:(\d+)[.)]|([-*·]))\s+(.*)$/.exec(line);
  return match ? { ordered: Boolean(match[1]), start: Number(match[1]), text: match[3] } : undefined;
}

export function AdvisorMarkdown({ text }: { text: string }): ReactNode {
  const nodes: ReactNode[] = [];
  const lines = publicAnswerText(text).split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const item = listItem(line);
    if (item) {
      const start = i;
      const items: ReactNode[] = [];
      while (i < lines.length) {
        const next = listItem(lines[i]);
        if (!next || next.ordered !== item.ordered) break;
        items.push(<li key={i} className="pl-1">{inline(next.text)}</li>);
        i++;
      }
      i--;
      const classes = "ml-5 space-y-1.5 pl-1 marker:text-muted-foreground";
      nodes.push(item.ordered
        ? <ol key={start} start={item.start} className={`${classes} list-decimal`}>{items}</ol>
        : <ul key={start} className={`${classes} list-disc`}>{items}</ul>);
      continue;
    }
    const heading = /^#{1,3}\s+(.*)$/.exec(line);
    const boldOnly = /^\s*\*\*(.+?)\*\*\s*$/.exec(line);
    if (heading) {
      nodes.push(<h3 key={i} className="mt-6 border-b pb-2 text-base font-semibold leading-6 text-foreground text-balance first:mt-0">{inline(heading[1])}</h3>);
    } else if (boldOnly) {
      nodes.push(<p key={i} className="mt-3 text-xs font-semibold leading-5 text-foreground/80 first:mt-0">{inline(boldOnly[1])}</p>);
    } else if (line.trim()) {
      nodes.push(<p key={i}>{inline(line)}</p>);
    }
  }
  return <div className="space-y-2 break-words">{nodes}</div>;
}
