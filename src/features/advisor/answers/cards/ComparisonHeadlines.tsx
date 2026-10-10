import type { AdvisorAnswer } from "@/features/advisor/answers/answer";

/** 본문과 자료 패널에서 요청한 결론을 같은 순서로 보여준다. */
export function ComparisonHeadlines({ answer }: { answer: Extract<AdvisorAnswer, { kind: "compare" }> }) {
  const facts = answer.headlines ?? (answer.headline ? [answer.headline] : []);
  if (!facts.length) return null;
  return (
    <dl className="space-y-3 border-l-2 border-foreground pl-2.5">
      {facts.map(fact => (
        <div key={fact.label}>
          <dt className="text-xs text-muted-foreground">{fact.label}</dt>
          <dd className="text-[15px] font-semibold leading-relaxed tabular-nums">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
