/**
 * 조언 품질 평가
 *
 * 브라우저가 보내는 것과 **같은 프롬프트**를 만들어 로컬 Ollama 로 돌린다.
 * 브라우저에서 한 문항에 20초가 걸려 반복 점검이 안 되므로, 같은 가중치
 * (`gemma4:e2b` ↔ `onnx-community/gemma-4-E2B-it-ONNX`)를 CLI 로 돌려 고리를 짧게 만든다.
 *
 * 채점은 문장 비교가 아니라 **근거 대조**다. 답에 반드시 있어야 할 것(must)과
 * 있으면 안 되는 것(forbid)을 자료에서 확인할 수 있는 사실로만 적는다.
 *
 * 사용:
 *   npm run llm:eval-advisor
 *   npm run llm:eval-advisor -- --model gemma4:e4b
 *   npm run llm:eval-advisor -- --only 수치
 */
import * as fs from "fs";
import * as path from "path";
import { championCardToText, type ChampionCard } from "./lib/facts";
import { playbookToText, type Playbook } from "./lib/playbookCore";
import { indexRules, buildRuleAnswer, findMentionedRules, findRulesMentioning } from "./lib/rules";
import { findMechanics, mechanicsToText, type MechanicsIndex } from "./lib/mechanics";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import { ollamaChat } from "./lib/ollama";

interface Case {
  group: string;
  question: string;
  /** 답에 반드시 있어야 하는 것. 자료에서 확인되는 사실만 적는다. */
  must: RegExp[];
  /** 답에 있으면 안 되는 것. 흔한 헛말을 잡는다. */
  forbid?: RegExp[];
}

const CASES: Case[] = [
  // --- 수치 조회: 카드에 있는 숫자를 그대로 옮기는가 ---
  {
    group: "수치",
    question: "럼블 마법저항력 1렙에 몇이야?",
    must: [/28/],
    forbid: [/확실하지 않|알 수 없|자료가 없/],
  },
  {
    group: "수치",
    question: "럼블 E 마법저항력 감소 수치 알려줘",
    must: [/10/, /18/],
    forbid: [/확실하지 않|알 수 없/, /초당/],
  },
  {
    group: "수치",
    question: "가렌 Q 쿨타임 몇 초야?",
    must: [/\d/],
    forbid: [/확실하지 않|알 수 없/],
  },
  {
    group: "수치",
    question: "럼블 마법저항력 1렙에 몇이고 오공은 몇이야?",
    must: [/28/, /오공|원숭이/],
    forbid: [/확실하지 않|알 수 없/],
  },
  {
    group: "수치",
    question: "제드 R 계수가 어떻게 돼?",
    must: [/\d+%/],
    forbid: [/확실하지 않|알 수 없/],
  },

  // --- 스킬 사실: 이름과 효과를 지어내지 않는가 ---
  {
    group: "스킬",
    question: "오공 궁극기 이름이 뭐야?",
    must: [/회전격/],
    forbid: [/Dragon|드래곤|폭풍/i],
  },
  {
    group: "스킬",
    question: "럼블 E에는 마법저항력 감소가 있나?",
    must: [/감소|깎/],
    forbid: [/없습니다|않습니다/],
  },
  {
    group: "스킬",
    question: "쓰레쉬 W로 움직이는 건 누구야?",
    must: [/아군/],
  },
  {
    group: "스킬",
    question: "나서스 Q는 중첩이 쌓이나?",
    must: [/중첩|스택/],
    forbid: [/쌓이지 않|없습니다/],
  },
  {
    group: "스킬",
    question: "아리 W는 이동기야?",
    // 여우불은 투사체다. 이동기라고 답하면 안 된다.
    must: [/아닙니다|아니|이동기가 아/],
    forbid: [/이동기입니다|맞습니다/],
  },

  // --- 아이템: 설명문에서 답이 나오는가 ---
  {
    group: "아이템",
    question: "쇼진의 창은 궁극기에도 적용되나요?",
    // 판정을 내리지 않고 근거 문장을 낸다. 요약시켰더니 "적용되지 않습니다" 로 뒤집었다.
    must: [/챔피언 스킬/, /3% 증가/],
    forbid: [/적용되지 않|해당하지 않/],
  },
  {
    group: "아이템",
    question: "쇼진의 창 스킬 가속 몇이야?",
    must: [/25/],
    forbid: [/확실하지 않|알 수 없/],
  },
  {
    group: "아이템",
    question: "몰락한 왕의 검은 어떤 효과야?",
    must: [/안개의 검/, /할퀴는 그림자/],
    forbid: [/확실하지 않|알 수 없/],
  },
  {
    group: "아이템",
    question: "몰락한 왕의 검에 둔화가 있나요?",
    // 설명문에 "둔화시킵니다" 가 있다. 모델은 "둔화 효과가 없습니다" 라고 답했었다.
    must: [/네\. 몰락한 왕의 검에 둔화가 있습니다/],
    forbid: [/없습니다/],
  },
  {
    group: "아이템",
    question: "몰락한 왕의 검에 보호막이 있나요?",
    must: [/아니요/],
  },

  // --- 부정문: 뒤집지 않는가 ---
  {
    group: "부정",
    question: "가렌은 마나를 쓰나?",
    must: [/없|안 쓰|사용하지 않|기력|아닙니다/],
  },

  // --- 어려운 조회: 모델 경로에 남은 여지를 잰다 ---
  {
    group: "난이도",
    question: "럼블 18레벨 체력 얼마야?",
    must: [/2425/],
    forbid: [/확실하지 않|알 수 없/],
  },
  {
    group: "난이도",
    question: "케이틀린 R 계수는 추가 공격력이야 총 공격력이야?",
    must: [/추가 공격력/],
    forbid: [/총 공격력입니다/],
  },
  {
    group: "난이도",
    question: "럼블 위험 상태일 때 E 피해량은?",
    must: [/82\.5|232\.5/],
    forbid: [/확실하지 않|알 수 없/],
  },
  {
    group: "난이도",
    question: "가렌 스킬 이름 전부 알려줘",
    must: [/결정타/, /용기/, /심판/],
  },
  {
    group: "난이도",
    question: "제드 W 쿨타임 1레벨에 몇이야?",
    must: [/\d/],
    forbid: [/확실하지 않|알 수 없/],
  },
  {
    group: "난이도",
    question: "아리 Q 마나 소모량은?",
    must: [/\d/],
    forbid: [/확실하지 않|알 수 없/],
  },
];


