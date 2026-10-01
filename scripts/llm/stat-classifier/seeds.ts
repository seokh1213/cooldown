/** 표현 계열을 먼저 나눈다. 오타 증강은 train 계열 안에서만 만든다. */
export const fields = ["health", "healthRegen", "armor", "magicResist", "attackDamage", "attackSpeed", "moveSpeed"] as const;
export type Field = typeof fields[number];
export type Label = Field | "inherit" | "other";
export interface Family { label: Label; train: string[]; dev: string[]; test: string[] }

export const families: Family[] = [
  { label: "health", train: ["체력 얼마야", "기본 피통", "최대 체력 수치", "hp 알려줘", "health value", "生命值", "기본 생명력", "피 최대치"],
    dev: ["체력이 얼마나 되는지", "최대 HP 확인", "生命值数值"],
    test: ["체럭은 얼마야?", "최대 체려 알려줘", "피통 수치를 보여줘", "base HP please", "生命值有多少？", "기본 생명력 수치는?"] },
  { label: "healthRegen", train: ["체력 재생", "기본 체력 회복량", "체젠 얼마야", "기본 피 재생량", "health regeneration", "hp regen", "生命回复", "스탯에서 자연적으로 피가 차는 양"],
    dev: ["체력 재생 수치를 보여줘", "기본 HP 회복 속도", "自然回血属性"],
    test: ["체려 재생은 얼마나 돼?", "체력 회븍량 수치", "체잰이 얼마야?", "기본 스탯에서 가만히 있을 때 피가 차는 양", "health regneration please", "基础生命恢复是多少？"] },
  { label: "armor", train: ["방어력", "아머 얼마야", "물리 방어 수치", "기본 방어 스탯", "armor value", "armour", "护甲", "방어 능력치"],
    dev: ["방어력 수치가 궁금해", "base armour", "基础护甲值"],
    test: ["방어럭은?", "기본 방오력 알려줘", "아머 수치를 보여줘", "physical armor please", "护甲有多少？", "물리 방어 능력치는?"] },
  { label: "magicResist", train: ["마법 저항력", "마저", "마방 수치", "magic resistance", "MR value", "魔法抗性", "魔抗", "마법 방어 스탯"],
    dev: ["마법 저항 능력치", "기본 MR 확인", "魔抗数值是多少"],
    test: ["마법 저향력은?", "마법 저항럭 알려줘", "마저 수치를 보여줘", "magic resitance please", "魔法抗性有多少？", "기본 마방은 얼마?"] },
  { label: "attackDamage", train: ["공격력", "깡공", "기본 AD", "깡뎀 수치", "attack damage", "AD value", "攻击力", "평타 기본 공격력"],
    dev: ["기본 공격력 확인", "raw attack damage", "基础攻击力数值"],
    test: ["공걱력은?", "공격럭 알려줘", "깡공 수치를 보여줘", "attack damge please", "攻击力有多少？", "AD가 얼마인지 알려줘"] },
  { label: "attackSpeed", train: ["공격 속도", "공속", "기본 공속 수치", "평타 치는 속도 스탯", "attack speed", "AS value", "攻击速度", "攻速"],
    dev: ["공격 속도 능력치", "기본 AS 확인", "攻速数值是多少"],
    test: ["공걱속도는?", "공격속두 알려줘", "공속 수치를 보여줘", "atack speed please", "攻击速度有多少？", "평타 공격 속도 스탯은?"] },
  { label: "moveSpeed", train: ["이동 속도", "이속", "기본 이속 수치", "걷는 속도 스탯", "movement speed", "move speed", "移动速度", "移速"],
    dev: ["이동 속도 능력치", "기본 MS 확인", "移速数值是多少"],
    test: ["이동속두는?", "이돔속도 알려줘", "이속 수치를 보여줘", "movment speed please", "移动速度有多少？", "기본 걷는 속도 수치는?"] },
  { label: "other", train: ["궁 체력 회복량", "패시브 회복 효과", "Q 체력 회복 계수", "마나 재생", "피흡 수치", "회복 물약 효과", "방어력 올리려면 어떤 아이템", "물리 관통력이 뭐야", "R healing amount", "生命偷取", "감전 쿨타임", "고마워", "한타 때 어떻게 싸워", "스킬 가속 공식", "피해량 알려줘", "체력 많은 상대를 어떻게 이겨"],
    dev: ["패시브에서 회복이 생겨?", "마나 회복 수치", "방어구 관통력 차이", "체력 올리는 템 추천", "R heal scaling", "技能恢复效果"],
    test: ["궁으로 체력이 얼마나 회복되냐", "패시브 회복량 수치를 알려줘", "Q 공격 속도 증가량", "마나리젠은 얼마야", "피흡이 얼마나 붙어", "체력 물약 회복량", "방어력 높은 상대에게 무슨 템 사", "방어구 관통이랑 치명력 차이", "아니 그런 뜻이 아니라", "그럼 한타에서는?", "R health regeneration", "技能的回血量", "그거 마법 피해야?", "체력 회복량은 패시브 포함해서", "회복되는 스킬이 있어?", "마저를 올릴 아이템 알려줘"] },
];

export const contextual = {
  train: ["회복량은?", "재생량 알려줘", "회복량도 알려줘", "18레벨은?", "6렙이면?", "문도만", "오공만 보여줘"],
  dev: ["그럼 회복량은", "아니 재생량", "11레벨은?", "문도만 보여줄래"],
  test: ["아니아니 회복량", "회복량은 둘다 어떻게되지?", "그냥 재생량", "18렙에서는 어떻게돼?", "6레벨에서 보면?", "문도만 보여줘", "오공만 알려줘"],
};

export const nameCases: Array<[string, string[]]> = [
  ["재이스 체력", ["Jayce"]], ["갈렌 방어력", ["Garen"]], ["오공랑 재이스 체력 비교", ["MonkeyKing", "Jayce"]],
  ["럭스랑 갈렌 방어력 비교", ["Lux", "Garen"]], ["말파이트랑 럼베 공격력 비교", ["Malphite", "Rumble"]],
  ["wuknog armor", ["MonkeyKing"]], ["yasou health", ["Yasuo"]], ["lux and wuknog attack speed", ["Lux", "MonkeyKing"]],
  ["문도박사 체력 회복량", ["DrMundo"]], ["아리 럭스 마저", ["Ahri", "Lux"]],
  ["오공 문도 박사 아리 제드 럭스 가렌 다리우스 조이 벡스 제이스 체력 재생 비교", ["MonkeyKing", "DrMundo", "Ahri", "Zed", "Lux", "Garen", "Darius", "Zoe", "Vex", "Jayce"]],
  ["아니 회복량", []], ["그럼 한타는?", []], ["누가 더 높아?", []], ["오늘 날씨 어때", []],
  ["나와", []], ["공격 속도", []], ["방어력", []], ["마법 저항력", []], ["회복량", []],
];
