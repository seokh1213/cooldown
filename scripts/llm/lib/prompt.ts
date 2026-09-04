/**
 * 상성 조언 프롬프트 조립
 *
 * 컨텍스트 = [자동 도출 사실 카드] + [규칙 기반 아이템/룬/주문 후보] + [큐레이션 팁]
 * 모델에게는 "주어진 자료 밖의 수치·아이템명을 만들지 말 것" 을 강하게 요구한다.
 */
import { championCardToText, type ChampionCard } from "./facts";
import { tipsToText, type CuratedTip } from "./knowledge";
import {
  itemSelectionToText,
  keystonesToText,
  summonersToText,
  type ItemSelection,
  type RuneBrief,
  type SummonerBrief,
} from "./retrieval";
import type { ChatMessage } from "./ollama";
import { playbookToText, type SelectedPlaybook } from "./playbook";
import {
  deriveConclusions,
  deriveRecommendation,
  deriveThreatOrder,
  threatOrderToText,
} from "./prompt-analysis";
export {
  deriveConclusions,
  deriveRecommendation,
  deriveThreatOrder,
  threatOrderToText,
} from "./prompt-analysis";

export interface MatchupContext {
  patch: string;
  lane?: string;
  me: ChampionCard;
  enemy: ChampionCard;
  items: ItemSelection;
  keystones: RuneBrief[];
  summoners: SummonerBrief[];
  tips: CuratedTip[];
  playbook?: SelectedPlaybook;
  /** 컨텍스트 크기 절약 모드 (소형 모델용) */
  compact?: boolean;
  /**
   * 프롬프트 예산 프로필
   * - full: 스킬 툴팁 전문 + 후보 목록 전체 (CLI 기본, 약 8.9k 토큰)
   * - compact: 툴팁 상세 제거, 룬은 이름만 (약 6.2k 토큰)
   * - web: web-llm 4k 컨텍스트용. 후보 목록·룬 목록·공식 팁 제거하고 결론만 남긴다
   */
  profile?: PromptProfile;
}

export type PromptProfile = "full" | "compact" | "web";

export function resolveProfile(ctx: MatchupContext): PromptProfile {
  return ctx.profile ?? (ctx.compact ? "compact" : "full");
}

export const SYSTEM_PROMPT_KO = `당신은 리그 오브 레전드 상성 코치입니다. 한국어로만 답합니다.

규칙:
1. 제공된 자료 안의 사실(스탯 등급, 계수, 스킬 효과, 아이템/룬/소환사 주문 목록, 지식 카드, 검증 팁)만 근거로 삼습니다. 자료에 없는 아이템·룬·스킬 이름이나 수치를 만들어내지 마십시오.
2. [권장안 초안]이 주어지면 항목별 선택은 이미 정해진 것입니다. 그 이름을 그대로 쓰고 왜 좋은지 이유만 서술하십시오. 목록에 없는 대안을 새로 제시하지 마십시오.
3. [지식 카드]와 [검증 팁]은 사람이 확인한 정보이므로 최우선으로 반영합니다. 콤보와 라인 운영은 반드시 지식 카드의 표현을 따릅니다.
4. [자동 결론]은 데이터에서 계산된 사실이므로 그대로 반영하고, 왜 그 선택이 좋은지 한 문장씩 이유를 붙입니다.
5. 자료에 근거가 없는 항목은 "자료에 근거 없음"이라고 적고 추측을 사실처럼 쓰지 않습니다.
6. 스킬을 지목할 때는 자료에 적힌 슬롯 문자(P, Q, W, E, R)와 스킬 이름을 함께 씁니다. 슬롯을 숫자로 바꾸지 마십시오.
7. 출력 형식(아래 소제목을 그대로, 순서대로 사용):
   ## 상성 한 줄 요약
   (한 문장. 누가 유리한 구도인지와 그 이유. [권장안 초안]에 "상성 판정"이 있으면 그 판정을 따르고 뒤집지 마십시오)
   ## 라인전 구도
   (2~4문장. 서로의 사거리·쿨타임·힘의 구간을 근거로 언제 강하고 언제 약한지)
   ## 시작 아이템
   ## 첫 아이템
   ## 최종 아이템
   ## 룬
   ## 소환사 주문
   ## 조심할 스킬
   (상대 스킬을 슬롯과 이름으로 지목하고 왜 위험한지)
   ## 콤보와 플레이 팁
   (지식 카드의 콤보를 스킬 순서 그대로 적고, 딜 교환 요령을 덧붙임)`;

