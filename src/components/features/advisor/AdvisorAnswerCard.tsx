/**
 * 코드가 만든 답을 카드로 그린다
 *
 * 모델이 데이터를 읊게 하지 않는다. 사실은 카드가 그리고, 모델은 그 위에 해설만 쓴다.
 * 그래서 카드는 도구 결과처럼 보여야 한다 — 이름·종류 칩·표·출처 링크.
 *
 * 채택된 시안
 *   M1-B  스킬: 표 카드에서 묻은 행만 굵게, 나머지는 흐리게, 설명 전문은 접음
 *   M2-B  챔피언: 능력치 전부 + 스킬 한 줄씩, 극단 능력치 행만 굵게
 *   M6-A  규칙: 예/아니오 배지 + 근거 문장 하나. 배지는 극성이 분명할 때만
 *   M7    오타: 후보가 둘 이상일 때만 이 카드로 묻는다 (하나면 바로 진행)
 */
import { Link } from "react-router-dom";
import { useTranslation } from "@/i18n";
import { championIconUrl } from "@/data/assets/riotAssetUrls";
import {
  CARD_STATS,
  FOCUS_LABEL,
  STAT_LABEL,
  isExtremeGrade,
  percentileLabel,
  ruleVerdict,
  spellFocusValue,
  spellOneLiner,
  type AdvisorAnswer,
} from "@/lib/advisor/answer";
import { AdvisorMarkdown } from "./AdvisorMarkdown";

interface AdvisorAnswerCardProps {
  answer: AdvisorAnswer;
  ddragonVersion: string;
  patch: string;
  /** 오타 후보를 골랐을 때. 패널이 그 이름으로 다시 묻는다. */
  onPickChampion?: (championId: string) => void;
}

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

/** 카드 틀. 머리(아이콘·이름·종류 칩) / 몸 / 꼬리(출처·링크). */
function Frame(props: {
  icon: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  tool: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="w-full overflow-hidden rounded-xl border bg-background text-sm">
      <div className="flex items-center gap-2.5 border-b px-3 py-2.5">
        {props.icon}
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate font-semibold">{props.title}</div>
          {props.subtitle && <div className="truncate text-xs text-muted-foreground">{props.subtitle}</div>}
        </div>
        <span className="shrink-0 rounded-full border px-2 py-px text-[11px] text-muted-foreground">{props.tool}</span>
      </div>
      <div className="px-3 py-2.5">{props.children}</div>
      {props.footer && (
        <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
          {props.footer}
        </div>
      )}
    </div>
  );
}

/** 슬롯 글자 칩. 스킬 아이콘 id 가 카드 데이터에 없어 글자로 대신한다. */
function SlotBadge({ slot }: { slot: string }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold">
      {slot}
    </span>
  );
}

