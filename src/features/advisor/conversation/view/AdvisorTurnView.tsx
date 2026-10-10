/**
 * 대화의 말풍선 하나 — 사용자 질문, 또는 답과 그 곁의 자료 칩·링크·복사.
 */
import { ComparisonHeadlines } from "../../answers/cards/ComparisonHeadlines";
import { Link } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import { useTranslation } from "@/shared/i18n";
import type { Translations } from "@/shared/i18n/translations";
import { fill } from "@/shared/i18n/fill";
import type { AdvisorTurn } from "@/features/advisor/session/useAdvisorTurns";
import { groundCommentary } from "@/features/advisor/retrieval/grounding/groundCommentary";
import { answerLinks, itemHeadline, spellSummary, type AdvisorAnswer } from "@/features/advisor/answers/answer";
import { AdvisorAnswerCard } from "../../answers/cards/AdvisorAnswerCard";
import { AdvisorMultiAnswer } from "./AdvisorMultiAnswer";
import { AdvisorTurnFooter as TurnFooter } from "./AdvisorTurnFooter";
import { AdvisorMarkdown } from "../../answers/cards/AdvisorMarkdown";
import { ReferenceChip } from "../../reference/AdvisorReferenceChip";
import { referenceKey } from "@/features/advisor/answers/references/referenceIdentity";
import { TickDetails } from "../../answers/cards/SpellTickInfo";

interface AdvisorTurnViewProps {
  ref?: React.Ref<HTMLDivElement>;
  turn: AdvisorTurn;
  index: number;
  /** 이 말풍선 앞의 가장 최근 답 */
  previousTurn: AdvisorTurn | undefined;
  /** 카드를 자료 패널로 보낸 답인가. 그러면 대화에는 짚은 사실과 자료 칩만 남는다. */
  asReference: boolean;
  /** 자료 패널이 지금 이 답을 보이는가 */
  shownInReference: boolean;
  shownReferenceKey?: string;
  /** 답을 쓰는 중인 마지막 답인가 */
  answering: boolean;
  busy: boolean;
  ddragonVersion: string;
  patch: string;
  onShowReference: (turnId: number, answer?: AdvisorAnswer) => void;
  onAskPerspective: (index: number, side: "playing" | "against") => void;
  onShowDoc: (id: string, title: string) => void;
  onPickChampion: (championId: string) => void;
  onNavigate: () => void;
}

function linkLabel(link: ReturnType<typeof answerLinks>[number], copy: Translations["advisor"]): string {
  switch (link.kind) {
    case "vs":
      return fill(copy.card.goVs, { a: link.names[0], b: link.names[1] });
    case "runes":
      return copy.card.goRunes;
    case "summoner":
      return copy.card.goSummoner;
    case "item":
      return fill(copy.card.goItem, { name: link.name });
  }
}

