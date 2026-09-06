/**
 * 위키 Lua 데이터 모듈 파서
 *
 * LoL Wiki(Fandom) 의 `Module:ChampionData/data`, `Module:ItemData/data` 는
 * 하나의 큰 Lua 테이블이다. 완전한 Lua 파서 없이 필요한 만큼만 읽는다.
 *
 * 최상위 항목을 고르는 기준은 들여쓰기가 아니라 **중괄호 깊이**다.
 * 두 모듈의 들여쓰기 방식이 달라서(탭/스페이스 혼용) 깊이로 판정해야 안전하다.
 */

export interface LuaBlock {
  name: string;
  body: string;
}

/**
 * `return { ["Name"] = { … }, … }` 에서 깊이 1의 항목만 잘라낸다.
 */
export function splitTopLevelBlocks(wikitext: string): LuaBlock[] {
  const start = wikitext.indexOf("return {");
  if (start < 0) return [];
  const blocks: LuaBlock[] = [];
  let depth = 0;
  let i = start + "return".length;

  while (i < wikitext.length) {
    const ch = wikitext[i];
    if (ch === "{") {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth <= 0) break;
      i += 1;
      continue;
    }
    // 문자열 리터럴은 통째로 건너뛴다 (중괄호가 들어 있을 수 있다)
    if (ch === '"') {
      i += 1;
      while (i < wikitext.length && wikitext[i] !== '"') {
        if (wikitext[i] === "\\") i += 1;
        i += 1;
      }
      i += 1;
      continue;
    }
    if (depth === 1 && ch === "[") {
      const header = /^\["([^"]+)"\]\s*=\s*\{/.exec(wikitext.slice(i, i + 200));
      if (header) {
        const bodyStart = i + header[0].length;
        let innerDepth = 1;
        let j = bodyStart;
        while (j < wikitext.length && innerDepth > 0) {
          const c = wikitext[j];
          if (c === '"') {
            j += 1;
            while (j < wikitext.length && wikitext[j] !== '"') {
              if (wikitext[j] === "\\") j += 1;
              j += 1;
            }
          } else if (c === "{") innerDepth += 1;
          else if (c === "}") innerDepth -= 1;
          j += 1;
        }
        blocks.push({ name: header[1], body: wikitext.slice(bodyStart, j - 1) });
        i = j;
        continue;
      }
    }
    i += 1;
  }
  return blocks;
}

export function luaString(body: string, name: string): string | undefined {
  return body.match(new RegExp(`\\["${name}"\\]\\s*=\\s*"([^"]*)"`))?.[1];
}

export function luaNumber(body: string, name: string): number | undefined {
  const raw = body.match(new RegExp(`\\["${name}"\\]\\s*=\\s*(-?[\\d.]+)`))?.[1];
  return raw === undefined ? undefined : Number(raw);
}

export function luaStringArray(body: string, name: string): string[] {
  const inner = body.match(new RegExp(`\\["${name}"\\]\\s*=\\s*\\{([^}]*)\\}`))?.[1];
  if (!inner) return [];
  return Array.from(inner.matchAll(/"([^"]+)"/g)).map((m) => m[1]);
}

