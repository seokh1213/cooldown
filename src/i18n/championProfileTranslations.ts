export interface ChampionProfileLabels {
  tab: string;
  /** 직군 거르개의 이름표. 갈래 이름 자체는 위키 원문(Juggernaut…)을 그대로 쓴다. */
  roleFilter: string;
  roleFilterAll: string;
  backToList: string;
  intro: string;
  skins: string;
  story: string;
  officialBio: string;
  defaultSkin: string;
  previous: string;
  next: string;
  noStory: string;
  noSkins: string;
  imageError: string;
}

export const koChampionProfile: ChampionProfileLabels = {
  backToList: "챔피언 목록",
  roleFilter: "직군", roleFilterAll: "전체",
  tab: "챔피언", intro: "챔피언을 선택해 스킨과 배경 이야기를 살펴보세요.",
  skins: "스킨", story: "배경 이야기", officialBio: "Riot Games 공식 소개",
  defaultSkin: "기본 스킨", previous: "이전 스킨", next: "다음 스킨",
  noStory: "아직 배경 소개가 제공되지 않습니다.", noSkins: "아직 스킨 목록이 제공되지 않습니다.",
  imageError: "스킨 이미지를 불러오지 못했습니다. 이미지는 인터넷 연결이 필요합니다.",
};
export const enChampionProfile: ChampionProfileLabels = {
  backToList: "Champion list",
  roleFilter: "Class", roleFilterAll: "All",
  tab: "Champions", intro: "Select a champion to explore skins and their story.",
  skins: "Skins", story: "Background story", officialBio: "Official Riot Games biography",
  defaultSkin: "Default skin", previous: "Previous skin", next: "Next skin",
  noStory: "A biography is not available yet.", noSkins: "A skin list is not available yet.",
  imageError: "Could not load this skin image. Images require an internet connection.",
};
export const zhChampionProfile: ChampionProfileLabels = {
  backToList: "英雄列表",
  roleFilter: "职业", roleFilterAll: "全部",
  tab: "英雄", intro: "选择英雄，浏览皮肤与背景故事。",
  skins: "皮肤", story: "背景故事", officialBio: "Riot Games 官方简介",
  defaultSkin: "默认皮肤", previous: "上一款皮肤", next: "下一款皮肤",
  noStory: "暂无背景介绍。", noSkins: "暂无皮肤列表。",
  imageError: "无法加载皮肤图片。查看图片需要连接互联网。",
};