interface Loaded {
  cards: Map<string, ChampionCard>;
  byName: ChampionCard[];
  playbooks: Record<string, Playbook>;
  ruleIndex: ReturnType<typeof indexRules>;
  mechanics: MechanicsIndex;
  items: Array<{ name: string; description?: string }>;
  patch: string;
  system: string;
  effectTags: string[];
}

function load(): Loaded {
  const patch = resolvePatchVersion();
  const llm = path.join(PUBLIC_DATA_ROOT, patch, "llm");
  const cardFile = JSON.parse(
    fs.readFileSync(path.join(llm, "champion-cards-ko_KR.json"), "utf8"),
  ) as { cards: ChampionCard[] };
  const bundle = JSON.parse(
    fs.readFileSync(path.join(llm, "advisor-knowledge.json"), "utf8"),
  ) as {
    playbooks: Record<string, Playbook>;
    rules?: Parameters<typeof indexRules>[0];
    mechanics?: MechanicsIndex;
  };
  const items = (
    JSON.parse(
      fs.readFileSync(path.join(PUBLIC_DATA_ROOT, patch, "items-normalized-ko_KR.json"), "utf8"),
    ) as { items: Array<{ name: string; description?: string }> }
  ).items;
  return {
    cards: new Map(cardFile.cards.map((c) => [c.id, c])),
    byName: [...cardFile.cards].sort((a, b) => b.name.length - a.name.length),
    playbooks: bundle.playbooks,
    ruleIndex: indexRules(bundle.rules ?? []),
    mechanics: bundle.mechanics ?? [],
    items,
    patch,
    effectTags: [
      ...new Set(cardFile.cards.flatMap((c) => c.spells.flatMap((sp) => sp.effects))),
    ].sort((a, b) => b.length - a.length),
    system: fs.readFileSync("src/lib/advisor/persona.ts", "utf8").includes("KO = `")
      ? readPersona()
      : "",
  };
}

/** persona.ts 의 한국어 블록을 그대로 읽는다. 화면과 같은 문구를 써야 한다. */
function readPersona(): string {
  const source = fs.readFileSync("src/lib/advisor/persona.ts", "utf8");
  const match = /const KO = `([\s\S]*?)`;/.exec(source);
  return match ? match[1] : "";
}