function useTurnPresentation(props: AdvisorTurnViewProps) {
  const { turn, index, previousTurn, onNavigate } = props;
  const { t } = useTranslation();
  const copy = t.advisor;
  // 같은 챔피언을 이어 물으면 "VS 화면으로 이동" 이 답마다 붙는다. 직전 답에 있던 링크는 뺀다.
  const sameSource = turn.source?.patch === previousTurn?.source?.patch
    && turn.source?.locale === previousTurn?.source?.locale
    && turn.source?.ddragonVersion === previousTurn?.source?.ddragonVersion;
  const previousLinkTargets = new Set(previousTurn?.answer && sameSource ? answerLinks(previousTurn.answer).map((link) => link.to) : []);
  const answers = turn.answers?.length ? turn.answers : turn.answer ? [turn.answer] : [];
  const links = [...new Map(answers.flatMap(answerLinks).map(link => [link.to, link])).values()]
    .filter(link => !previousLinkTargets.has(link.to));
  // 자료 칩과 같은 줄에 둔다. 따로 두면 버튼이 두 줄로 쌓여 어지럽다.
  const linkButtons = links.map((link) => (
    <Link
      key={link.to}
      to={link.to}
      title={turn.historical ? copy.history.currentDataLink : undefined}
      onClick={onNavigate}
      className={`inline-flex items-center gap-1 rounded-md border border-primary/40 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10 ${turn.answers?.length ? "min-h-11" : ""}`}
    >
      {turn.historical ? copy.history.currentDataLink : linkLabel(link, copy)}
      <ArrowRight className="h-3 w-3" />
    </Link>
  ));
  // 짧은 코드 답은 카드 본문이 곧 답이다. 같은 내용을 해설로 다시 표시하지 않는다.
  const statConclusion = turn.answer?.kind === "compare" && Boolean(turn.answer.statQuery && turn.answer.headline);
  const commentary = turn.byCode && (turn.answer?.kind === "text" || turn.answer?.kind === "rule"
    || turn.answer?.kind === "suggestion" || statConclusion) ? null : <TurnCommentary turn={turn} />;
  /*
   * 관점을 문장으로 못 가린 자리에만 한 번 물어본다.
   *
   * "제드 라인전 어떻게 풀어" 는 내가 제드인지 제드를 상대하는지 한국어로도
   * 알 수 없다. 그 정보는 **묻는 사람에게만** 있으므로 모델에게 다시 쓰게
   * 해도 없는 것이 생기지 않는다. 버튼 하나가 제일 정확하고 제일 빠르다.
   *
   * 양쪽에 노트가 다 있을 때만 띄운다. 한쪽뿐이면 고를 것이 없다.
   */
  const notes = turn.answer?.kind === "champion" ? turn.answer.notes : undefined;
  // 렌더에서는 **띄울지 말지만** 가린다. 여기서 부르는 함수를 만들면
  // 그 함수가 `ask` 를 거쳐 ref 에 닿아, 렌더 중 ref 접근으로 잡힌다.
  const canAskSide = Boolean(
    notes && notes.perspective === "both" && notes.playing.length > 0 && notes.against.length > 0,
  );
  const perspectiveChips = !canAskSide ? null : <PerspectiveChips index={index} onAskPerspective={props.onAskPerspective} />;
  const pending =
    !turn.historical && !turn.content && !turn.byCode && props.answering ? (
      <span className="flex items-center gap-2 pl-2.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {copy.card.commentaryPending}
      </span>
    ) : null;
  return { linkButtons, commentary, perspectiveChips, pending };
}