export function buildUserPrompt(ctx: MatchupContext): string {
  const profile = resolveProfile(ctx);
  const cardOpts =
    profile === "full"
      ? { includeSpellText: true, spellTextMax: 380 }
      : profile === "compact"
        ? { includeSpellText: false }
        : { includeSpellText: false, spellDetail: "meta" as const };
  const laneLabel = ctx.lane ? ` (${laneLabelKo(ctx.lane)} 라인)` : "";

  const sections: string[] = [];
  sections.push(`[패치] ${ctx.patch}`);
  sections.push(`[내 챔피언]\n${championCardToText(ctx.me, cardOpts)}`);
  sections.push(`[상대 챔피언]\n${championCardToText(ctx.enemy, cardOpts)}`);
  sections.push(
    `[자동 결론 — 위 데이터에서 계산된 사실, 그대로 반영하십시오]\n${deriveConclusions(ctx)
      .map((c) => `- ${c}`)
      .join("\n")}`,
  );
  if (profile === "web") {
    // 항목별 선택은 [권장안 초안]이 이미 정했으므로 후보 목록은 싣지 않는다.
    // 장화와 치유 감소만 대안으로 남긴다.
    const extras: string[] = [];
    if (ctx.items.boots.length) extras.push(`장화 대안: ${ctx.items.boots.map((b) => b.name).join(", ")}`);
    if (ctx.items.antiHeal.length)
      extras.push(`치유 감소 대안: ${ctx.items.antiHeal.slice(0, 2).map((b) => b.name).join(", ")}`);
    if (extras.length) sections.push(`[아이템 대안]\n${extras.join("\n")}`);
  } else {
    sections.push(`[아이템 후보 — 이 목록 안에서만 고르십시오]\n${itemSelectionToText(ctx.items)}`);
    if (profile === "full") {
      sections.push(`[핵심 룬 후보]\n${keystonesToText(ctx.keystones)}`);
    } else {
      sections.push(`[핵심 룬 후보] ${ctx.keystones.map((k) => `${k.name}[${k.path}]`).join(", ")}`);
    }
    sections.push(`[소환사 주문 후보] ${summonersToText(ctx.summoners)}`);
  }
  if (ctx.playbook && (ctx.playbook.mine.length || ctx.playbook.vsEnemy.length)) {
    // web 프로필에서는 이름 선택(룬·아이템) 항목을 권장안 초안이 대신하므로 서술형 지식만 남긴다
    const NARRATIVE = new Set(["combo", "phase", "laning", "teamfight", "skill"]);
    const selected =
      profile === "web"
        ? {
            mine: ctx.playbook.mine.filter((e) => NARRATIVE.has(e.category)),
            vsEnemy: ctx.playbook.vsEnemy.filter((e) => NARRATIVE.has(e.category)),
          }
        : ctx.playbook;
    sections.push(
      `[지식 카드 — 사람이 검증한 콤보/운영, 최우선 반영]\n${playbookToText(selected, ctx.me.name, ctx.enemy.name, ctx.patch)}`,
    );
  }
  sections.push(`[검증 팁]\n${tipsToText(ctx.tips, ctx.patch)}`);
  sections.push(
    `[조심할 스킬 우선순위 — 이 순서를 따르십시오]\n${threatOrderToText(deriveThreatOrder(ctx.enemy))}`,
  );
  const recommendation = deriveRecommendation(ctx);
  if (recommendation.length) {
    sections.push(
      `[권장안 초안 — 항목별 선택은 이미 정해졌습니다. 이 이름을 그대로 쓰고 이유만 서술하십시오]\n${recommendation
        .map((r) => `- ${r}`)
        .join("\n")}`,
    );
  }
  sections.push(
    `[질문] 내가 ${ctx.me.name}${laneLabel}으로 ${ctx.enemy.name}을(를) 상대합니다. 위 자료를 근거로 형식에 맞춰 조언해 주십시오.`,
  );
  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// 분할 호출 (web-llm 4k 컨텍스트 대응)
//
// 한 번에 모든 소제목을 요구하면 프롬프트가 컨텍스트 상한에 붙는다.
// 산출물을 성질에 따라 나눈다.
//  - 확정 구간(상성 판정, 아이템/룬/주문 이름): 코드가 이미 정했으므로 LLM 없이 그대로 렌더링한다.
//  - 서술 구간: 두 번의 짧은 호출로 나눈다. 필요한 자료만 실어 프롬프트를 절반 이하로 줄인다.
// ---------------------------------------------------------------------------

export interface PromptSection {
  id: "build-reasons" | "laning";
  /** 화면 소제목 */
  title: string;
  messages: ChatMessage[];
}

const SYSTEM_SPLIT_KO = `당신은 리그 오브 레전드 상성 코치입니다. 한국어로만 답합니다.

규칙:
1. 제공된 자료 안의 사실만 근거로 삼습니다. 자료에 없는 아이템·룬·스킬 이름이나 수치를 만들지 마십시오.
2. 선택은 이미 정해져 있습니다. 이름을 바꾸거나 대안을 새로 제시하지 말고 이유만 서술하십시오.
3. 스킬은 자료에 적힌 슬롯 문자(P, Q, W, E, R)와 이름을 함께 씁니다.
4. 요청받은 소제목만 출력하고 다른 소제목은 만들지 마십시오.`;

/** 확정 구간 — LLM 을 쓰지 않고 코드가 렌더링하는 부분 */
export function renderDecidedSections(ctx: MatchupContext): string {
  const lines: string[] = [];
  const verdict = ctx.tips.find((t) => t.category === "verdict");
  if (verdict) lines.push(`## 상성 한 줄 요약\n${verdict.text}`);
  // 프롬프트용 라벨을 화면용 소제목으로 바꾼다
  const TITLE: Record<string, string> = {
    "시작 아이템": "시작 아이템",
    "첫 아이템 후보": "첫 아이템",
    "코어 아이템": "최종 아이템",
    룬: "룬",
    "소환사 주문": "소환사 주문",
    "치유 감소": "치유 감소 아이템",
  };
  for (const row of deriveRecommendation(ctx)) {
    if (row.startsWith("상성 판정:")) continue;
    const sep = row.indexOf(": ");
    if (sep < 0) continue;
    const label = row.slice(0, sep);
    const value = row.slice(sep + 2);
    lines.push(`## ${TITLE[label] ?? label}\n${value}`);
  }
  return lines.join("\n\n");
}

export function buildSections(ctx: MatchupContext): PromptSection[] {
  const NARRATIVE = new Set(["combo", "phase", "laning", "teamfight", "skill"]);
  const pick = (categories: Set<string>, invert = false) => ({
    mine: (ctx.playbook?.mine ?? []).filter((e) => categories.has(e.category) !== invert),
    vsEnemy: (ctx.playbook?.vsEnemy ?? []).filter((e) => categories.has(e.category) !== invert),
  });

  // 1) 빌드 이유: 권장안 + 스탯/계수 결론만. 스킬 툴팁은 싣지 않는다.
  const statLines = deriveConclusions(ctx).filter(
    (line) => !line.startsWith("상대 군중 제어") && !line.includes("최장 기본 스킬"),
  );
  const buildKnowledge = pick(NARRATIVE, true);
  const buildPrompt = [
    `[패치] ${ctx.patch}`,
    `[구도] 내가 ${ctx.me.name}${ctx.lane ? ` (${laneLabelKo(ctx.lane)} 라인)` : ""}으로 ${ctx.enemy.name}을(를) 상대합니다.`,
    `[근거 사실]\n${statLines.map((l) => `- ${l}`).join("\n")}`,
    `[확정된 선택]\n${deriveRecommendation(ctx)
      .map((r) => `- ${r}`)
      .join("\n")}`,
    buildKnowledge.mine.length || buildKnowledge.vsEnemy.length
      ? `[지식 카드]\n${playbookToText(buildKnowledge, ctx.me.name, ctx.enemy.name, ctx.patch)}`
      : "",
    `[요청] 확정된 선택의 이유만 아래 형식으로 쓰십시오. 이름 목록은 이미 화면에 표시되므로 다시 나열하지 마십시오.
- 시작 아이템: <이유 1~2문장>
- 첫 아이템: <이유 1~2문장>
- 최종 아이템: <이유 1~2문장>
- 룬: <이유 1~2문장>
- 소환사 주문: <이유 1~2문장>`,
  ]
    .filter(Boolean)
    .join("\n\n");

  // 2) 라인전과 콤보: 스킬 메타와 서술형 지식만.
  const cardOpts = { includeSpellText: false, spellDetail: "meta" as const };
  const laneKnowledge = pick(NARRATIVE);
  const lanePrompt = [
    `[패치] ${ctx.patch}`,
    `[내 챔피언]\n${championCardToText(ctx.me, cardOpts)}`,
    `[상대 챔피언]\n${championCardToText(ctx.enemy, cardOpts)}`,
    `[근거 사실]\n${deriveConclusions(ctx)
      .filter((l) => l.includes("군중 제어") || l.includes("최장 기본 스킬") || l.includes("고정 피해") || l.includes("사거리"))
      .map((l) => `- ${l}`)
      .join("\n")}`,
    `[조심할 스킬 우선순위 — 이 순서와 이유를 그대로 쓰십시오]\n${threatOrderToText(deriveThreatOrder(ctx.enemy))}`,
    `[지식 카드 — 표현을 그대로 따르십시오]\n${playbookToText(laneKnowledge, ctx.me.name, ctx.enemy.name, ctx.patch)}`,
    ctx.tips.filter((t) => t.category !== "verdict").length
      ? `[검증 팁]\n${tipsToText(
          ctx.tips.filter((t) => t.category !== "verdict"),
          ctx.patch,
        )}`
      : "",
    `[요청] 아래 소제목으로만 답하십시오.
## 라인전 구도
(2~4문장. 레벨 구간, 쿨타임, 사거리를 근거로 언제 강하고 언제 약한지)
## 조심할 스킬
(상대 스킬 중 가장 위험한 것부터 슬롯과 이름으로 지목하고 이유를 문장으로 풀어 씁니다. "1순위" 같은 내부 표기를 그대로 복사하지 마십시오)
## 콤보와 플레이 팁
(지식 카드의 콤보를 스킬 순서 그대로 적고 딜 교환 요령을 덧붙임)`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return [
    {
      id: "build-reasons",
      title: "선택 이유",
      messages: [
        { role: "system", content: SYSTEM_SPLIT_KO },
        { role: "user", content: buildPrompt },
      ],
    },
    {
      id: "laning",
      title: "라인전",
      messages: [
        { role: "system", content: SYSTEM_SPLIT_KO },
        { role: "user", content: lanePrompt },
      ],
    },
  ];
}

/**
 * 연속 대화(chain) 방식
 *
 * 분할 호출은 자료를 두 번 실어 보내므로 prefill 을 두 번 낸다.
 * 같은 대화를 이어가면 첫 턴의 KV 캐시가 남아 두 번째 턴은 질문 문장만 prefill 한다.
 * 대신 컨텍스트에 첫 턴 답변이 누적되므로 4k 예산에서는 출력 길이를 관리해야 한다.
 */
export interface ChainTurn {
  id: "build-reasons" | "laning";
  title: string;
  /** 이 턴에서 새로 추가되는 user 메시지 */
  user: string;
}

export function buildChain(ctx: MatchupContext): { system: string; turns: ChainTurn[] } {
  const cardOpts = { includeSpellText: false, spellDetail: "meta" as const };

  const shared = [
    `[패치] ${ctx.patch}`,
    `[구도] 내가 ${ctx.me.name}${ctx.lane ? ` (${laneLabelKo(ctx.lane)} 라인)` : ""}으로 ${ctx.enemy.name}을(를) 상대합니다.`,
    `[내 챔피언]\n${championCardToText(ctx.me, cardOpts)}`,
    `[상대 챔피언]\n${championCardToText(ctx.enemy, cardOpts)}`,
    `[근거 사실]\n${deriveConclusions(ctx)
      .map((l) => `- ${l}`)
      .join("\n")}`,
    `[조심할 스킬 우선순위 — 이 순서와 이유를 그대로 쓰십시오]\n${threatOrderToText(deriveThreatOrder(ctx.enemy))}`,
    `[확정된 선택]\n${deriveRecommendation(ctx)
      .map((r) => `- ${r}`)
      .join("\n")}`,
    ctx.playbook
      ? `[지식 카드 — 표현을 그대로 따르십시오]\n${playbookToText(ctx.playbook, ctx.me.name, ctx.enemy.name, ctx.patch)}`
      : "",
    ctx.tips.filter((t) => t.category !== "verdict").length
      ? `[검증 팁]\n${tipsToText(
          ctx.tips.filter((t) => t.category !== "verdict"),
          ctx.patch,
        )}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    system: SYSTEM_SPLIT_KO,
    turns: [
      {
        id: "build-reasons",
        title: "선택 이유",
        user: `${shared}

[요청] 확정된 선택의 이유만 아래 형식으로 쓰십시오. 이름 목록은 이미 화면에 표시되므로 다시 나열하지 마십시오.
- 시작 아이템: <이유 1~2문장>
- 첫 아이템: <이유 1~2문장>
- 최종 아이템: <이유 1~2문장>
- 룬: <이유 1~2문장>
- 소환사 주문: <이유 1~2문장>`,
      },
      {
        id: "laning",
        title: "라인전",
        // 자료는 위 대화에 이미 있으므로 질문만 보낸다 (KV 캐시 재사용)
        user: `이어서 위 자료만 근거로 아래 소제목으로 답하십시오. 자료를 다시 요약하지 마십시오.
## 라인전 구도
(2~4문장. 레벨 구간, 쿨타임, 사거리를 근거로 언제 강하고 언제 약한지)
## 조심할 스킬
(우선순위 순서대로 슬롯과 이름을 지목하고 이유를 문장으로 풀어 씁니다. "1순위" 같은 내부 표기를 그대로 복사하지 마십시오)
## 콤보와 플레이 팁
(지식 카드의 콤보를 스킬 순서 그대로 적고 딜 교환 요령을 덧붙임)`,
      },
    ],
  };
}

export function buildMessages(ctx: MatchupContext): ChatMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT_KO },
    { role: "user", content: buildUserPrompt(ctx) },
  ];
}

export function laneLabelKo(lane: string): string {
  const map: Record<string, string> = {
    top: "탑",
    jungle: "정글",
    mid: "미드",
    bot: "바텀",
    adc: "바텀",
    support: "서포터",
    sup: "서포터",
  };
  return map[lane] ?? lane;
}
