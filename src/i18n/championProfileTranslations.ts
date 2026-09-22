export interface ChampionProfileLabels {
  tab: string;
  /** 직군 거르개의 이름표. */
  roleFilter: string;
  roleFilterAll: string;
  /**
   * 세부 역할군 이름. 열쇠는 위키가 쓰는 영문 그대로다.
   *
   * 라이엇이 내려 주는 자료에는 이 이름이 영문으로만 있다. 클라이언트도 큰 분류
   * 여섯만 보여 주고 세부 역할군은 안 쓴다. 그래서 각 언어권 커뮤니티가 굳혀 놓은
   * 말을 따른다 — 한국어는 "X형 Y" 꼴, 중국어는 두 글자 낱말이다.
   *
   * `브루저` 같은 속어는 쓰지 않는다. 전사 계열 둘(Juggernaut·Diver)을 뭉뚱그린
   * 말이라 어느 갈래에도 1:1 로 맞지 않는다.
   *
   * 표에 없는 갈래가 새로 생기면 화면은 영문을 그대로 보인다. 빈칸보다 낫다.
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
    Juggernaut: "돌격형 전사",
    Diver: "기동형 전사",
    Assassin: "기동형 암살자",
    Skirmisher: "전투형 암살자",
    Vanguard: "공격형 탱커",
    Warden: "수비형 탱커",
    Burst: "집중형 마법사",
    Battlemage: "광역형 마법사",
    Artillery: "견제형 마법사",
    Enchanter: "강화형 보조술사",
    Catcher: "포획형 보조술사",
    Marksman: "원거리 딜러",
    // 위키 문서는 "분류 불가" 라고 부르지만 거르개 이름표로는 자료가 빈 것처럼 읽힌다.
    // 티모·헤임딩거·갱플랭크처럼 제 방식이 뚜렷해서 어느 갈래에도 안 들어가는 쪽이다.
    Specialist: "특수형",
    Mage: "마법사",
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
  // 위키가 쓰는 말이 곧 영어다. 옮길 것이 없다.
  roleNames: {},
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
    Juggernaut: "巨像",
    Diver: "战神",
    Assassin: "刺客",
    Skirmisher: "决斗",
    Vanguard: "先锋",
    Warden: "守护",
    Burst: "爆发",
    Battlemage: "战斗法师",
    Artillery: "炮台",
    Enchanter: "增益",
    Catcher: "抓取",
    Marksman: "射手",
    Specialist: "专家",
    Mage: "法师",
  },
  tab: "英雄", intro: "选择英雄，浏览皮肤与背景故事。",
  skins: "皮肤", story: "背景故事", officialBio: "Riot Games 官方简介",
  defaultSkin: "默认皮肤", previous: "上一款皮肤", next: "下一款皮肤",
  noStory: "暂无背景介绍。", noSkins: "暂无皮肤列表。",
  imageError: "无法加载皮肤图片。查看图片需要连接互联网。",
};
