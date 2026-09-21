/**
 * 질문에 맞는 노트를 고른다
 *
 * 플레이북에는 챔피언마다 사람이 검증한 문장이 갈래별로 들어 있다(스킬·콤보·라인전·
 * 시간대·한타·상황 아이템). 지금까지는 그 갈래를 **고정 순서**로 집었다. 스킬이 먼저고
 * 콤보가 다음이고 하는 식이라, "한타에서 뭘 조심해야 하냐" 고 물어도 스킬 운용 노트가
 * 먼저 나왔다. 자료는 있는데 질문과 안 맞는 것을 내놓고 있었다.
 *
 * 여기서 하는 일은 두 가지다.
 *
 *   갈래  질문의 낱말로 어느 갈래를 앞에 둘지 정한다.
 *   관점  "말파로" 냐 "말파 상대로" 냐에 따라 플레이 노트와 상대 노트의 비중을 바꾼다.
 *
 * **모델을 거치지 않는다.** 고르는 일이지 쓰는 일이 아니라서 틀릴 자리가 없다. 모델이
 * 없는 기기에서도 그대로 동작하고, 모델이 있을 때는 같은 선택이 해설 재료로 들어가
 * 관점이 섞이는 오류를 줄인다.
 */

/** 플레이북이 쓰는 갈래. 데이터에 있는 값 그대로다. */
export type NoteCategory =
  | "skill"
  | "combo"
  | "laning"
  | "phase"
  | "teamfight"
  | "situational-item"
  | "escape-window";

export interface NoteEntry {
  category: string;
  text: string;
}

export interface PlaybookLike {
  playing: NoteEntry[];
  against: NoteEntry[];
}

/**
 * 질문의 낱말 → 갈래.
 *
 * 표를 손으로 적는 것이 아니라 **묻는 말**을 적는 것이다. 챔피언·아이템 같은 자료는
 * 여전히 데이터에서 온다. 위에 있을수록 먼저 본다.
 */
const TOPIC_WORDS: Array<[RegExp, NoteCategory]> = [
  [/콤보|연계|순서|어떻게\s*쓰|스킬\s*순|딜\s*교환|딜교/, "combo"],
  [/한타|교전|팀\s*파이트|집단|5대5|오대오|난전/, "teamfight"],
  [/라인전|라인|초반|레벨\s*[123]|cs|파밍|견제|주도권/, "laning"],
  [/중반|후반|스케일|성장|운영|오브젝트|드래곤|바론|전령|스플릿/, "phase"],
  // 아이템 이름이 아니라 **스탯**으로 묻는 경우가 더 많다. "마법 저항력 올려야 하나"
  // 가 아무 갈래에도 안 걸려서, 정작 그 답을 담은 노트가 뽑히지 않고 있었다.
  [
    /아이템|템|빌드|시작\s*템|신화|코어|방어구|갑옷|방어력|저항력|저항|체력|강인함|치유\s*감소|올려야|올릴|쌓|스탯|카운터\s*스탯/,
    "situational-item",
  ],
  // "언제 물어야 하나" 는 상대의 이동기와 그 공백을 묻는 것이다.
  [/언제\s*물|물어야|무는|진입|파고|갱|짤라|잘라|도망|빠져나|이동기|점멸|각\s*(이|을|볼)/, "escape-window"],
  [/스킬|패시브|궁|궁극기|[QWER]\s*스킬|쿨|사거리|능력/, "skill"],
];

/** 아무 낱말도 안 걸렸을 때의 순서. 예전 동작과 같다. */
const DEFAULT_ORDER: NoteCategory[] = [
  "skill",
  "combo",
  "laning",
  "phase",
  "teamfight",
  "situational-item",
  "escape-window",
];

/**
 * 질문이 어느 갈래를 묻는지 본다.
 *
 * 하나만 고르지 않는다. "라인전에서 콤보 어떻게 넣어" 는 둘 다 맞다. 걸린 갈래를 앞으로
 * 당기고 나머지는 기본 순서로 뒤에 붙여, 고른 갈래에 자료가 없어도 빈손이 되지 않게 한다.
 */
export function noteOrder(question: string): NoteCategory[] {
  const hit: NoteCategory[] = [];
  for (const [pattern, category] of TOPIC_WORDS) {
    if (pattern.test(question) && !hit.includes(category)) hit.push(category);
  }
  return [...hit, ...DEFAULT_ORDER.filter((category) => !hit.includes(category))];
}

export type NotePerspective = "playing" | "against" | "both";

/**
 * 내가 그 챔피언을 하는 질문인가, 상대하는 질문인가.
 *
 * 한국어는 조사가 이것을 거의 다 알려 준다. "말파로" 는 내가 말파고, "말파 상대로" 나
 * "말파 어떻게 이겨" 는 내가 말파가 아니다. 둘 다 아니면 가리지 않는다.
 *
 * 챔피언이 둘 나오는 상성 질문은 여기로 오지 않는다. 그쪽은 `matchupIntent` 가 먼저
 * 가른다. 여기 오는 것은 챔피언이 하나인 질문이다.
 */
export function notePerspective(question: string): NotePerspective {
  const against =
    /상대|맞상대|카운터|이기|이길|막|상대법|공략법|어떻게\s*잡|까다로|상성|언제\s*물|물어야|무는|잘라/.test(question);
  const playing = /(으로|로)\s|플레이|운용|하는\s*법|잘하|숙련|빌드|템|어떻게\s*쓰|콤보/.test(question);
  if (against && !playing) return "against";
  if (playing && !against) return "playing";
  return "both";
}

/**
 * 고른 갈래 순서대로 노트를 집는다.
 *
 * 같은 갈래 안에서는 파일에 적힌 순서를 지킨다. 사람이 중요한 것부터 적어 두었다.
 */
function pick(entries: NoteEntry[], order: NoteCategory[], count: number): string[] {
  const rank = (category: string) => {
    const index = order.indexOf(category as NoteCategory);
    return index === -1 ? order.length : index;
  };
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => rank(a.entry.category) - rank(b.entry.category) || a.index - b.index)
    .slice(0, count)
    .map(({ entry }) => entry.text);
}

/**
 * 관점에 따라 몇 개씩 집을지.
 *
 * 묻지 않은 쪽을 0 으로 지우지는 않는다. "말파로 어떻게 해" 라고 물어도 말파를 상대하는
 * 쪽 노트 한둘은 약점을 알려 주므로 쓸모가 있다. 다만 주가 되어서는 안 된다.
 */
const SHARE: Record<NotePerspective, { playing: number; against: number }> = {
  playing: { playing: 4, against: 1 },
  against: { playing: 1, against: 4 },
  both: { playing: 3, against: 3 },
};

export interface SelectedNotes {
  playing: string[];
  against: string[];
  perspective: NotePerspective;
}

export function selectNotes(book: PlaybookLike, question: string): SelectedNotes {
  const order = noteOrder(question);
  const perspective = notePerspective(question);
  const share = SHARE[perspective];
  return {
    playing: pick(book.playing, order, share.playing),
    against: pick(book.against, order, share.against),
    perspective,
  };
}