/** 라벨·값 표. `hit` 행은 굵게, `dim` 행은 흐리게. */
function KvTable({ rows }: { rows: Array<{ label: string; value: React.ReactNode; hit?: boolean; dim?: boolean }> }) {
  if (rows.length === 0) return null;
  return (
    <table className="w-full border-collapse text-[13px]">
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.label}
            className={`border-b last:border-b-0 ${row.hit ? "font-semibold" : ""} ${row.dim ? "text-muted-foreground" : ""}`}
          >
            <td className={`w-[34%] py-1.5 pr-2 align-top ${row.hit ? "" : "text-muted-foreground"}`}>{row.label}</td>
            <td className="py-1.5 align-top tabular-nums">{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Disclosure({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="mt-1.5 text-xs">
      <summary className="cursor-pointer select-none py-1 text-primary marker:content-none">▸ {summary}</summary>
      <div className="pt-1 leading-relaxed text-foreground/85">{children}</div>
    </details>
  );
}

export function AdvisorAnswerCard({ answer, ddragonVersion, patch, onPickChampion }: AdvisorAnswerCardProps) {
  const { t } = useTranslation();
  const copy = t.advisor.card;

  if (answer.kind === "text") {
    return <AdvisorMarkdown text={answer.text} />;
  }

  if (answer.kind === "suggestion") {
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <span>{answer.reason === "ambiguous" ? copy.whichOne : fill(copy.suggestPrefix, { original: answer.original })}</span>
        {answer.candidates.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => onPickChampion?.(card.id)}
            className="rounded-md border bg-background px-2.5 py-1 text-sm font-medium hover:bg-muted"
          >
            {card.name}
          </button>
        ))}
        <span>{copy.suggestSuffix}</span>
      </div>
    );
  }

  if (answer.kind === "spell") {
    const { spell } = answer;
    const rows = answer.facts.map((fact) => ({
      label: fact.label,
      value: fact.value,
      // 묻은 사실이 따로 있으면 나머지는 흐리게. 없으면 전부 평범하게.
      dim: Boolean(answer.headline) || answer.highlighted.length > 0,
    }));
    if (answer.headline) rows.unshift({ label: answer.headline.label, value: answer.headline.value, dim: false, hit: true } as never);
    return (
      <Frame
        icon={<SlotBadge slot={spell.slot} />}
        title={spell.name}
        subtitle={`${answer.championName} · ${spell.slot}`}
        tool={copy.spell}
        footer={
          <>
            <span>{fill(copy.patch, { patch })}</span>
            <Link to={`/vs?a=${answer.championId}`} className="text-primary hover:underline">
              {copy.openInVs}
            </Link>
          </>
        }
      >
        {answer.highlighted.length > 0 && (
          <div className="mb-2 space-y-1 rounded-md bg-muted px-2.5 py-2 text-[13px] font-semibold leading-relaxed">
            {answer.highlighted.map((sentence) => (
              <p key={sentence}>{sentence}</p>
            ))}
          </div>
        )}
        <KvTable rows={rows} />
        {!answer.headline && answer.highlighted.length === 0 && spell.summary && (
          <p className="mt-2 text-[13px] leading-relaxed">{spell.summary}</p>
        )}
        {spell.text && <Disclosure summary={copy.fullText}>{spell.text}</Disclosure>}
      </Frame>
    );
  }

  if (answer.kind === "champion") {
    const { card } = answer;
    const subtitle = [card.wiki?.subclass, card.rangeType, card.wiki?.positions?.[0]].filter(Boolean).join(" · ");
    const header = (
      <img
        src={championIconUrl(ddragonVersion, card.id)}
        alt=""
        width={36}
        height={36}
        className="h-9 w-9 shrink-0 rounded-md"
      />
    );
    const footer = (
      <>
        <span>{fill(copy.patch, { patch })}</span>
        <Link to={`/vs?a=${card.id}`} className="text-primary hover:underline">
          {copy.openInVs}
        </Link>
      </>
    );
    // "말파이트 스킬 쿨타임": 스킬 다섯 개의 그 사실만. 능력치·해설은 없다.
    if (answer.focus) {
      const focus = answer.focus;
      return (
        <Frame icon={header} title={card.name} subtitle={`${copy.skills} · ${FOCUS_LABEL[focus]}`} tool={copy.champion} footer={footer}>
          <KvTable
            rows={card.spells.map((spell) => ({
              label: `${spell.slot} ${spell.name}`,
              value: spellFocusValue(spell, focus) || "—",
              hit: true,
            }))}
          />
        </Frame>
      );
    }
    const statRows = CARD_STATS.map((stat) => {
      const snap = card.stats[stat];
      if (!snap) return undefined;
      const { side, value } = percentileLabel(snap.percentileLv1);
      const pct = fill(side === "top" ? copy.top : copy.bottom, { n: value });
      return {
        label: STAT_LABEL[stat],
        hit: isExtremeGrade(snap.gradeLv1),
        value: (
          <>
            {snap.lv1} → {snap.lv18}
            <span className="ml-1.5 text-[11px] text-muted-foreground">{pct}</span>
          </>
        ),
      };
    }).filter((row): row is NonNullable<typeof row> => Boolean(row));
    const skillRows = card.spells.map((spell) => ({
      label: `${spell.slot} ${spell.name}`,
      value: spellOneLiner(spell),
    }));
    return (
      <Frame
        icon={header}
        title={
          <>
            {card.name}
            {card.title && <span className="ml-1.5 font-normal text-muted-foreground">{card.title}</span>}
          </>
        }
        subtitle={subtitle}
        tool={copy.champion}
        footer={footer}
      >
        <div className="mb-1 text-[11px] font-medium text-muted-foreground">{copy.stats}</div>
        <KvTable rows={statRows} />
        <div className="mb-1 mt-3 text-[11px] font-medium text-muted-foreground">{copy.skills}</div>
        <KvTable rows={skillRows} />
        {card.mechanics.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {card.mechanics.map((tag) => (
              <span key={tag} className="rounded-full bg-muted px-2 py-px text-[11px] text-muted-foreground">
                {tag}
              </span>
            ))}
          </div>
        )}
      </Frame>
    );
  }

  if (answer.kind === "compare") {
    const { cards, rows } = answer;
    const hasHit = rows.some((row) => row.hit);
    const [first, second] = cards;
    const vsLink = second ? `/vs?a=${first.id}&t=${second.id}` : `/vs?a=${first.id}`;
    return (
      <Frame
        icon={
          <div className="flex shrink-0 -space-x-2">
            {cards.map((card) => (
              <img
                key={card.id}
                src={championIconUrl(ddragonVersion, card.id)}
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 rounded-md ring-2 ring-background"
              />
            ))}
          </div>
        }
        title={cards.map((card) => card.name).join(" vs ")}
        subtitle={
          answer.matchup && second
            ? fill(copy.matchup, { a: first.name, b: second.name })
            : answer.slot
              ? `${answer.slot}`
              : answer.level
                ? fill(copy.atLevel, { n: answer.level })
                : undefined
        }
        tool={answer.matchup ? copy.matchupTool : copy.compare}
        footer={
          <>
            <span>{fill(copy.patch, { patch })}</span>
            <Link to={vsLink} className="text-primary hover:underline">
              {copy.openInVs}
            </Link>
          </>
        }
      >
        {answer.headline && (
          <div className="mb-2 rounded-md bg-muted px-2.5 py-2 text-[13px] leading-relaxed">
            <span className="text-muted-foreground">{answer.headline.label}</span>
            <span className="ml-2 font-semibold tabular-nums">{answer.headline.value}</span>
          </div>
        )}
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b text-[11px] text-muted-foreground">
              <th className="w-[28%] py-1 pr-2 text-left font-medium" />
              {cards.map((card) => (
                <th key={card.id} className="py-1 pr-2 text-left font-medium">
                  {card.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const dim = hasHit && !row.hit;
              return (
                <tr key={row.label} className={`border-b last:border-b-0 ${dim ? "text-muted-foreground" : ""}`}>
                  <td className={`py-1.5 pr-2 align-top ${row.hit ? "font-semibold" : "text-muted-foreground"}`}>{row.label}</td>
                  {row.values.map((value, i) => {
                    // VS 화면과 같은 규칙: 이긴 쪽 굵게, 진 쪽 회색, 동률은 보통.
                    const won = row.winner === i;
                    const lost = row.winner !== undefined && !won;
                    return (
                      <td
                        key={cards[i].id}
                        className={`py-1.5 pr-2 align-top tabular-nums ${won ? "font-semibold" : ""} ${lost && !dim ? "text-muted-foreground" : ""}`}
                      >
                        {value || "—"}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Frame>
    );
  }

  // rule
  const single = answer.highlighted.length === 1 ? answer.highlighted[0] : undefined;
  const verdict = single ? ruleVerdict(single) : undefined;
  const restCount = answer.rest.length;
  return (
    <Frame
      icon={<SlotBadge slot="§" />}
      title={answer.rule.name}
      subtitle={copy.ruleSource}
      tool={copy.rule}
      footer={
        <>
          <span>{fill(copy.patch, { patch })} · CC BY-SA</span>
        </>
      }
    >
      {single ? (
        <div className="flex items-start gap-2.5">
          {verdict && (
            <span className="shrink-0 rounded-md bg-foreground px-2 py-0.5 text-sm font-bold text-background">
              {verdict === "yes" ? copy.verdictYes : copy.verdictNo}
            </span>
          )}
          <p className="text-[13px] font-semibold leading-relaxed">{single}</p>
        </div>
      ) : answer.highlighted.length > 1 ? (
        <div className="space-y-1.5 text-[13px] font-semibold leading-relaxed">
          {answer.highlighted.map((sentence) => (
            <p key={sentence}>{sentence}</p>
          ))}
        </div>
      ) : (
        // 골라낸 문장이 없으면 원문을 그대로 보인다. 숨기는 것보다 낫다.
        <div className="space-y-1.5 text-[13px] leading-relaxed">
          {answer.rest.map((sentence) => (
            <p key={sentence}>{sentence}</p>
          ))}
        </div>
      )}
      {answer.highlighted.length > 0 && restCount > 0 && (
        <Disclosure summary={fill(copy.restRules, { count: restCount })}>
          <div className="space-y-1.5">
            {answer.rest.map((sentence) => (
              <p key={sentence}>{sentence}</p>
            ))}
          </div>
        </Disclosure>
      )}
    </Frame>
  );
}