export function AdvisorTurnView(props: AdvisorTurnViewProps) {
  const { ref, turn, previousTurn, asReference, busy, onNavigate } = props;
  const { t } = useTranslation();
  const ddragonVersion = turn.source?.ddragonVersion ?? props.ddragonVersion;
  const patch = turn.source?.patch ?? props.patch;
  const { linkButtons, commentary, perspectiveChips, pending } = useTurnPresentation(props);
  return (
    <div
      ref={ref}
      className={
        turn.role === "user"
          ? "ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground"
          : turn.answer || turn.answers?.length
            ? "w-full"
            : "mr-auto w-fit max-w-[95%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2"
      }
    >
      {turn.notice && <p className="mb-1.5 text-[11px] text-muted-foreground">{turn.notice}</p>}
      {turn.answers?.length ? (
        <AdvisorMultiAnswer turn={turn} asReference={asReference} shownReferenceKey={props.shownInReference ? props.shownReferenceKey : undefined}
          navigation={asReference && linkButtons.length > 0 ? linkButtons : undefined}
          ddragonVersion={ddragonVersion} patch={patch} onNavigate={onNavigate}
          onPickChampion={props.onPickChampion} onShowReference={props.onShowReference} />
      ) : turn.answer && asReference ? (
        // 카드는 자료 패널에 있다(L1). 대화에는 질문이 짚은 사실 한 줄, 해설, 자료 칩만.
        <div className="space-y-2">
          <ReferenceDigest answer={turn.answer} />
          {/* 구조화한 조회의 결론은 위에서 모두 보여준다. 상성 조언과 모델 해설은 본문을 유지한다. */}
          {!(turn.byCode && (turn.answer.kind === "spell" || turn.answer.kind === "item")) && commentary}
          {perspectiveChips}
          {pending}
          <div className="flex flex-wrap items-center gap-1.5">
            <ReferenceChip
              answer={turn.answer}
              active={props.shownInReference}
              // 직전 답과 같은 자료면 칩만 흐리게. "오공 Q 쿨, W 쿨" 은 카드 두 장이 아니다.
              sameAsPrevious={Boolean(previousTurn?.answer && referenceKey(turn.answer, turn.source) === referenceKey(previousTurn.answer, previousTurn.source))}
              ddragonVersion={ddragonVersion}
              onClick={() => props.onShowReference(turn.id, turn.answer)}
            />
            {linkButtons}
          </div>
        </div>
      ) : turn.answer ? (
        // 규칙·오타 후보·글은 짧아서 대화 안에 그대로 둔다.
        <div className="space-y-2">
          {turn.answer.kind === "compare" && turn.answer.cards.length === 1 && turn.answer.statQuery && (
            <ComparisonHeadlines answer={turn.answer} />
          )}
          {turn.answer.kind === "spell" && turn.answer.focus === "ticks" && <ReferenceDigest answer={turn.answer} />}
          {!(turn.byCode && turn.answer.kind === "spell" && turn.answer.focus === "ticks") && commentary}
          <AdvisorAnswerCard
            answer={turn.answer}
            ddragonVersion={ddragonVersion}
            patch={patch}
            onPickChampion={props.onPickChampion}
            onNavigate={onNavigate}
          />
          {perspectiveChips}
          {pending}
        </div>
      ) : turn.content ? (
        turn.role === "assistant" ? (
          <>
            <AdvisorMarkdown text={turn.content} />
            {turn.related?.length ? <RelatedDocs docs={turn.related} busy={busy} onShowDoc={props.onShowDoc} /> : null}
          </>
        ) : (
          <span className="whitespace-pre-wrap">{turn.content}</span>
        )
      ) : (
        turn.role === "assistant" && !turn.historical && !turn.referenceUnavailable && (
          // 검색 폴백은 모델을 두 번 부르고 사이에 코드가 찾는다. 그동안 도는 점만
          // 있으면 멈춘 것처럼 보인다. 지금 무엇을 하는지 옆에 적는다.
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {turn.activity}
          </span>
        )
      )}
      {turn.role === "assistant" && turn.referenceUnavailable && (
        <p className="mt-2 text-xs text-muted-foreground">{t.advisor.history.missingCard}</p>
      )}
      {/* 카드 없는 답(규칙)의 바로 가기. 카드가 있는 답은 자료 칩 옆에 이미 붙였다. */}
      {turn.role === "assistant" && linkButtons.length > 0 && !asReference && !turn.answers?.length && (
        <div className="mt-2 flex flex-wrap gap-1.5">{linkButtons}</div>
      )}
      {turn.role === "assistant" && (turn.content || turn.answer || Boolean(turn.answers?.length)) && <TurnFooter turn={turn} />}
    </div>
  );
}

/** "혹시 이 자료를?" 에 붙는 자료 단추. 누르면 그 자료를 보인다. */
function RelatedDocs({
  docs,
  busy,
  onShowDoc,
}: {
  docs: NonNullable<AdvisorTurn["related"]>;
  busy: boolean;
  onShowDoc: AdvisorTurnViewProps["onShowDoc"];
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {docs.map((doc) => (
        <button
          key={doc.id}
          type="button"
          disabled={busy}
          onClick={() => onShowDoc(doc.id, doc.title)}
          className="rounded-md border bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:border-primary/50 hover:bg-muted disabled:opacity-50"
        >
          {doc.title}
        </button>
      ))}
    </div>
  );
}

/*
  코드가 쓴 글은 해설이 아니라 답 자체다. "해설" 딱지와 세로줄은 모델이
  카드 위에 얹은 글에만 붙인다. 모델 글에는 근거 검사를 돌려 카드가
  틀렸다고 증명하는 문장을 걷어낸다.
*/
function TurnCommentary({ turn }: { turn: AdvisorTurn }) {
  const { t, lang } = useTranslation();
  const shown = turn.byCode || turn.historical ? turn.content : groundCommentary(turn.content, turn.answer, lang).text;
  return !shown ? null : turn.byCode ? (
    <div className="text-[13px] leading-relaxed">
      <AdvisorMarkdown text={shown} />
    </div>
  ) : (
    <div className="border-l-2 border-border pl-2.5 text-[13px] leading-relaxed">
      <span className="block text-[11px] text-muted-foreground">{t.advisor.card.commentary}</span>
      <AdvisorMarkdown text={shown} />
    </div>
  );
}

