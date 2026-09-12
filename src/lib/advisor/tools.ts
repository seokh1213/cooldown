/**
 * 조회 도구
 *
 * 라우터가 자료를 골라 한 번에 밀어 넣는 것이 기본이다. 그것으로 답이 되는 질문은
 * 그 경로가 빠르고(0~4초) 정확하다(22/22).
 *
 * 도구는 **라우터가 못 가르는 복합 질문**에만 쓴다. 로컬에서 재 보니
 * "럼블이랑 오공 중에 1레벨 체력 누가 더 높아?" 를 도구 두 번으로 정확히 답했다(640 대 610).
 * 한 번에 밀어 넣는 방식으로는 두 카드를 다 줘도 모델이 텍스트에서 비교해야 한다.
 *
 * 대가는 시간이다. 오갈 때마다 프롬프트를 처음부터 다시 읽으므로 브라우저에서는
 * 도구 두 번이면 30~50초가 걸린다. 그래서 기본값이 아니라 마지막 수단이다.
 */
import type { ChampionCard } from "../../../scripts/llm/lib/facts";
import type { NormalizedItem } from "@/types/combatNormalized";

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description?: string; enum?: string[] }>;
      required: string[];
    };
  };
}

export const ADVISOR_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "champion_stat",
      description: "챔피언의 기본 능력치를 1레벨과 18레벨 값으로 돌려준다.",
      parameters: {
        type: "object",
        properties: {
          champion: { type: "string", description: "챔피언 한국어 이름 (예: 럼블)" },
          stat: {
            type: "string",
            description: "능력치 이름",
            enum: ["health", "armor", "magicResist", "attackDamage", "attackSpeed", "moveSpeed"],
          },
        },
        required: ["champion", "stat"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "champion_spell",
      description: "챔피언 스킬 하나의 이름·설명·쿨타임·효과를 돌려준다.",
      parameters: {
        type: "object",
        properties: {
          champion: { type: "string", description: "챔피언 한국어 이름" },
          slot: { type: "string", description: "스킬 슬롯", enum: ["P", "Q", "W", "E", "R"] },
        },
        required: ["champion", "slot"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "item_text",
      description: "아이템 설명문을 그대로 돌려준다.",
      parameters: {
        type: "object",
        properties: { item: { type: "string", description: "아이템 한국어 이름" } },
        required: ["item"],
      },
    },
  },
];

export interface ToolCall {
  name: string;
  args: Record<string, string>;
}

/**
 * 모델이 뱉은 도구 호출을 읽는다.
 *
 * Gemma 는 `<|tool_call>call:이름{키:"값",…}` 꼴로 낸다. JSON 이 아니라 직접 읽어야 한다.
 */
export function parseToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const match of text.matchAll(/<\|tool_call>call:([a-z_]+)\s*\{([^}]*)\}/gi)) {
    const args: Record<string, string> = {};
    for (const pair of match[2].matchAll(/([a-z_]+)\s*:\s*"?([^",]*)"?/gi)) {
      args[pair[1].trim()] = pair[2].trim();
    }
    calls.push({ name: match[1], args });
  }
  return calls;
}

export interface ToolContext {
  cards: ChampionCard[];
  items: NormalizedItem[];
  patch: string;
}

function findCard(ctx: ToolContext, name: string): ChampionCard | undefined {
  const wanted = name.replace(/\s+/g, "").toLowerCase();
  return ctx.cards.find(
    (c) => c.name.replace(/\s+/g, "").toLowerCase() === wanted || c.id.toLowerCase() === wanted,
  );
}

/** 도구를 실제로 실행한다. 결과 문장은 그대로 모델에게 돌아간다. */
export function runTool(ctx: ToolContext, call: ToolCall): string {
  if (call.name === "champion_stat") {
    const card = findCard(ctx, call.args.champion ?? "");
    if (!card) return `그런 챔피언이 없습니다: ${call.args.champion}`;
    const stat = (card.stats as Record<string, { lv1: number; lv18: number }>)[call.args.stat];
    if (!stat) return `그런 능력치가 없습니다: ${call.args.stat}`;
    return `${card.name} ${call.args.stat}: 1레벨 ${stat.lv1}, 18레벨 ${stat.lv18}`;
  }
  if (call.name === "champion_spell") {
    const card = findCard(ctx, call.args.champion ?? "");
    if (!card) return `그런 챔피언이 없습니다: ${call.args.champion}`;
    const spell = card.spells.find((s) => s.slot === (call.args.slot ?? "").toUpperCase());
    if (!spell) return `그런 슬롯이 없습니다: ${call.args.slot}`;
    return [
      `${card.name} ${spell.slot} ${spell.name}`,
      `쿨타임 ${spell.cooldown}`,
      spell.effects.length ? `효과 ${spell.effects.join(", ")}` : "",
      spell.text,
    ].filter(Boolean).join("\n");
  }
  if (call.name === "item_text") {
    const wanted = (call.args.item ?? "").replace(/\s+/g, "");
    const item = ctx.items.find((i) => i.name?.replace(/\s+/g, "") === wanted);
    if (!item) return `그런 아이템이 없습니다: ${call.args.item}`;
    const body = (item.description ?? "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .trim();
    return `${item.name}\n${body}`;
  }
  return `모르는 도구입니다: ${call.name}`;
}

/**
 * 이 질문에 도구를 태울지 정한다.
 *
 * 라우터가 자료를 붙일 수 있으면 그쪽이 빠르므로 도구를 쓰지 않는다.
 * 챔피언이 둘 이상 나오고 비교를 묻는 질문만 도구로 보낸다.
 */
const COMPARISON = /더\s*(높|많|센|강|단단|긴|짧|빠|느)|누가|어느\s*쪽|비교|중에/;

export function needsTools(question: string, championCount: number): boolean {
  return championCount >= 2 && COMPARISON.test(question);
}
