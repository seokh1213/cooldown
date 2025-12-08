import type { NormalizedItem } from "@/types/combatNormalized";

export type ItemTier =
  | "consumable"
  | "boots"
  | "starter"
  | "basic"
  | "epic"
  | "legendary";

function isStarterItem(item: NormalizedItem): boolean {
  const tags = item.tags || [];
  const name = item.name || "";
  const text = name.toLowerCase();
  const textKo = name;

  const wardstoneIds = new Set(["4638", "4643"]);

  // Wardstone 계열은 시작 아이템이 아님
  if (wardstoneIds.has(item.id)) {
    return false;
  }

  // 도란 시리즈 (한글/영문)
  if (/도란/.test(textKo) || text.includes("doran")) {
    return true;
  }

  // 정글 아이템: Jungle 태그나 이름에 jungle 이 포함
  if (tags.includes("Jungle") || text.includes("jungle")) {
    return true;
  }

  // 수확의 낫, 여신의 눈물, 암흑의 인장
  const starterKeywords = ["수확의 낫", "여신의 눈물", "암흑의 인장", "cull", "tear of the goddess", "dark seal"];
  if (starterKeywords.some(k => textKo.includes(k) || text.includes(k))) {
    return true;
  }

  // 무료 아이템: 총 가격이 0인 경우 (와드/장신구는 이미 Consumable로 처리됨)
  if ((item.priceTotal ?? 0) === 0) {
    return true;
  }

  return false;
}

// 사용자 정의 규칙:
// 소모품: Consumable, Trinket 태그
// 장화: Boots 태그
// 시작: 도란, 정글, 서폿, 무료 등
// 기본 아이템: 맨 말단 (시작은 제외)
// 전설 아이템: 맨 상단
// 서사 아이템: 그외에 남은 모든 아이템
// 템트리는 from/to 기준으로 판단
export function getOfficialLikeItemTier(item: NormalizedItem): ItemTier {
  const tags = item.tags || [];
  const hasFrom = !!item.buildsFrom && item.buildsFrom.length > 0;
  const hasInto = !!item.buildsInto && item.buildsInto.length > 0;

  // 1) 소모품 (Consumable, Trinket)
  if (tags.includes("Consumable") || tags.includes("Trinket")) {
    return "consumable";
  }

  // 2) 장화 (Boots)
  if (tags.includes("Boots")) {
    return "boots";
  }

  // 3) 시작 아이템
  if (isStarterItem(item)) {
    return "starter";
  }

  // 4) 기본 아이템: 맨 말단 (조합 재료가 없음)
  if (!hasFrom) {
    return "basic";
  }

  // 5) 전설 아이템: 맨 상단 (더 이상 업그레이드가 없음)
  if (!hasInto) {
    return "legendary";
  }

  // 6) 그 외 나머지는 서사 아이템
  return "epic";
}



