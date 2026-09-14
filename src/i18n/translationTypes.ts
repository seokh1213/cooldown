import type { DataLocale } from "@/data/contracts/staticData";
import type { ComparisonLabels, ItemDetailLabels } from "./comparisonTranslations";
import type { ChampionProfileLabels } from "./championProfileTranslations";

export type Language = DataLocale;

export interface Translations {
  championProfile: ChampionProfileLabels;
  comparison: ComparisonLabels;
  itemDetail: ItemDetailLabels;
  app: {
    updateReady: string;
    updateDescription: string;
    currentBuild: string;
    autoUpdate: string;
    later: string;
    refreshNow: string;
    loadError: string;
    retry: string;
  };
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
      chinese: string;
      selectTitle: string;
    };
  };
  sidebar: {
    championCooldown: string;
    encyclopedia: string;
    simulation: string;
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
      runes: string;
      items: string;
      summoner: string;
      formulas: string;
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
    runes: {
      warning: string;
      statShardsTitle: string;
    };
    items: {
      warning: string;
      filters: {
        all: string;
        treeHeaders: Record<string, string>;
      };
      tiers: {
        legendary: string;
        epic: string;
        basic: string;
        starter: string;
        boots: string;
        consumable: string;
      };
      buildsIntoTitle: string;
      buildsIntoEmpty: string;
      treeTitle: string;
      treeEmpty: string;
      searchPlaceholder: string;
      listTitle: string;
      detailEmpty: string;
      price: {
        unavailable: string;
        free: string;
      };
      stats: {
        abilityPower: string;
        attackDamage: string;
        critChance: string;
        attackSpeed: string;
        health: string;
        mana: string;
        armor: string;
        magicResist: string;
        lifesteal: string;
        spellVamp: string;
      };
    };
    summoner: {
      searchPlaceholder: string;
      listTitle: string;
      detailEmpty: string;
    };
    formulas: {
      intro: string;
      exampleLabel: string;
    };
  };
  pages: {
    simulation: {
      title: string;
      description: string;
      selectChampionAria: string;
      championPlaceholder: string;
      statsTitle: string;
      statsPlaceholderLine1: string;
      statsPlaceholderLine2: string;
      aaDpsLabel: string;
      effectiveHealthPhysical: string;
      effectiveHealthMagic: string;
      itemsTitle: string;
      itemPlaceholderLine1: string;
      itemPlaceholderLine2: string;
      itemModalTitle: string;
      itemModalDescription: string;
      itemModalHint: string;
      clearItemSlot: string;
      skillsTitle: string;
      skillPlaceholderTitle: string;
      skillPlaceholderDescription: string;
      summonerSpellsTitle: string;
      selectSummonerSpell: string;
      summonerSpellHint: string;
      runesTitle: string;
      selectDamageRune: string;
      damageRuneHint: string;
      combatTitle: string;
      combatDescription: string;
      combatEmptyHint: string;
      selectTargetAria: string;
      targetPlaceholder: string;
      targetTitle: string;
      targetHealth: string;
      targetArmor: string;
      targetMagicResist: string;
      targetDamageReduction: string;
      comboTitle: string;
      comboHint: string;
      conditionLabels: Record<string, string>;
      basicAttack: string;
      rankLabel: string;
      castCountLabel: string;
      rawDamageLabel: string;
      mitigatedDamageLabel: string;
      totalDamageLabel: string;
      remainingHealthLabel: string;
      lethalLabel: string;
      survivesLabel: string;
      unknownDamageWarning: string;
      physicalDamage: string;
      magicalDamage: string;
      trueDamage: string;
      unknownDamage: string;
      skillRankHelp: string;
      skillRankLabel: string;
      formulaLabel: string;
      unsupportedFormula: string;
      baseAttackDamage: string;
      bonusMana: string;
      bonusAttackSpeed: string;
      critDamage: string;
      bonusCritDamage: string;
      lethality: string;
      conditionApplied: string;
      conditionExcluded: string;
      trustSummary: string;
      share: string;
      copied: string;
      copySuccess: string;
      copyFailed: string;
      resetSimulation: string;
      levelPresets: string;
      healthPresets: string;
      useInSimulation: string;
      addItemToSimulation: string;
      attackerLevelLabel: string;
      targetLevelLabel: string;
      patchMismatch: string;
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
    closeButton: string;
    favoriteSection: string;
    allChampionsSection: string;
    editFavorites: string;
    finishEditingFavorites: string;
    addFavorite: string;
    removeFavorite: string;
  };
  skillTooltip: {
    passive: string;
    skill: string;
    skillInfo: string;
    skillDescription: string;
    viewDetail: string;
    rankValuesTitle: string;
    scalingsTitle: string;
    conditionsTitle: string;
    diagnosticsTitle: string;
    diagnosticsDescription: string;
    formulaTitle: string;
    formulaDescription: string;
    formulaStacksNote: string;
    stacksLabel: string;
    stacksLabelWithSlot: string;
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
    lethality: string;
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
    critDamage: string;
    critPerLevel: string;
    hpregen: string;
    hpregenPerLevel: string;
    mpregen: string;
    mpregenPerLevel: string;
  };
  versionNotice: {
    title: string;
    description: string;
    cdragonLabel: string;
    ddragonLabel: string;
  };
  common: {
    level: string;
    cooldown: string;
    seconds: string;
    noCost: string;
    mana: string;
    rechargeTime: string;
    max: string;
    items: string;
    bonus: string;
    /**
     * 스탯 1당 계수가 너무 작아 읽히지 않을 때 쓰는 "100당" 표기.
     * {stat} 과 {value} 를 치환한다.
     */
    perHundredStat: string;
  };
  advisor: {
    title: string;
    open: string;
    close: string;
    consent: {
      title: string;
      lead: string;
      sizeNotice: string;
      sourceNotice: string;
      storageNotice: string;
      privacyNotice: string;
      accept: string;
      cancel: string;
      skipModel: string;
    };
    unsupported: {
      title: string;
      noApi: string;
      noAdapter: string;
      error: string;
    };
    status: {
      downloading: string;
      warming: string;
      ready: string;
      generating: string;
      /** 모델이 검색어를 만드는 중 */
      searching: string;
      /** 코드가 자료를 찾아낸 뒤 */
      searched: string;
      /** 모델이 조회 도구를 부른 뒤 */
      looking: string;
    };
    /** 모델 없이 쓰는 중에 코드가 답을 못 찾았을 때 */
    noModel: string;
    /** 이 기기에서는 모델을 권하지 않는다는 안내 */
    modelUnavailable: string;
    /** 코드가 만든 답을 그리는 카드 */
    card: {
      spell: string;
      champion: string;
      rule: string;
      patch: string;
      openInVs: string;
      fullText: string;
      restRules: string;
      verdictYes: string;
      verdictNo: string;
      ruleSource: string;
      understoodAs: string;
      fromScreen: string;
      suggestPrefix: string;
      suggestSuffix: string;
      viewing: string;
      comparing: string;
      askAbout: string;
      commentary: string;
      commentaryPending: string;
      top: string;
      bottom: string;
      stats: string;
      skills: string;
      compare: string;
      atLevel: string;
      /** 아이템 카드 */
      item: string;
      itemPrice: string;
      itemStats: string;
      itemEffects: string;
      itemPassive: string;
      itemActive: string;
      itemEffectCount: string;
      itemNoTag: string;
      openInItems: string;
      /** 상성 카드 부제. {a}로 {b} 상대 */
      matchup: string;
      matchupTool: string;
      /** 대화에서 방금 다룬 챔피언을 붙였을 때 */
      fromChat: string;
      /** 화면에 둘이 있는데 누구 것인지 모를 때 */
      whichOne: string;
      /** 운용 노트 제목. {name}를 잡을 때 / 상대할 때 */
      playingNotes: string;
      againstNotes: string;
      notesSource: string;
      /** 노트 {count}건 더 */
      moreNotes: string;
      /** 자료 패널(L1) */
      reference: string;
      toggleReference: string;
      collapseReference: string;
      resizeReference: string;
      referenceEmpty: string;
      /** 직전 답과 같은 카드 */
      sameReference: string;
      openCard: string;
      /** 바로 가기 */
      goVs: string;
      goRunes: string;
      goSummoner: string;
      goItem: string;
      /** 빈 화면 예시. 특정 사례가 아니라 질문의 종류다. 화면 맥락에 따라 고른다 */
      examples: {
        skillCd: string;
        skillEffect: string;
        skillRatio: string;
        counterBuy: string;
        explain: string;
        vsWho: string;
        vsStat: string;
        vsBuy: string;
        item1: string;
        item2: string;
        rune1: string;
        rune2: string;
        summoner1: string;
        summoner2: string;
        generic1: string;
        generic2: string;
        generic3: string;
        generic4: string;
      };
    };
    /** 저장된 대화 목록. 새 대화·열기·삭제 */
    history: {
      title: string;
      open: string;
      newChat: string;
      empty: string;
      current: string;
      /** 질문 {n}개 */
      questions: string;
      untitled: string;
      remove: string;
      note: string;
    };
    /** 내려받은 모델을 보고 지우는 화면 */
    storage: {
      title: string;
      /** 받지 않은 기기에서 받기 시작 */
      download: string;
      open: string;
      back: string;
      /** 이 기기에 저장된 것이 없을 때 */
      empty: string;
      /** 저장된 용량 앞에 붙는 말 */
      used: string;
      /** 파일 수 앞에 붙는 말 */
      files: string;
      remove: string;
      removing: string;
      /** 지우기 전에 묻는 말 */
      confirm: string;
      cancel: string;
      /** 지운 뒤 */
      removed: string;
      /** 다시 받아야 한다는 안내 */
      note: string;
    };
    /**
     * 모델에게 실어 준 자료 묶음 앞에 붙는 말.
     *
     * "근거" 라고 쓰면 안 된다. 상위 세 건을 다 실어 놓고 어느 것이 답인지는 모델이
     * 고르므로, 실제로 답에 쓰이지 않은 것도 섞여 있다.
     */
    sources: string;
    placeholder: string;
    /** 생성 중에 Enter 를 눌렀을 때. 조용히 먹히면 고장으로 보인다 */
    busyHint: string;
    send: string;
    stop: string;
    reset: string;
    emptyHint: string;
    rateUp: string;
    rateDown: string;
    errorPrefix: string;
  };
}