function htmlToText(html: string): string {
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * 화면(AdvisorPanel)과 **같은 순서로** 자료를 고른다.
 * 순서가 다르면 여기 점수는 화면 품질을 대변하지 못한다.
 */
/** 화면의 buildTagAnswer 와 같은 판정. 효과 태그로 답이 정해지는 질문을 코드가 답한다. */
function tagAnswerFor(data: Loaded, card: ChampionCard, question: string): string | undefined {
  const asked = data.effectTags.filter((tag) => question.includes(tag));
  if (asked.length === 0) return undefined;
  const slot = /\b([QWER])\b|패시브/i.exec(question);
  const wanted = slot
    ? [slot[0].toUpperCase() === "패시브" ? "P" : slot[0].toUpperCase()]
    : ["P", "Q", "W", "E", "R"];
  const lines: string[] = [];
  for (const tag of asked) {
    const hits = card.spells.filter(
      (spell) => wanted.includes(spell.slot) && spell.effects.includes(tag),
    );
    if (hits.length === 0) {
      lines.push(
        slot
          ? `아니요. ${card.name} ${wanted[0]} 에는 ${tag}가 없습니다.`
          : `아니요. ${card.name}에게는 ${tag} 스킬이 없습니다.`,
      );
      continue;
    }
    lines.push(`네. ${hits.map((h) => `${h.slot} ${h.name}`).join(", ")}에 ${tag}가 있습니다.`);
    for (const hit of hits) lines.push(`- ${hit.slot} ${hit.name}: ${hit.summary}`);
  }
  return `${lines.join("\n")}\n\n패치 ${data.patch} 기준 스킬 효과입니다.`;
}

function buildPrompt(data: Loaded, question: string): { prompt: string; route: string } {
  const named = findMentionedRules(data.ruleIndex, question);
  if (named.length) {
    const related = findRulesMentioning(data.ruleIndex, named.map((r) => r.name));
    return { prompt: buildRuleAnswer([...named, ...related], data.patch) ?? "", route: "규칙(코드)" };
  }

  const champions = data.byName
    .filter((c) => c.name.length >= 2 && question.includes(c.name))
    .slice(0, 3);
  if (champions.length === 1) {
    const tagAnswer = tagAnswerFor(data, champions[0], question);
    if (tagAnswer) return { prompt: tagAnswer, route: "태그(코드)" };
  }
  if (champions.length > 0) {
    const parts = [`[패치] ${data.patch}`];
    for (const card of champions) {
      parts.push(
        `[${card.name} 자료]\n${championCardToText(card, {
          includeSpellText: true,
          spellTextMax: champions.length > 1 ? 420 : 600,
        })}`,
      );
      const book = data.playbooks[card.id];
      if (book && champions.length === 1) {
        parts.push(
          `[지식 카드]\n${playbookToText(
            { mine: book.playing.slice(0, 4), vsEnemy: book.against.slice(0, 3) },
            card.name,
            card.name,
            data.patch,
          )}`,
        );
      }
    }
    parts.push("[요청] 위 자료 안의 사실만 근거로 삼으십시오. 자료에 없는 수치를 지어내지 마십시오.");
    return { prompt: `${data.system}\n\n${parts.join("\n\n")}`, route: "챔피언" };
  }

  const item = data.items
    .filter((i) => i.name && i.name.length >= 2 && i.description)
    .sort((a, b) => b.name.length - a.name.length)
    .find((i) => question.includes(i.name));
  if (item) {
    const body = htmlToText(item.description ?? "");
    const asked = data.effectTags.filter((tag) => question.includes(tag));
    const verdicts = asked.map((tag) => {
      const evidence = body
        .split(/\n|(?<=니다\.)\s*/)
        .map((line) => line.trim())
        .find((line) => line.includes(tag));
      return evidence
        ? `네. ${item.name}에 ${tag}가 있습니다.\n> ${evidence}`
        : `아니요. ${item.name} 설명에 ${tag}는 없습니다.`;
    });
    return {
      prompt:
        (verdicts.length ? `${verdicts.join("\n\n")}\n\n` : "") +
        `## ${item.name}\n${body}\n\n패치 ${data.patch} 기준 아이템 설명입니다.`,
      route: "아이템(코드)",
    };
  }

  const mech = mechanicsToText(findMechanics(data.mechanics, question));
  if (mech) return { prompt: mech, route: "메커니즘(코드)" };

  return { prompt: data.system, route: "자료 없음" };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const model = get("--model") ?? "gemma4:e2b";
  const only = get("--only");

  const data = load();
  const cases = only ? CASES.filter((c) => c.group === only) : CASES;

  let pass = 0;
  const failures: string[] = [];
  console.log(`모델 ${model} / 문항 ${cases.length}개\n`);

  for (const testCase of cases) {
    const { prompt, route } = buildPrompt(data, testCase.question);
    const started = Date.now();
    // 코드가 직접 답하는 경로는 모델을 거치지 않는다. 화면과 같다.
    const answer = route.includes("코드")
      ? prompt
      : (
          await ollamaChat({
            model,
            temperature: 0,
            messages: [
              { role: "user", content: `${prompt}\n\n[질문] ${testCase.question}` },
            ],
          })
        ).content;
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    const missing = testCase.must.filter((re) => !re.test(answer));
    const banned = (testCase.forbid ?? []).filter((re) => re.test(answer));
    const ok = missing.length === 0 && banned.length === 0;
    if (ok) pass += 1;

    console.log(`${ok ? "✅" : "❌"} [${testCase.group}/${route}] ${testCase.question}  (${seconds}s)`);
    console.log(`   ${answer.replace(/\s+/g, " ").slice(0, 170)}`);
    if (!ok) {
      const reason = [
        missing.length ? `누락 ${missing.map(String).join(", ")}` : "",
        banned.length ? `금지어 ${banned.map(String).join(", ")}` : "",
      ].filter(Boolean).join(" / ");
      console.log(`   → ${reason}`);
      failures.push(`${testCase.group}: ${testCase.question} — ${reason}`);
    }
    console.log();
  }

  console.log(`통과 ${pass}/${cases.length}`);
  if (failures.length) {
    console.log("\n실패:");
    for (const f of failures) console.log(`  ${f}`);
  }
}

main();
