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
  };
  skills: {
    label: string;
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
    },
    skills: {
      label: "스킬",
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
    },
    skills: {
      label: "Skills",
    },
  },
};

