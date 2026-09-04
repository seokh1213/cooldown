import type { DataLocale } from "@/data/contracts/staticData";

export type Language = DataLocale;

export interface Translations {
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
    killAngle: string;
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
    simulation: {
      title: string;
      description: string;
      selectChampionAria: string;
      championPlaceholder: string;
      statsTitle: string;
      statsPlaceholderLine1: string;
      statsPlaceholderLine2: string;
      aaDpsLabel: string;
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
      selectTargetAria: string;
      targetPlaceholder: string;
      targetTitle: string;
      targetHealth: string;
      targetArmor: string;
      targetMagicResist: string;
      targetDamageReduction: string;
      comboTitle: string;
      comboHint: string;
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
  };
  skillTooltip: {
    passive: string;
    skill: string;
    skillInfo: string;
    skillDescription: string;
    warningPassive: string;
    warningSkill: string;
    viewDetail: string;
    rankValuesTitle: string;
    scalingsTitle: string;
    conditionsTitle: string;
    diagnosticsTitle: string;
    diagnosticsDescription: string;
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
}
