import type { ChampionCard } from "@/lib/knowledge/facts";
import { selectPlaybook } from "@/lib/knowledge/playbookCore";
import { deriveMatchupClaims, renderTaggedClaims, type ClaimLang, type TaggedClaim } from "@/lib/knowledge/matchupClaims";
import { josa } from "@/lib/knowledge/text";
import { selectNotes, type NoteCategory, type NotePerspective, type SelectedNotes } from "./noteSelect";
import type { MatchupNotes } from "./answer";
import type { AdvisorData } from "./context";
import { selectComboNotes } from "./comboNotes";

/** 상성 카드에 그대로 보일 노트. 해설 재료도 이것을 쓴다. */
export function matchupNotes(
  data: AdvisorData,
  me: ChampionCard,
  enemy: ChampionCard,
  lang: ClaimLang = "ko_KR",
): MatchupNotes {
  const selected = selectPlaybook(data.playbooks, me, enemy);
  /*
   * 조합은 삼만 쌍에 가까워 손으로 쓸 수 없다. 그런데 **미리 만들 필요가 없다.**
   * 두 카드만 있으면 그 자리에서 계산되므로 물어볼 때 짓는다.
   *
   * 맨 앞에 둔다. 사람이 쓴 노트는 한쪽 챔피언만 보고 쓴 것이라 이 조합에 관한
   * 말이 아니고, 도출한 쪽이 물음에 더 가깝다. 이 문장들은 재료에 그대로 실리므로
   * 근거 검사도 통과한다.
   */
  const claims = deriveMatchupClaims(me, enemy);
  const tagged: TaggedClaim[] = renderTaggedClaims(me, enemy, claims, lang);
  const early = earlyResistLine(data, claims.theirs.damage, tagged, lang);
  if (early) tagged.splice(tagged.findIndex((claim) => claim.kind === "defense") + 1, 0, early);
  const derived = tagged.map((claim) => claim.text);
  /*
   * 손으로 쓴 노트는 한국어 원문이거나 옮긴 것만 붙인다(아래 `written`).
   *
   * 플레이북 3,723 건이 한국어로만 있다. 영어·중국어 프롬프트에 한국어 문단을
   * 섞으면 모델이 그 언어를 따라가 답까지 한국어가 된다.
   *
   * 도출 문장은 다르다. 코드가 언어마다 짓는 글이라 섞일 일이 없다. 예전에는 이
   * 둘을 한 덩어리로 보고 통째로 뺐고, 그래서 영어·중국어 사용자는 상성 지식을
   * 하나도 못 받았다. 갈라 둔다.
   */
  /*
   * 영어·중국어는 옮겨 둔 노트만 싣는다(`noteTranslations`). 옮긴 것이 없는 노트는 빠진다 —
   * 한국어 문단을 섞지 않는다는 원칙은 그대로다. 고리(hooks)가 붙인 문장은 한국어 문형이라
   * 번역에는 없다. 번역은 원문 노트 id 로 찾으므로 고리 문장이 붙기 전의 글이다.
   */
  const written = (list: typeof selected.mine) =>
    lang === "ko_KR"
      ? list.map(({ category, text }) => ({ category, text }))
      : list.flatMap(({ id, category }) => {
          const text = id ? data.noteTranslations?.[id] : undefined;
          return text ? [{ category, text }] : [];
        });
  const mine = written(selected.mine);
  const enemyNotes = written(selected.vsEnemy);
  return {
    mine: [...derived, ...mine.slice(0, 3).map((entry) => entry.text)],
    enemy: enemyNotes.slice(0, 3).map((entry) => entry.text),
    derived: derived.length,
    // 요약은 갈래를 보고 칸을 채운다. 카드에 보이는 세 줄보다 넓게 준다.
    plan: { claims: tagged, mine, enemy: enemyNotes },
  };
}

/** 초반 저항 아이템. 데이터에 있는 이름을 쓴다. 판올림으로 id 가 사라지면 문장을 만들지 않는다. */
const EARLY_RESIST: Record<"마법" | "물리", { component: string; boots: string }> = {
  마법: { component: "1033", boots: "3111" }, // 마법무효화의 망토 · 헤르메스의 발걸음
  물리: { component: "1029", boots: "3047" }, // 천 갑옷 · 판금 장화
};

