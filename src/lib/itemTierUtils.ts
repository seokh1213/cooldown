import type { Item } from "@/types";

export type ItemTier =
  | "starter"
  | "basic"
  | "epic"
  | "legendary";

function isStarterItem(item: Item): boolean {
  const tags = item.tags || [];
  const name = item.name || "";
  const plain = item.plaintext || "";
  const text = `${name} ${plain}`.toLowerCase();
  const textKo = name + plain;

  const basicWardIds = new Set(["3340", "3363", "3364"]);
  const wardstoneIds = new Set(["4638", "4643"]);

  // Wardstone 계열은 시작 아이템이 아님
  if (wardstoneIds.has(item.id)) {
    return false;
  }

  // 기본 와드(장신구 와드)는 시작 아이템으로 취급
  if (basicWardIds.has(item.id)) {
    return true;
  }

  // 포션 / 영약 등 (한글)
  if (/포션|영약/.test(textKo)) {
    return true;
  }

  // Potion / Elixir 등 (영문)
  if (
    text.includes("potion") ||
    text.includes("elixir")
  ) {
    return true;
  }

  // 태그 기반 소비형/장신구
  if (
    tags.includes("Consumable") ||
    tags.includes("Trinket") ||
    tags.includes("Vision") && basicWardIds.has(item.id)
  ) {
    return true;
  }

  // 도란 시리즈 (한글/영문)
  if (/도란/.test(textKo) || text.includes("doran")) {
    return true;
  }

  // 정글 아이템: Jungle 태그나 이름에 jungle 이 포함
  if (tags.includes("Jungle") || text.includes("jungle")) {
    return true;
  }

  // 무료 아이템: 총 가격이 0인 경우
  if ((item.gold?.total ?? 0) === 0) {
    return true;
  }

  return false;
}

// 사용자 정의 규칙:
// 시작: 포션, 와드, 도란 시리즈, 정글 아이템, 영약, 무료 아이템
// 기본 아이템: 맨 말단 (시작은 제외)
// 전설 아이템: 맨 상단
// 서사 아이템: 그외에 남은 모든 아이템
// 템트리는 from/to 기준으로 판단
export function getOfficialLikeItemTier(item: Item): ItemTier {
  const hasFrom = !!item.from && item.from.length > 0;
  const hasInto = !!item.into && item.into.length > 0;

  // 1) 시작 아이템
  if (isStarterItem(item)) {
    return "starter";
  }

  // 2) 기본 아이템: 맨 말단 (조합 재료가 없음)
  if (!hasFrom) {
    return "basic";
  }

  // 3) 전설 아이템: 맨 상단 (더 이상 업그레이드가 없음)
  if (!hasInto) {
    return "legendary";
  }

  // 4) 그 외 나머지는 서사 아이템
  return "epic";
}