function PerspectiveChips({ index, onAskPerspective }: { index: number; onAskPerspective: AdvisorTurnViewProps["onAskPerspective"] }) {
  const { t } = useTranslation();
  const copy = t.advisor;
  return (
    <div className="flex flex-wrap items-center gap-1.5 pl-2.5 text-xs">
      <span className="text-muted-foreground">{copy.card.perspectiveAsk}</span>
      <button
        type="button"
        className="rounded-full border border-border px-2.5 py-0.5 hover:bg-muted"
        onClick={() => onAskPerspective(index, "playing")}
      >
        {copy.card.perspectivePlaying}
      </button>
      <button
        type="button"
        className="rounded-full border border-border px-2.5 py-0.5 hover:bg-muted"
        onClick={() => onAskPerspective(index, "against")}
      >
        {copy.card.perspectiveAgainst}
      </button>
    </div>
  );
}

/** 카드를 자료 패널에 둔 답이 대화에 남기는 것 — 질문이 짚은 사실 한 줄 */
function ReferenceDigest({ answer }: { answer: AdvisorAnswer }) {
  const { t } = useTranslation();
  const copy = t.advisor;
  return (
    <>
      {answer.kind === "spell" && answer.headline && (
        <div className="border-l-2 border-foreground pl-2.5">
          <div className="text-[15px] font-semibold tabular-nums">
            {answer.focus === "ticks" && answer.spell.ticks ? <TickDetails ticks={answer.spell.ticks} /> : answer.headline.value}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {answer.championName} {answer.spell.slot} {answer.spell.name} · {answer.headline.label}
          </div>
        </div>
      )}
      {answer.kind === "spell" && answer.highlighted.length > 0 && (
        <div className="space-y-2 rounded-md bg-muted px-2.5 py-2 text-[13px] leading-relaxed">
          <p className="font-semibold">{answer.championName} {answer.spell.slot} {answer.spell.name}</p>
          {answer.highlighted.map((sentence) => (
            <AdvisorMarkdown key={sentence} text={sentence} />
          ))}
        </div>
      )}
      {answer.kind === "spell" && !answer.headline && answer.highlighted.length === 0 && (
        // "W는?" 처럼 사실을 짚지 않았으면 스킬이 무엇을 하는지 한 줄. 표는 자료 패널에.
        <div className="space-y-1 text-[13px] leading-relaxed">
          <p className="font-semibold">{answer.championName} {answer.spell.slot} {answer.spell.name}</p>
          <p>{spellSummary(answer.spell)}</p>
        </div>
      )}
      {answer.kind === "item" && (
        <div className="space-y-2">
          {/* 다른 답의 헤드라인과 같은 꼴 — 세로선 하나와 굵기로 짚는다. */}
          {answer.verdicts.map((verdict) => (
            <div key={verdict.tag} className="border-l-2 border-foreground pl-2.5">
              <div className="text-[15px] font-semibold">
                {verdict.yes ? copy.card.verdictYes : copy.card.verdictNo}
              </div>
              <p className="text-[13px] leading-relaxed">
                {verdict.evidence ?? fill(copy.card.itemNoTag, { name: answer.itemName, tag: verdict.tag })}
              </p>
            </div>
          ))}
          {answer.verdicts.length === 0 && (
            <>
              <div className="border-l-2 border-foreground pl-2.5">
                <div className="text-[15px] font-semibold">{answer.askedPrice && answer.price !== undefined
                  ? fill(copy.card.itemPrice, { price: answer.price }) : itemHeadline(answer)}</div>
                <div className="text-[11px] text-muted-foreground">
                  {fill(copy.card.itemEffectCount, { name: answer.itemName, n: answer.effects.length })}
                </div>
              </div>
              <ul className="space-y-1 text-[13px] leading-relaxed">
                {answer.effects.map((effect) => (
                  <li key={`${effect.name}${effect.text}`}>
                    {effect.name && (
                      <span className="font-semibold">
                        {effect.name}
                        {effect.active && <span className="ml-1 text-[11px] font-normal text-muted-foreground">({copy.card.itemActive})</span>}
                        {effect.text ? " — " : ""}
                      </span>
                    )}
                    {effect.text}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {answer.kind === "compare" && <ComparisonHeadlines answer={answer} />}
    </>
  );
}
