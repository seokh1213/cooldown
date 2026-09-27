/**
 * 빈 대화 — 지금 화면에 떠 있는 챔피언과, 눌러 볼 수 있는 질문 예시.
 */
import { ChampionIcon } from "@/components/ui/champion-icon";
import { useTranslation } from "@/i18n";
import type { Translations } from "@/i18n/translations";
import { fill } from "@/i18n/fill";
import type { PageContext } from "@/lib/advisor/pageContext";
import type { ChampionCard } from "../../../../scripts/llm/lib/facts";

/** 빈 화면 예시는 화면 맥락을 따른다. 말파이트 표를 보고 있으면 말파이트 예시. */
function exampleQuestions(copy: Translations["advisor"], contextCards: ChampionCard[], context: Pick<PageContext, "route" | "tab">): string[] {
  const ex = copy.card.examples;
  // 예시는 특정 사례("W 쿨타임")가 아니라 질문의 종류다. 하나씩 눌러 보면 무엇을
  // 물을 수 있는지 다 보인다.
  if (contextCards.length >= 2) {
    const [a, b] = contextCards;
    const pair = { a: a.name, b: b.name };
    return [fill(ex.vsWho, pair), fill(ex.vsStat, pair), fill(ex.vsBuy, pair), fill(ex.skillCd, { name: a.name })];
  }
  if (contextCards.length === 1) {
    const name = contextCards[0].name;
    return [
      fill(ex.skillCd, { name }),
      fill(ex.skillEffect, { name }),
      fill(ex.skillRatio, { name }),
      fill(ex.explain, { name }),
      fill(ex.counterBuy, { name }),
    ];
  }
  if (context.route === "encyclopedia") {
    if (context.tab === "items") return [ex.item1, ex.item2, ex.generic4];
    if (context.tab === "runes") return [ex.rune1, ex.rune2, ex.generic1];
    if (context.tab === "summoner") return [ex.summoner1, ex.summoner2, ex.rune1];
  }
  return [ex.generic1, ex.generic2, ex.generic3, ex.generic4];
}

interface AdvisorEmptyStateProps {
  /** 지금 화면에 떠 있는 챔피언 */
  contextCards: ChampionCard[];
  context: Pick<PageContext, "route" | "tab">;
  ddragonVersion: string;
  onAsk: (question: string) => void;
}

export function AdvisorEmptyState({ contextCards, context, ddragonVersion, onAsk }: AdvisorEmptyStateProps) {
  const { t } = useTranslation();
  const copy = t.advisor;
  return (
    <div className="space-y-3 text-muted-foreground">
      {contextCards.length > 0 ? (
        <div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2 text-foreground">
          {contextCards.map((card) => (
            <ChampionIcon
              key={card.id}
              id={card.id}
              ddragonVersion={ddragonVersion}
              className="block h-7 w-7 shrink-0 rounded-md"
            />
          ))}
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold">{contextCards.map((card) => card.name).join(" vs ")}</div>
            <div className="text-xs text-muted-foreground">
              {contextCards.length > 1 ? copy.card.comparing : copy.card.viewing}
            </div>
          </div>
        </div>
      ) : (
        <p>{copy.emptyHint}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {exampleQuestions(copy, contextCards, context).map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onAsk(example)}
            className="rounded-md border bg-background px-2.5 py-1 text-xs text-foreground transition-colors hover:border-primary/50 hover:bg-muted hover:text-foreground"
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}
