/**
 * 코드가 만든 답을 카드로 그린다
 *
 * 모델이 데이터를 읊게 하지 않는다. 사실은 카드가 그리고, 모델은 그 위에 해설만 쓴다.
 * 그래서 카드는 도구 결과처럼 보여야 한다 — 이름·종류 칩·표·화면 링크.
 *
 * 채택된 시안
 *   M1-B  스킬: 표 카드에서 묻은 행만 굵게, 나머지는 흐리게, 설명 전문은 접음
 *   M2-B  챔피언: 능력치 전부 + 스킬 한 줄씩, 극단 능력치 행만 굵게
 *   M6-A  규칙: 예/아니오 배지 + 근거 문장 하나. 배지는 극성이 분명할 때만
 *   M7    오타: 후보가 둘 이상일 때만 이 카드로 묻는다 (하나면 바로 진행)
 */
import { useTranslation } from "@/i18n";
import { fill } from "@/i18n/fill";
import { ItemIcon } from "@/components/ui/item-icon";
import { AbilityIcon } from "@/components/ui/ability-icon";
import { ruleVerdict, type AdvisorAnswer } from "@/lib/advisor/answer";
import { ruleName } from "@/lib/knowledge/rules";
import { AdvisorMarkdown } from "./AdvisorMarkdown";
import { Disclosure, Frame, KvTable, PatchLabel, PatchLinkFooter, SlotBadge } from "./AnswerCardFrame";
import { ChampionAnswerCard } from "./ChampionAnswerCard";
import { CompareAnswerCard } from "./CompareAnswerCard";
import { championReferenceOf } from "@/lib/advisor/championReference";
import { useHistoryReference } from "./HistoryReference";

interface AdvisorAnswerCardProps {
  answer: AdvisorAnswer;
  answers?: AdvisorAnswer[];
  ddragonVersion: string;
  patch: string;
  /** 오타 후보를 골랐을 때. 패널이 그 이름으로 다시 묻는다. */
  onPickChampion?: (championId: string) => void;
  /** 카드 안의 화면 링크를 눌렀을 때. 모바일은 드로어가 전체 화면이라 패널이 닫아 준다. */
  onNavigate?: () => void;
}

export function AdvisorAnswerCard({ answer, answers, ddragonVersion: currentDdragonVersion, patch: currentPatch, onPickChampion, onNavigate }: AdvisorAnswerCardProps) {
  const turn = useHistoryReference();
  const patch = turn?.source?.patch ?? currentPatch;
  const ddragonVersion = turn?.source?.ddragonVersion ?? currentDdragonVersion;
  const reference = championReferenceOf(answer);
  if (reference) return <ChampionAnswerCard answer={reference}
    selectedSpells={(answers ?? [answer]).filter((entry): entry is Extract<AdvisorAnswer, { kind: "spell" }> => entry.kind === "spell" && entry.championId === reference.card.id)}
    ddragonVersion={ddragonVersion} patch={patch} onNavigate={onNavigate} />;
  switch (answer.kind) {
    case "text":
      return <AdvisorMarkdown text={answer.text} />;
    case "item":
      return <ItemAnswerCard answer={answer} ddragonVersion={ddragonVersion} patch={patch} onNavigate={onNavigate} />;
    case "suggestion":
      return <SuggestionAnswer answer={answer} onPickChampion={onPickChampion} />;
    case "spell":
      return <SpellAnswerCard answer={answer} ddragonVersion={ddragonVersion} patch={patch} onNavigate={onNavigate} />;
    case "champion":
      return <ChampionAnswerCard answer={answer} ddragonVersion={ddragonVersion} patch={patch} onNavigate={onNavigate} />;
    case "compare":
      return <CompareAnswerCard answer={answer} ddragonVersion={ddragonVersion} patch={patch} onNavigate={onNavigate} />;
    case "rule":
      return <RuleAnswerCard answer={answer} patch={patch} />;
    default: {
      const _exhaustive: never = answer;
      return _exhaustive;
    }
  }
}