/**
 * 상대 피해가 내 약한 저항을 파고들 때, 초반에 무엇을 먼저 사는지 한 줄.
 *
 * "그쪽이 먼저 올릴 저항입니다" 만으로는 **무엇을 사라는지**가 없다. 초반 저항은
 * 하위 아이템 하나와 신발이 정석이라 챔피언과 무관하게 말할 수 있다. 코어 아이템은
 * 챔피언마다 달라 여기서 고르지 않는다 — 그것은 사람이 쓴 노트의 몫이다.
 */
function earlyResistLine(
  data: AdvisorData,
  damage: string,
  claims: TaggedClaim[],
  lang: ClaimLang,
): TaggedClaim | undefined {
  if (!claims.some((claim) => claim.kind === "defense")) return undefined;
  if (damage !== "마법" && damage !== "물리") return undefined;
  const ids = EARLY_RESIST[damage];
  const name = (id: string) => data.items?.find((item) => String(item.id) === id)?.name;
  const component = name(ids.component);
  const boots = name(ids.boots);
  if (!component || !boots) return undefined;
  const text =
    lang === "ko_KR"
      ? `초반에는 ${josa(component, "로/으로")} 먼저 버티고 신발은 ${josa(boots, "을/를")} 고릅니다.`
      : lang === "en_US"
        ? `Start with a ${component} and take ${boots} as your boots.`
        : `前期先出${component}，鞋子选${boots}。`;
  return { kind: "defense", text };
}

/**
 * 챔피언 카드에 얹을 운용 노트. 사람이 검증한 플레이북에서 고른다.
 *
 * 카드의 수치·태그만으로 해설을 시키면 "생존력이 뛰어나다", "압박이 중요하다" 같은 어느
 * 챔피언에나 맞는 말이 나왔다. 실전에 쓸 말은 여기 있다 — "R 은 저지 불가라 CC 로 끊을
 * 수 없다", "방패를 먼저 깨고 콤보를 시작해야 한다". 카드가 그대로 보이고, 모델은 이것을
 * 재료로 우선순위만 정한다.
 *
 * 고르는 기준은 **질문**이다. 예전에는 갈래 순서가 고정이라("스킬 먼저, 콤보 다음")
 * "한타에서 뭘 조심하냐" 에도 스킬 운용 노트가 먼저 나왔다. 자료가 없어서가 아니라
 * 질문을 안 봐서 생긴 헛발이다. 고르는 일은 `noteSelect` 가 한다.
 */
export function championNotes(
  data: AdvisorData,
  card: ChampionCard,
  /** 사용자가 실제로 쓴 문장. 갈래와 관점을 여기서 읽는다. */
  question: string,
  /** 화면에서 골라 준 관점. 문장으로 못 가릴 때만 들어온다. */
  forced?: NotePerspective,
  /** 판정기가 가른 주제·관점. 없으면 낱말 표로 가른다. */
  judged?: { topic?: NoteCategory | "general"; perspective?: NotePerspective },
): SelectedNotes {
  const source = data.playbooks.get(card.id);
  if (!source) return { playing: [], against: [], perspective: "both" };
  const book = {
    playing: source.playing.filter(entry => !entry.when?.enemyIds?.length && !entry.when?.lanes?.length),
    against: source.against.filter(entry => !entry.when?.enemyIds?.length && !entry.when?.lanes?.length),
  };
  if (judged?.topic === "combo" && forced === "playing") {
    return selectComboNotes(book.playing, { question, locale: data.locale, translations: data.noteTranslations,
      reviewPending: Boolean(source.comboReview?.pendingIds.length) });
  }
  /*
   * 영어·중국어는 옮겨 둔 노트만 싣는다. 상성(`matchupNotes`)은 그렇게 하고 있었는데 챔피언 하나를 묻는 길은
   * 빠져 있어서, 영어 화면의 "Tell me about Malphite" 에 "**Playing it** 말파이트에게 방어력은 …" 처럼 한국어 원문이 나갔다.
   */
  if (data.locale && data.locale !== "ko_KR") {
    const translated = (entries: typeof book.playing) =>
      entries.flatMap((entry) => {
        const text = entry.id ? data.noteTranslations?.[entry.id] : undefined;
        return text ? [{ ...entry, text }] : [];
      });
    return selectNotes({ playing: translated(book.playing), against: translated(book.against) }, question, forced, judged);
  }
  return selectNotes(book, question, forced, judged);
}