/** `["menu"] = { ["fighter"] = true, … }` 처럼 참인 키만 모은다 */
export function luaTrueKeys(body: string, name: string): string[] {
  const start = body.indexOf(`["${name}"]`);
  if (start < 0) return [];
  const open = body.indexOf("{", start);
  if (open < 0) return [];
  let depth = 1;
  let i = open + 1;
  while (i < body.length && depth > 0) {
    if (body[i] === "{") depth += 1;
    else if (body[i] === "}") depth -= 1;
    i += 1;
  }
  const inner = body.slice(open + 1, i - 1);
  return Array.from(inner.matchAll(/\["([^"]+)"\]\s*=\s*true/g)).map((m) => m[1]);
}

/**
 * 위키 문법을 평문으로 바꾼다.
 * {{ai|Umbral Dash|Aatrox}} → 그림자 돌진 처럼 이름만 남기고, 링크와 강조를 벗긴다.
 */
/** {{#expr:5*4*0.264}} 같은 산술만 계산한다. 그 외 파서 함수는 본문이 아니다. */
function evaluateParserFunction(body: string): string {
  const match = /^#expr:([\d\s.+\-*/()]+)$/.exec(body.trim());
  if (!match) return "";
  try {
    const value = Function(`"use strict";return (${match[1]})`)() as number;
    if (!Number.isFinite(value)) return "";
    return String(Math.round(value * 1000) / 1000);
  } catch {
    return "";
  }
}

/**
 * 수치 템플릿의 첫 인자가 레벨 공식이면 값이 아니다.
 *
 * {{pp|70/5; then +(20/5)*x for 4;then +(25/5)*x|1 to 20 by 1}} 의 첫 인자를 그대로 쓰면
 * "deals 70/5; then +(20/5)*x for 4 true damage" 라는 못 읽을 문장이 된다.
 * 공식은 버리고 레벨에 따라 변한다는 사실만 남긴다.
 */
function numericTemplateValue(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  return /^[\d\s.,/%+-]+$|^\[.*\]$/.test(value) ? value : "level-scaled";
}

export function stripWikiMarkup(text: string, renameAbility?: (english: string) => string): string {
  let out = text;
  // 각주와 HTML 태그는 본문이 아니다
  out = out.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "").replace(/<[^>]+>/g, "");

  // **안쪽 템플릿부터 푼다.** {{as|{{pp|…}} true damage}} 처럼 수치가 안쪽에 들어 있어서,
  // 바깥만 지우면 "Each tick of Ignite deals ." 라는 빈 문장이 남는다.
  const innermost = /\{\{([^{}]*)\}\}/g;
  for (let pass = 0; pass < 6 && out.includes("{{"); pass += 1) {
    const before = out;
    out = out.replace(innermost, (_all, body: string) => {
      if (body.startsWith("#")) return evaluateParserFunction(body);
      const parts = body.split("|");
      const kind = parts[0].trim();
      const args = parts.slice(1);
      const arg = (i: number) => args[i]?.trim() ?? "";
      switch (kind) {
        // {{ai|스킬|챔피언|표시}} 는 스킬 이름을 가리킨다
        case "ai":
          return renameAbility ? renameAbility(arg(0)) : arg(0);
        case "tip":
        case "ci":
        case "ii":
        case "si":
        case "ri":
          return args.length ? args[args.length - 1].trim() : "";
        // {{cai|W|Azir}} 는 챔피언 스킬이다. 슬롯만 남기면 누구 스킬인지 사라진다.
        case "cai":
          return arg(1) ? `${arg(1)} ${arg(0)}` : arg(0);
        // {{bug|2}} 같은 각주 표시는 본문이 아니다
        case "bug":
        case "note":
        case "ref":
          return "";
        case "pp":
        case "fd":
        case "g":
          return numericTemplateValue(arg(0));
        default:
          return arg(0);
      }
    });
    if (out === before) break;
  }
  // 풀리지 않은 템플릿 제거
  out = out.replace(/\{\{[\s\S]*?\}\}/g, "");
  // [[File:critical.png|20px|link=]] 은 그림이라 본문이 아니다. 마지막 인자만 남기면 "20px|link=" 가 된다.
  out = out.replace(/\[\[(?:File|Image|파일):[^\]]*\]\]/gi, "");
  // 템플릿이 아이콘을 가리키는 경우 파일 이름만 남는다.
  // "the cooldown of a Summoner spell icon.png falls into" 가 그런 예다.
  out = out.replace(/\s*[\w'-]*\.(?:png|jpg|jpeg|gif|svg)\b/gi, "");
  // [[링크|표시]] → 표시
  out = out.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2").replace(/\[\[([^\]]*)\]\]/g, "$1");
  // [https://… 표시] 는 각주 링크다. 표시만 남기고 주소는 버린다.
  out = out.replace(/\[https?:\/\/\S+\s+([^\]]*)\]/g, "$1").replace(/\[https?:\/\/\S+\]/g, "");
  // 강조 표기 제거
  out = out.replace(/'''?/g, "");
  // 템플릿이 사라진 자리에 생긴 공백을 정리한다
  out = out.replace(/\s+([.,;:)])/g, "$1").replace(/\(\s+/g, "(");
  return out.replace(/\s+/g, " ").trim();
}
