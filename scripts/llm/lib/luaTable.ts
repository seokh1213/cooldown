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
export function stripWikiMarkup(text: string, renameAbility?: (english: string) => string): string {
  let out = text;
  // {{ai|스킬|챔피언|표시}} / {{ci|챔피언}} / {{ii|아이템}} 등 템플릿
  out = out.replace(/\{\{([a-zA-Z]+)\|([^{}]*)\}\}/g, (_all, kind: string, args: string) => {
    const parts = args.split("|");
    if (kind === "ai") {
      const ability = parts[0]?.trim() ?? "";
      return renameAbility ? renameAbility(ability) : ability;
    }
    if (kind === "tip" || kind === "ci" || kind === "ii" || kind === "si" || kind === "ri") {
      return parts[parts.length - 1]?.trim() ?? "";
    }
    // {{cai|W|Azir}} 는 챔피언 스킬을 가리킨다. 슬롯만 남기면 누구 스킬인지 사라진다.
    if (kind === "cai") {
      const slot = parts[0]?.trim() ?? "";
      const champion = parts[1]?.trim() ?? "";
      return champion ? `${champion} ${slot}` : slot;
    }
    // {{bug|2}} 같은 각주 표시는 본문이 아니다
    if (kind === "bug" || kind === "note" || kind === "ref") return "";
    if (kind === "pp" || kind === "fd" || kind === "g") return parts[0]?.trim() ?? "";
    return parts[0]?.trim() ?? "";
  });
  // 남은 템플릿 제거
  out = out.replace(/\{\{[^{}]*\}\}/g, "");
  // [[링크|표시]] → 표시
  out = out.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2").replace(/\[\[([^\]]*)\]\]/g, "$1");
  // 강조 표기 제거
  out = out.replace(/'''?/g, "");
  return out.replace(/\s+/g, " ").trim();
}
