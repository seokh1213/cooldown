export type Language = "ko_KR" | "en_US";

export interface Translations {
  nav: {
    encyclopedia: string;
    theme: {
      switchToLight: string;
      switchToDark: string;
    };
    tutorial: {
      title: string;
      description: string;
    };
    language: {
      korean: string;
      english: string;
    };
  };
  sidebar: {
    encyclopedia: string;
    laningTips: string;
    killAngle: string;
  };
  tutorial: {
    title: string;
    description: string;
    skillIcon: {
      title: string;
      description: string;
      skillInfo: string;
      skillDetails: string;
    };
      vsMode: {
        title: string;
        description: string;
        vsModeLabel: string;
        comparisonDescription: string;
        vsButtonHint: string;
        changeOpponentHint: string;
        exampleChampion: string;
        exampleChampionB: string;
        clickChampionToChange: string;
      };
  };
  encyclopedia: {
    tabs: {
      skills: string;
      stats: string;
    };
    reset: string;
    champion: string;
    vs: string;
    vsStart: string;
    selectOpponent: string;
    add: string;
    emptyState: {
      title: string;
      description: string;
      addButton: string;
    };
  };
  pages: {
    killAngle: {
      title: string;
      description: string;
    };
    laningTips: {
      title: string;
      description: string;
    };
  };
  championSelector: {
    selectChampion: string;
    searchPlaceholder: string;
    vsSelectOpponent: string;
    vsSelectOpponentDescription: string;
    selectChampionDescription: string;
    currentChampion: string;
    vsSearchPlaceholder: string;
    selectOpponentLabel: string;
    noResults: string;
    emptyList: string;
    loading: string;
  };
  skillTooltip: {
    passive: string;
    skill: string;
    skillInfo: string;
    skillDescription: string;
    warningPassive: string;
    warningSkill: string;
  };
  skills: {
    label: string;
  };
    stats: {
      label: string;
      abilityPower: string;
      attackDamage: string;
      bonusAttackDamage: string;
      health: string;
      bonusHealth: string;
      healthPerLevel: string;
      armor: string;
      bonusArmor: string;
      magicResist: string;
      bonusMagicResist: string;
      lifesteal: string;
      bonusLifesteal: string;
      mana: string;
      manaPerLevel: string;
      movespeed: string;
      armorPerLevel: string;
      spellblock: string;
      spellblockPerLevel: string;
      attackdamage: string;
      attackdamagePerLevel: string;
      attackspeed: string;
      attackspeedPerLevel: string;
      attackrange: string;
      crit: string;
      critPerLevel: string;
      hpregen: string;
      hpregenPerLevel: string;
      mpregen: string;
      mpregenPerLevel: string;
    };
  common: {
    level: string;
    seconds: string;
    noCost: string;
    mana: string;
    rechargeTime: string;
    max: string;
    items: string;
    bonus: string;
  };
}