function ItemAnswerCard({
  answer,
  ddragonVersion,
  patch,
  onNavigate,
}: {
  answer: Extract<AdvisorAnswer, { kind: "item" }>;
  ddragonVersion: string;
  patch: string;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const copy = t.advisor.card;
  return (
    <Frame
      icon={
        <ItemIcon id={answer.itemId} ddragonVersion={ddragonVersion} size={36} className="block h-9 w-9 shrink-0 rounded-md" />
      }
      title={answer.itemName}
      subtitle={answer.price ? fill(copy.itemPrice, { price: answer.price.toLocaleString() }) : undefined}
      tool={copy.item}
      footer={
        <PatchLinkFooter
          patch={patch}
          to={`/encyclopedia?tab=items&item=${encodeURIComponent(answer.itemId)}`}
          label={copy.openInItems}
          onNavigate={onNavigate}
        />
      }
    >
      {answer.stats.length > 0 && (
        <>
          <div className="mb-1 text-[11px] font-medium text-muted-foreground">{copy.itemStats}</div>
          <KvTable rows={answer.stats.map((stat) => ({ label: stat.label, value: stat.value }))} />
        </>
      )}
      {answer.effects.length > 0 && (
        <>
          <div className={`mb-1 text-[11px] font-medium text-muted-foreground ${answer.stats.length ? "mt-3" : ""}`}>
            {copy.itemEffects}
          </div>
          <ul className="divide-y">
            {answer.effects.map((effect) => (
              <li key={`${effect.name}${effect.text}`} className="py-1.5 text-[13px] leading-relaxed">
                {effect.name && (
                  <span className="font-semibold">
                    {effect.name}
                    <span className="ml-1.5 rounded-full border px-1.5 py-px text-[10px] font-normal text-muted-foreground">
                      {effect.active ? copy.itemActive : copy.itemPassive}
                    </span>
                  </span>
                )}
                {effect.text && <p className={effect.name ? "mt-0.5" : ""}>{effect.text}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </Frame>
  );
}

/** M7 오타: 후보가 둘 이상일 때만 이 카드로 묻는다 (하나면 바로 진행) */
function SuggestionAnswer({
  answer,
  onPickChampion,
}: {
  answer: Extract<AdvisorAnswer, { kind: "suggestion" }>;
  onPickChampion?: (championId: string) => void;
}) {
  const { t } = useTranslation();
  const copy = t.advisor.card;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <span>{answer.reason === "ambiguous" ? copy.whichOne : fill(copy.suggestPrefix, { original: answer.original })}</span>
      {answer.candidates.map((card) => (
        <button
          key={card.id}
          type="button"
          onClick={() => onPickChampion?.(card.id)}
          className="rounded-md border bg-background px-2.5 py-1 text-sm font-medium transition-colors hover:border-primary/50 hover:bg-muted hover:text-foreground"
        >
          {card.name}
        </button>
      ))}
      <span>{copy.suggestSuffix}</span>
    </div>
  );
}

/** M1-B 스킬: 표 카드에서 묻은 행만 굵게, 나머지는 흐리게, 설명 전문은 접음 */
function SpellAnswerCard({
  answer,
  ddragonVersion,
  patch,
  onNavigate,
}: {
  answer: Extract<AdvisorAnswer, { kind: "spell" }>;
  ddragonVersion: string;
  patch: string;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const copy = t.advisor.card;
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
      icon={<AbilityIcon championId={answer.championId} slot={spell.slot} ddragonVersion={ddragonVersion}
        alt={`${answer.championName} ${spell.slot} ${spell.name}`} className="block h-9 w-9 shrink-0 rounded-md" />}
      title={spell.name}
      subtitle={`${answer.championName} · ${spell.slot}`}
      tool={copy.spell}
      footer={<PatchLinkFooter patch={patch} to={`/vs?a=${answer.championId}`} label={copy.openInVs} onNavigate={onNavigate} />}
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

/** M6-A 규칙: 예/아니오 배지 + 근거 문장 하나. 배지는 극성이 분명할 때만 */
function RuleAnswerCard({ answer, patch }: { answer: Extract<AdvisorAnswer, { kind: "rule" }>; patch: string }) {
  const { t, lang } = useTranslation();
  const turn = useHistoryReference();
  const copy = t.advisor.card;
  const single = answer.highlighted.length === 1 ? answer.highlighted[0] : undefined;
  const verdict = single ? ruleVerdict(single) : undefined;
  const restCount = answer.rest.length;
  return (
    <Frame
      icon={<SlotBadge slot="§" />}
      title={ruleName(answer.rule, turn?.source?.locale ?? lang)}
      tool={copy.rule}
      footer={
        <>
          <PatchLabel patch={patch} />
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
