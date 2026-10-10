/**
 * 채우지 못한 자리가 남긴 물음표 중 **뜻이 없는 것**을 걷어낸다.
 *
 * `fN` 같은 실시간 토큰은 게임 밖에서 채울 수 없어 `?` 로 남는다. 그런데 남은 자리의
 * 성격이 갈린다.
 *
 *   지워도 되는 것   `방어력(?)`        앞의 `10/15/20/25/30%` 가 이미 그 값이다
 *                    `획득한 총 골드: ?`  그 판의 누적 기록이라 밖에서는 뜻이 없다
 *   두어야 하는 것   `추가 공격력 ?/100`  뒤의 100 이 진화 조건이라 정보가 있다
 *                    `?초마다`           주기 자체를 모르면 문장이 무너진다
 *
 * 그래서 **정보를 잃지 않는 두 가지만** 건드린다. 애매하면 두는 쪽을 고른다.
 * 물음표가 조금 남는 것보다 있던 숫자가 사라지는 쪽이 나쁘다.
 */

/** 태그를 걷어 눈에 보이는 글만 남긴다. 판정은 보이는 글로 한다. */
function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/**
 * 괄호 안에 물음표만 있는 자리.
 *
 * 말파이트 W 가 `10/15/20/25/30%의 방어력(?)을 얻습니다` 로 나온다. 괄호 안은 그 비율을
 * 실제 방어력에 곱한 결과라 앞 문장과 같은 말이고, 게임 밖에서는 채울 수도 없다.
 * 괄호째 지우면 `10/15/20/25/30%의 방어력을 얻습니다` 가 되어 뜻이 온전해진다.
 *
 * 괄호 안에 다른 것이 섞여 있으면(`(?% /100%)`) 건드리지 않는다. 그쪽은 100% 가 정보다.
 */
function dropEmptyParenthesis(html: string): string {
  return html.replace(/\s*[(（]\s*\?\s*[)）]/g, "");
}

/**
 * `라벨: ?` 하나로 끝나는 줄.
 *
 * 그 판의 누적 기록을 보여 주는 자리다. 실제로 이렇게 나온다.
 *   아크샨 W  획득한 총 골드: ?
 *   스웨인 P  수집한 영혼 조각: ?
 *   바드 W    현재 활성화된 성소: ? / ?
 * 물음표를 빼면 남는 것이 라벨뿐이라 줄째 지운다.
 *
 * 숫자가 섞인 줄은 남긴다. `현재 미니언 중첩: ?/6` 의 6 이나 `추가 공격력 ?/100` 의
 * 100 은 조건이라 지우면 정보를 잃는다.
 */
function dropStatusLines(html: string): string {
  const parts = html.split(/(<br\s*\/?>)/i);
  const kept: string[] = [];

  for (const part of parts) {
    if (/^<br\s*\/?>$/i.test(part)) {
      kept.push(part);
      continue;
    }
    const text = visibleText(part);
    // 물음표가 없으면 볼 것도 없다.
    if (!text.includes("?")) {
      kept.push(part);
      continue;
    }
    // `라벨: ?` 또는 `라벨: ? / ?` 꼴이고 숫자가 하나도 없어야 지운다.
    const isStatusOnly = /^[^:：]{1,40}[:：]\s*\?(\s*\/\s*\?)*\s*[.。]?$/.test(text) && !/\d/.test(text);
    if (isStatusOnly) continue;
    kept.push(part);
  }

  return collapseBreaks(kept.join(""));
}

/** 줄을 지우면 `<br>` 이 겹치거나 끝에 남는다. 그대로 두면 빈 줄이 생긴다. */
function collapseBreaks(html: string): string {
  return html
    .replace(/(?:\s*<br\s*\/?>\s*){3,}/gi, "<br /><br />")
    .replace(/(?:\s*<br\s*\/?>\s*)+$/i, "")
    .replace(/^(?:\s*<br\s*\/?>\s*)+/i, "");
}

/** 뜻 없는 물음표만 걷어낸다. 숫자가 붙은 자리는 건드리지 않는다. */
export function cleanUnresolvedMarks(html: string): string {
  if (!html.includes("?")) return html;
  return dropStatusLines(dropEmptyParenthesis(html));
}