export const translations: Record<Language, Translations> = {
  ko_KR: {
    nav: {
      encyclopedia: "백과사전",
      theme: {
        switchToLight: "라이트 모드로 전환",
        switchToDark: "다크 모드로 전환",
      },
      tutorial: {
        title: "사용 방법 안내",
        description: "모바일에서 스킬 정보를 확인하는 방법을 알려드립니다",
      },
      language: {
        korean: "한국어",
        english: "Eng",
      },
    },
    sidebar: {
      encyclopedia: "백과사전",
      laningTips: "라인전 팁",
      killAngle: "킬각 계산기",
    },
    tutorial: {
      title: "사용 방법 안내",
      description: "모바일에서 스킬 정보를 확인하는 방법을 알려드립니다",
      skillIcon: {
        title: "스킬 아이콘을 탭하세요",
        description: "챔피언 비교 화면에서 스킬 아이콘을 탭하면 상세한 스킬 정보가 담긴 툴팁이 표시됩니다.",
        skillInfo: "스킬 정보",
        skillDetails: "쿨타임, 마나 소모량 등",
      },
      vsMode: {
        title: "VS 모드로 챔피언 비교하기",
        description: "챔피언 탭의 VS 버튼을 탭하면 다른 챔피언과 직접 비교할 수 있습니다. 두 챔피언의 스킬 쿨타임과 기본 스탯을 나란히 비교해보세요.",
        vsModeLabel: "VS 비교 모드",
        comparisonDescription: "두 챔피언 나란히 비교",
        vsButtonHint: "VS 버튼을 탭하면 상대 챔피언을 선택할 수 있습니다",
        changeOpponentHint: "VS 모드 탭에서 챔피언 사진을 클릭하면 상대 챔피언을 변경할 수 있습니다",
        exampleChampion: "갈리오",
        exampleChampionB: "야스오",
        clickChampionToChange: "챔피언 사진을 클릭하여 변경",
      },
    },
    encyclopedia: {
      tabs: {
        skills: "스킬 쿨타임",
        stats: "기본 스탯",
      },
      reset: "초기화",
      champion: "챔피언",
      vs: "VS",
      vsStart: "VS 비교 시작",
      selectOpponent: "비교할 상대 선택",
      add: "추가",
      emptyState: {
        title: "챔피언을 선택하세요",
        description: "아래 버튼을 클릭하여 챔피언을 추가하고 비교해보세요.",
        addButton: "챔피언 추가하기",
      },
    },
    pages: {
      killAngle: {
        title: "킬각 계산기",
        description: "챔피언의 스킬 데미지를 계산하여 킬각을 확인할 수 있습니다. (준비 중)",
      },
      laningTips: {
        title: "라인전 팁",
        description: "챔피언별 라인전 팁과 상대법을 확인할 수 있습니다. (준비 중)",
      },
    },
    championSelector: {
      selectChampion: "챔피언 선택",
      searchPlaceholder: "챔피언 검색...",
      vsSelectOpponent: "VS 상대 선택",
      vsSelectOpponentDescription: "비교할 상대를 선택하세요",
      selectChampionDescription: "비교할 챔피언을 선택하세요",
      currentChampion: "현재 선택된 챔피언",
      vsSearchPlaceholder: "비교할 상대 검색...",
      selectOpponentLabel: "비교할 상대 선택",
      noResults: "검색 결과가 없습니다",
      emptyList: "챔피언 목록이 비어있습니다",
      loading: "로딩 중...",
    },
    skillTooltip: {
      passive: "패시브",
      skill: "스킬",
      skillInfo: "스킬 정보",
      skillDescription: "스킬의 상세 정보입니다.",
      warningPassive: "패시브 스킬의 정보는 게임 내 데이터와 다를 수 있습니다. 인게임을 참조해주세요",
      warningSkill: "스킬 정보는 게임 내 데이터와 다를 수 있습니다. 인게임을 참조해주세요",
    },
    skills: {
      label: "스킬",
    },
    stats: {
      label: "스탯",
      abilityPower: "주문력",
      attackDamage: "공격력",
      bonusAttackDamage: "추가 공격력",
      health: "체력",
      bonusHealth: "추가 체력",
      healthPerLevel: "레벨당 체력",
      armor: "방어력",
      bonusArmor: "추가 방어력",
      magicResist: "마법 저항력",
      bonusMagicResist: "추가 마법 저항력",
      lifesteal: "생명력 흡수",
      bonusLifesteal: "추가 생명력 흡수",
      mana: "마나",
      manaPerLevel: "레벨당 마나",
      movespeed: "이동 속도",
      armorPerLevel: "레벨당 방어력",
      spellblock: "마법 저항력",
      spellblockPerLevel: "레벨당 마법 저항력",
      attackdamage: "공격력",
      attackdamagePerLevel: "레벨당 공격력",
      attackspeed: "공격 속도",
      attackspeedPerLevel: "레벨당 공격 속도",
      attackrange: "사거리",
      crit: "치명타 확률",
      critPerLevel: "레벨당 치명타 확률",
      hpregen: "체력 재생",
      hpregenPerLevel: "레벨당 체력 재생",
      mpregen: "마나 재생",
      mpregenPerLevel: "레벨당 마나 재생",
    },
    common: {
      level: "레벨",
      seconds: "초",
      noCost: "소모값 없음",
      mana: "마나",
      rechargeTime: "재충전 대기시간",
      max: "최대",
      items: "개",
      bonus: "추가",
    },
  },
  en_US: {
    nav: {
      encyclopedia: "Encyclopedia",
      theme: {
        switchToLight: "Switch to light mode",
        switchToDark: "Switch to dark mode",
      },
      tutorial: {
        title: "How to Use",
        description: "Learn how to check skill information on mobile",
      },
      language: {
        korean: "한국어",
        english: "Eng",
      },
    },
    sidebar: {
      encyclopedia: "Encyclopedia",
      laningTips: "Laning Tips",
      killAngle: "Kill Angle Calculator",
    },
    tutorial: {
      title: "How to Use",
      description: "Learn how to check skill information on mobile",
      skillIcon: {
        title: "Tap Skill Icons",
        description: "Tap skill icons in the champion comparison screen to view detailed skill information in tooltips.",
        skillInfo: "Skill Information",
        skillDetails: "Cooldown, mana cost, etc.",
      },
      vsMode: {
        title: "Compare Champions in VS Mode",
        description: "Tap the VS button on champion tabs to directly compare with other champions. Compare skill cooldowns and base stats side by side.",
        vsModeLabel: "VS Comparison Mode",
        comparisonDescription: "Compare two champions side by side",
        vsButtonHint: "Tap the VS button to select an opponent champion",
        changeOpponentHint: "In VS mode tabs, you can click on champion portraits to change the opponent",
        exampleChampion: "Galio",
        exampleChampionB: "Yasuo",
        clickChampionToChange: "Click champion portrait to change",
      },
    },
    encyclopedia: {
      tabs: {
        skills: "Skill Cooldowns",
        stats: "Base Stats",
      },
      reset: "Reset",
      champion: "Champion",
      vs: "VS",
      vsStart: "Start VS Comparison",
      selectOpponent: "Select Opponent",
      add: "Add",
      emptyState: {
        title: "Select a Champion",
        description: "Click the button below to add champions and compare them.",
        addButton: "Add Champion",
      },
    },
    pages: {
      killAngle: {
        title: "Kill Angle Calculator",
        description: "Calculate champion skill damage to check kill angles. (Coming soon)",
      },
      laningTips: {
        title: "Laning Tips",
        description: "Check champion-specific laning tips and matchups. (Coming soon)",
      },
    },
    championSelector: {
      selectChampion: "Select Champion",
      searchPlaceholder: "Search champions...",
      vsSelectOpponent: "Select VS Opponent",
      vsSelectOpponentDescription: "Select an opponent to compare",
      selectChampionDescription: "Select a champion to compare",
      currentChampion: "Currently Selected Champion",
      vsSearchPlaceholder: "Search opponent...",
      selectOpponentLabel: "Select Opponent",
      noResults: "No search results",
      emptyList: "Champion list is empty",
      loading: "Loading...",
    },
    skillTooltip: {
      passive: "Passive",
      skill: "Skill",
      skillInfo: "Skill Information",
      skillDescription: "Detailed information about the skill.",
      warningPassive: "Passive skill information may differ from in-game data. Please refer to in-game data",
      warningSkill: "Skill information may differ from in-game data. Please refer to in-game data",
    },
    skills: {
      label: "Skills",
    },
    stats: {
      label: "Stats",
      abilityPower: "Ability Power",
      attackDamage: "Attack Damage",
      bonusAttackDamage: "bonus Attack Damage",
      health: "Health",
      bonusHealth: "bonus Health",
      healthPerLevel: "Health per Level",
      armor: "Armor",
      bonusArmor: "bonus Armor",
      magicResist: "Magic Resist",
      bonusMagicResist: "bonus Magic Resist",
      lifesteal: "Lifesteal",
      bonusLifesteal: "bonus Lifesteal",
      mana: "Mana",
      manaPerLevel: "Mana per Level",
      movespeed: "Movement Speed",
      armorPerLevel: "Armor per Level",
      spellblock: "Magic Resist",
      spellblockPerLevel: "Magic Resist per Level",
      attackdamage: "Attack Damage",
      attackdamagePerLevel: "Attack Damage per Level",
      attackspeed: "Attack Speed",
      attackspeedPerLevel: "Attack Speed per Level",
      attackrange: "Attack Range",
      crit: "Critical Strike Chance",
      critPerLevel: "Critical Strike Chance per Level",
      hpregen: "Health Regen",
      hpregenPerLevel: "Health Regen per Level",
      mpregen: "Mana Regen",
      mpregenPerLevel: "Mana Regen per Level",
    },
    common: {
      level: "Level",
      seconds: "s",
      noCost: "No Cost",
      mana: "Mana",
      rechargeTime: "Recharge Time",
      max: "Max",
      items: "",
      bonus: "bonus",
    },
  },
};

