import type { ChampionCard,SpellFact,SpellFormFact } from "@/domain/knowledge/cards/contracts";
import { aliasAt } from "@/domain/knowledge/notes/searchAliases";
import type { Language } from "@/shared/i18n";

// 형태 이름과 툴팁의 상태 표현만 묶는다. 스킬 이름에 든 다른 형태 이름은 상태가 아니다.
const LABELS = [
  ["인간", "Human", "人类"], ["거미", "Spider", "蜘蛛"], ["쿠거", "Cougar", "美洲狮"],
  ["미니", "Mini", "小型"], ["메가", "Mega", "巨型"],
  ["해머", "망치", "Hammer", "战锤"], ["캐논", "Cannon", "加农炮"],
  ["탑승", "Mounted", "骑乘"],
  ["미탑승", "비탑승", "보행", "중갑", "Dismounted", "Armored", "非骑乘", "步行", "披甲", "not mounted"],
  ["돌출", "Unburrowed", "未潜地", "位于地表", "not burrowed"],
  ["매복", "Burrowed", "潜地", "位于地下"],
];
interface Mention { start: number; end: number; key: string; state: boolean }

function mentions(text: string, forms: SpellFormFact[], champion: string): Mention[] {
  const found: Mention[] = [];
  for (const form of forms) {
    const aliases = LABELS.find(group => group.includes(form.label)) ?? [form.label];
    const names = aliases.map(name => ({ name, state: true }));
    names.push({ name: form.name, state: false });
    if (champion === "Kled" && form.key === "B") {
      for (const name of ["스칼에서 내린", "스칼에서 내려", "off Skaarl", "off of Skaarl"]) names.push({ name, state: true });
    }
    for (const { name, state } of names) {
      if (!name) continue;
      let start = aliasAt(text, name);
      while (start >= 0) {
        const end = start + name.length;
        found.push({ start, end, key: form.key, state });
        const next = aliasAt(text.slice(end), name);
        start = next < 0 ? -1 : end + next;
      }
    }
  }
  const states = found.filter(item => item.state && (/^\s*(?:상태|폼|형태에서|state\b|状态|形态下)/i.test(text.slice(item.end))
    || /^\s*form\b/i.test(text.slice(item.end)) && /\bin\s*$/i.test(text.slice(0, item.start))));
  const usable = found.filter(item => item.state || !states.some(state => state.start < item.end && state.end > item.start));
  // 미탑승 안의 탑승, Unburrowed 안의 Burrowed, 스킬 전체 이름 안의 형태 낱말을 제외한다.
  return usable.filter(item => !usable.some(other => other.start <= item.start && other.end >= item.end
    && other.end - other.start > item.end - item.start));
}

function clarification(spell: SpellFact, lang: Language): string {
  const labels = spell.forms?.map(form => form.label).join(" / ") ?? "";
  return lang === "en_US" ? `Which form do you mean${labels ? `: ${labels}` : ""}?`
    : lang === "zh_CN" ? `请明确技能形态${labels ? `：${labels}` : ""}。`
      : `어느 형태의 스킬인지 알려주세요${labels ? `: ${labels}` : ""}.`;
}

export function requestedSpellForms(card: ChampionCard, spell: SpellFact, question: string): SpellFormFact[] {
  if (!spell.forms?.length || /말고|아니|\bnot\b|不是/i.test(question)) return [];
  const keys = new Set(mentions(question, spell.forms, card.id).map(item => item.key));
  return spell.forms.filter(form => keys.has(form.key) && form.text.trim());
}

export function selectSpellForm(card: ChampionCard, spell: SpellFact, question: string, lang: Language):
  { spell: SpellFact; selected: boolean; clarification?: string } {
  if (!spell.forms?.length) return { spell, selected: false };
  let text = question;
  for (const name of [card.name, card.id, card.title]) {
    if (!name) continue;
    let start = aliasAt(text, name);
    while (start >= 0) {
      text = `${text.slice(0, start)}${" ".repeat(name.length)}${text.slice(start + name.length)}`;
      start = aliasAt(text, name);
    }
  }
  const found = mentions(text, spell.forms, card.id);
  const keys = new Set(found.map(item => item.key));
  const negated = found.some(item => /^(?:\s*(?:이|가)?\s*아니|\s*말고|\s*아닌|\s*(?:is\s+)?not\b|\s*不是)/i.test(question.slice(item.end))
    || /(?:\bnot|不是|非)\s*$/i.test(question.slice(0, item.start)));
  if (keys.size > 1 || negated || keys.size === 0 && /형태|변신|(?:어느|어떤|무슨|알\s*수\s*없는)\s*상태|\bform\b|\btransformed\b|形态/i.test(question)) {
    return { spell, selected: false, clarification: clarification(spell, lang) };
  }
  const form = spell.forms.find(item => keys.has(item.key));
  if (!form) return { spell, selected: false };
  if (!form.text.trim()) return { spell, selected: false, clarification: clarification(spell, lang) };
  return { spell: form, selected: true };
}
