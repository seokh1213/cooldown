export interface ChampionProfileLabels {
  tab: string;
  /** 직군 거르개의 이름표. */
  roleFilter: string;
  roleFilterAll: string;
  /**
   * 세부 역할군 이름. 열쇠는 위키가 쓰는 영문 그대로다.
   *
   * 라이엇 공식 여섯 갈래다. 클라이언트가 이 이름을 그대로 보여 주므로 옮길 말을
   * 따로 고를 필요가 없다.
   *
   * 표에 없는 갈래가 새로 생기면 화면은 영문 열쇠를 그대로 보인다. 빈칸보다 낫다.
   */
  roleNames: Record<string, string>;
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
  roleNames: {
    fighter: "전사",
    mage: "마법사",
    assassin: "암살자",
    marksman: "원거리 딜러",
    tank: "탱커",
    support: "서포터",
  },
  tab: "챔피언", intro: "챔피언을 선택해 스킨과 배경 이야기를 살펴보세요.",
  skins: "스킨", story: "배경 이야기", officialBio: "Riot Games 공식 소개",
  defaultSkin: "기본 스킨", previous: "이전 스킨", next: "다음 스킨",
  noStory: "아직 배경 소개가 제공되지 않습니다.", noSkins: "아직 스킨 목록이 제공되지 않습니다.",
  imageError: "스킨 이미지를 불러오지 못했습니다. 이미지는 인터넷 연결이 필요합니다.",
};
export const enChampionProfile: ChampionProfileLabels = {
  backToList: "Champion list",
  roleFilter: "Class", roleFilterAll: "All",
  roleNames: {
    fighter: "Fighter",
    mage: "Mage",
    assassin: "Assassin",
    marksman: "Marksman",
    tank: "Tank",
    support: "Support",
  },
  tab: "Champions", intro: "Select a champion to explore skins and their story.",
  skins: "Skins", story: "Background story", officialBio: "Official Riot Games biography",
  defaultSkin: "Default skin", previous: "Previous skin", next: "Next skin",
  noStory: "A biography is not available yet.", noSkins: "A skin list is not available yet.",
  imageError: "Could not load this skin image. Images require an internet connection.",
};
export const zhChampionProfile: ChampionProfileLabels = {
  backToList: "英雄列表",
  roleFilter: "职业", roleFilterAll: "全部",
  roleNames: {
    fighter: "战士",
    mage: "法师",
    assassin: "刺客",
    marksman: "射手",
    tank: "坦克",
    support: "辅助",
  },
  tab: "英雄", intro: "选择英雄，浏览皮肤与背景故事。",
  skins: "皮肤", story: "背景故事", officialBio: "Riot Games 官方简介",
  defaultSkin: "默认皮肤", previous: "上一款皮肤", next: "下一款皮肤",
  noStory: "暂无背景介绍。", noSkins: "暂无皮肤列表。",
  imageError: "无法加载皮肤图片。查看图片需要连接互联网。",
};
