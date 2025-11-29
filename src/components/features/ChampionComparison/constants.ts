// 기본 스탯 필드 (중요한 것들만)
export const STAT_FIELDS = [
  { key: "hp", label: "체력", format: (v: number) => Math.round(v) },
  { key: "hpperlevel", label: "레벨당 체력", format: (v: number) => v.toFixed(1) },
  { key: "mp", label: "마나", format: (v: number) => Math.round(v) },
  { key: "mpperlevel", label: "레벨당 마나", format: (v: number) => v.toFixed(1) },
  { key: "movespeed", label: "이동 속도", format: (v: number) => Math.round(v) },
  { key: "armor", label: "방어력", format: (v: number) => Math.round(v) },
  { key: "armorperlevel", label: "레벨당 방어력", format: (v: number) => v.toFixed(1) },
  { key: "spellblock", label: "마법 저항력", format: (v: number) => Math.round(v) },
  { key: "spellblockperlevel", label: "레벨당 마법 저항력", format: (v: number) => v.toFixed(1) },
  { key: "attackdamage", label: "공격력", format: (v: number) => Math.round(v) },
  { key: "attackdamageperlevel", label: "레벨당 공격력", format: (v: number) => v.toFixed(1) },
  { key: "attackspeed", label: "공격 속도", format: (v: number) => v.toFixed(3) },
  { key: "attackspeedperlevel", label: "레벨당 공격 속도", format: (v: number) => `${(v * 100).toFixed(1)}%` },
  { key: "attackrange", label: "사거리", format: (v: number) => Math.round(v) },
  { key: "crit", label: "치명타 확률", format: (v: number) => `${(v * 100).toFixed(1)}%` },
  { key: "critperlevel", label: "레벨당 치명타 확률", format: (v: number) => `${(v * 100).toFixed(1)}%` },
  { key: "hpregen", label: "체력 재생", format: (v: number) => v.toFixed(1) },
  { key: "hpregenperlevel", label: "레벨당 체력 재생", format: (v: number) => v.toFixed(1) },
  { key: "mpregen", label: "마나 재생", format: (v: number) => v.toFixed(1) },
  { key: "mpregenperlevel", label: "레벨당 마나 재생", format: (v: number) => v.toFixed(1) },
] as const;

export const SKILL_LETTERS = ["Q", "W", "E", "R"] as const;

