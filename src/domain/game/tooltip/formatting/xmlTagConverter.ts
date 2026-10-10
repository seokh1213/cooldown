/**
 * League of Legends 스킬 툴팁의 XML 태그를 HTML로 변환
 * 테마에 따라 색상이 잘 보이도록 조정
 */
const XML_TAG_MAP: Record<string, { tag: string; className?: string }> = {
  physicalDamage: { tag: "span", className: "text-red-600 dark:text-red-500 font-semibold" },
  magicDamage: { tag: "span", className: "text-blue-600 dark:text-blue-500 font-semibold" },
  trueDamage: { tag: "span", className: "text-yellow-600 dark:text-yellow-500 font-semibold" },
  status: { tag: "span", className: "text-purple-600 dark:text-purple-500" },
  lifeSteal: { tag: "span", className: "text-green-600 dark:text-green-500" },
  scaleAD: { tag: "span", className: "text-orange-600 dark:text-orange-500" },
  scaleAP: { tag: "span", className: "text-blue-600 dark:text-blue-400" },
  scaleArmor: { tag: "span", className: "text-orange-600 dark:text-orange-400" },
  scaleLevel: { tag: "span", className: "text-gray-600 dark:text-gray-400" },
  healing: { tag: "span", className: "text-green-600 dark:text-green-400" },
  speed: { tag: "span", className: "text-cyan-600 dark:text-cyan-500" },
  keywordMajor: { tag: "span", className: "text-yellow-600 dark:text-yellow-400 font-semibold" },
  keywordStealth: { tag: "span", className: "text-purple-600 dark:text-purple-400 font-semibold" },
  spellPassive: { tag: "span", className: "text-gray-600 dark:text-gray-500 italic" },
  spellActive: { tag: "span", className: "text-gray-900 dark:text-white font-semibold" },
  recast: { tag: "span", className: "text-yellow-600 dark:text-yellow-300" },
  damage: { tag: "span", className: "text-red-600 dark:text-red-400" },
  shield: { tag: "span", className: "text-blue-600 dark:text-blue-300" },
  mana: { tag: "span", className: "text-blue-600 dark:text-blue-400" },
  energy: { tag: "span", className: "text-yellow-600 dark:text-yellow-400" },
  health: { tag: "span", className: "text-red-600 dark:text-red-400" },
  cooldown: { tag: "span", className: "text-gray-600 dark:text-gray-300" },
  range: { tag: "span", className: "text-cyan-600 dark:text-cyan-400" },
  radius: { tag: "span", className: "text-purple-600 dark:text-purple-400" },
  width: { tag: "span", className: "text-indigo-600 dark:text-indigo-400" },
  length: { tag: "span", className: "text-pink-600 dark:text-pink-400" },
  rules: { tag: "span", className: "text-gray-600 dark:text-gray-400 italic" },
};

/**
 * XML 태그를 HTML로 변환
 * 변수 치환 전에 호출되어야 함 (XML 태그 내부의 변수도 보존)
 * font 태그는 색상 속성을 유지하여 변환
 */
export function convertXmlTagsToHtml(text: string): string {
  // XML 태그 패턴: <tagName>content</tagName>
  let result = text;

  // font 태그 처리 (color 속성 보존)
  // 예: <font color='#91d7ee'>투명</font> -> <span style="color: #91d7ee">투명</span>
  result = result.replace(
    /<font\s+color=['"]([^'"]+)['"]\s*>/gi,
    '<span style="color: $1">'
  );
  result = result.replace(/<\/font>/gi, "</span>");

  // 모든 XML 태그를 찾아서 변환 (정확한 매칭을 위해 순서대로 처리)
  // 먼저 닫는 태그를 처리하고, 그 다음 여는 태그를 처리해야 중복 변환 방지
  Object.entries(XML_TAG_MAP).forEach(([xmlTag, { tag, className }]) => {
    // 닫는 태그 먼저 처리
    const closeTagRegex = new RegExp(`</${xmlTag}>`, "gi");
    result = result.replace(closeTagRegex, `</${tag}>`);

    // 여는 태그 처리
    const openTagRegex = new RegExp(`<${xmlTag}>`, "gi");
    result = result.replace(openTagRegex, `<${tag}${className ? ` class="${className}"` : ""}>`);
  });

  // 알려지지 않은 XML 태그 처리 (keywordMajor, keywordStealth 등)
  // keywordMajor는 이미 XML_TAG_MAP에 있지만, 혹시 모르니 처리
  const keywordTags = ['keywordMajor', 'keywordStealth', 'rules', 'recast'];
  keywordTags.forEach((keywordTag) => {
    // 닫는 태그 먼저 처리
    result = result.replace(new RegExp(`</${keywordTag}>`, "gi"), `</span>`);
    // 여는 태그 처리 (테마에 따라 색상 조정)
    if (keywordTag === 'rules') {
      result = result.replace(new RegExp(`<${keywordTag}>`, "gi"), `<span class="text-gray-600 dark:text-gray-400 italic">`);
    } else if (keywordTag === 'keywordStealth') {
      result = result.replace(new RegExp(`<${keywordTag}>`, "gi"), `<span class="text-purple-600 dark:text-purple-400 font-semibold">`);
    } else {
      result = result.replace(new RegExp(`<${keywordTag}>`, "gi"), `<span class="text-yellow-600 dark:text-yellow-400 font-semibold">`);
    }
  });

  // 나머지 알려지지 않은 XML 태그는 기본 span으로 변환
  // 단, font 태그와 이미 처리된 태그는 제외
  result = result.replace(/<(\w+)(?![\\w])>/gi, (match, tagName) => {
    // 이미 처리된 태그는 건너뛰기
    if (XML_TAG_MAP[tagName] || keywordTags.includes(tagName) || tagName === 'font' || tagName === 'br') {
      return match;
    }
    return "<span>";
  });
  result = result.replace(/<\/(\w+)(?![\\w])>/gi, (match, tagName) => {
    // 이미 처리된 태그는 건너뛰기
    if (XML_TAG_MAP[tagName] || keywordTags.includes(tagName) || tagName === 'font' || tagName === 'br') {
      return match;
    }
    return "</span>";
  });

  return result;
}

