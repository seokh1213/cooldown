import type { Language } from "@/i18n";

const ko = {
  title: "패치 변경 내역", current: "현재 패치", records: "패치 기록", official: "공식 패치 노트",
  highlights: "이번 패치 한눈에 보기", champions: "챔피언", items: "아이템", systems: "게임 체계", changes: "변경 항목",
  officialSourceNote: "공식 패치 노트 기준 · 협곡 챔피언·아이템·게임 체계의 수치와 동작 변경 · 중국어는 대만 공식 원문",
  buff: "상향", nerf: "하향", adjustment: "조정", all: "전체", search: "챔피언·아이템 검색",
  stats: "기본 능력치", before: "이전", after: "현재", ability: "스킬 / 능력치", metric: "항목", entity: "대상",
  category: "종류", direction: "변경 방향", clearSearch: "검색 지우기",
  sourceNote: "수집한 게임 데이터 기준 · 챔피언 능력치·스킬 수치, 협곡 아이템 · 공식 패치 노트와 다를 수 있습니다.",
  noResults: "일치하는 변경 내역이 없습니다", reset: "필터 초기화", empty: "지원하는 수치에서 확인된 변경이 없습니다.",
  loading: "변경 내역을 불러오는 중", error: "변경 내역을 불러오지 못했습니다", retry: "다시 시도", seconds: "초",
  skillError: "스킬 정보를 불러오지 못했습니다",
};

type Labels = typeof ko;

const en: Labels = {
  title: "Patch changes", current: "Current patch", records: "Patch history", official: "Official patch notes",
  highlights: "This patch at a glance", champions: "Champions", items: "Items", systems: "Systems", changes: "Changes",
  officialSourceNote: "Official patch notes · Rift champion, item and system balance changes · Chinese uses the Taiwan article",
  buff: "Buffs", nerf: "Nerfs", adjustment: "Adjustments", all: "All", search: "Search champions or items",
  stats: "Base stats", before: "Before", after: "After", ability: "Ability / stats", metric: "Metric", entity: "Entity",
  category: "Category", direction: "Change direction", clearSearch: "Clear search",
  sourceNote: "Collected game data · Champion stats, ability numbers and Rift items · May differ from official patch notes.",
  noResults: "No matching changes", reset: "Reset filters", empty: "No changes detected in supported metrics.",
  loading: "Loading changes", error: "Could not load patch changes", retry: "Retry", seconds: "s",
  skillError: "Could not load ability details",
};

const zh: Labels = {
  title: "版本改动", current: "当前版本", records: "版本记录", official: "官方版本公告",
  highlights: "本版本速览", champions: "英雄", items: "装备", systems: "系统", changes: "改动项目",
  officialSourceNote: "官方版本公告 · 峡谷英雄、装备与系统的数值和机制改动 · 中文使用台湾官方原文",
  buff: "增强", nerf: "削弱", adjustment: "调整", all: "全部", search: "搜索英雄或装备",
  stats: "基础属性", before: "之前", after: "当前", ability: "技能 / 属性", metric: "项目", entity: "对象",
  category: "分类", direction: "改动方向", clearSearch: "清除搜索",
  sourceNote: "采集的游戏数据 · 英雄属性、技能数值与峡谷装备 · 可能与官方公告不同。",
  noResults: "没有匹配的改动", reset: "重置筛选", empty: "支持的数值中未检测到改动。",
  loading: "正在加载改动", error: "无法加载版本改动", retry: "重试", seconds: "秒",
  skillError: "无法加载技能信息",
};

export const patchNotesLabels: Record<Language, Labels> = { ko_KR: ko, en_US: en, zh_CN: zh };
