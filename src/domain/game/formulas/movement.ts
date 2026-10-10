import type { FormulaGroup } from "./formulaGroup";

export const MOVEMENT_FORMULAS: FormulaGroup = {
  id: "movement",
  title: {
    ko_KR: "이동과 군중 제어",
    en_US: "Movement and crowd control",
    zh_CN: "移动与控制",
  },
  entries: [
    {
      id: "movement-speed",
      icon: "scalems",
      title: {
        ko_KR: "이동 속도 계산 순서",
        en_US: "Movement speed order",
        zh_CN: "移动速度计算顺序",
      },
      formula: {
        ko_KR: "(기본 + 고정 증가)\n× (1 + 합연산 % 증가의 합)\n× (1 − 가장 강한 둔화)\n× 곱연산 증가들",
        en_US: "(Base + flat bonuses)\n× (1 + sum of additive % bonuses)\n× (1 − strongest slow)\n× multiplicative bonuses",
        zh_CN: "(基础 + 固定加成)\n× (1 + 加算百分比加成之和)\n× (1 − 最强减速)\n× 乘算加成",
      },
      description: {
        ko_KR:
          "둔화는 여러 개가 걸려도 가장 강한 것 하나만 적용된다. 대부분의 이동 속도 증가는 합연산이고, 일부만 따로 곱해진다.",
        en_US:
          "Only the strongest slow applies, no matter how many are active. Most speed boosts add together; only a few multiply separately.",
        zh_CN:
          "无论叠加多少减速，只有最强的一个生效。多数移速加成为相加，只有少数单独相乘。",
      },
    },
    {
      id: "movement-soft-cap",
      icon: "scalems",
      title: {
        ko_KR: "이동 속도 소프트 캡",
        en_US: "Movement speed soft caps",
        zh_CN: "移动速度软上限",
      },
      formula: {
        ko_KR: "415 초과 490 이하 : 실제 = 계산값 × 0.8 + 83\n490 초과       : 실제 = 계산값 × 0.5 + 230\n220 미만       : 실제 = 계산값 × 0.5 + 110",
        en_US: "Above 415 up to 490 : Actual = Computed × 0.8 + 83\nAbove 490           : Actual = Computed × 0.5 + 230\nBelow 220           : Actual = Computed × 0.5 + 110",
        zh_CN: "大于 415 且不超过 490：实际 = 计算值 × 0.8 + 83\n大于 490：实际 = 计算值 × 0.5 + 230\n小于 220：实际 = 计算值 × 0.5 + 110",
      },
      description: {
        ko_KR:
          "415를 넘는 구간부터 효율이 깎이고, 반대로 220 밑으로는 잘 안 떨어진다. 그래서 이동 속도는 어느 선을 넘으면 더 쌓아도 이득이 급격히 줄어든다.",
        en_US:
          "Efficiency drops past 415 and is propped up below 220, so stacking movement speed loses value sharply beyond a certain point.",
        zh_CN:
          "超过 415 后效率下降，低于 220 时则被抬高。因此移速堆到一定程度后收益会急剧减少。",
      },
      example: {
        ko_KR: "계산값 600 → 실제 530 (11.7% 손실)",
        en_US: "Raw 600 → actual 530 (11.7% lost)",
        zh_CN: "计算值 600 → 实际 530（损失 11.7%）",
      },
    },
    {
      id: "tenacity",
      icon: "scaletenacity",
      title: {
        ko_KR: "강인함",
        en_US: "Tenacity",
        zh_CN: "坚韧",
      },
      formula: {
        ko_KR: "군중 제어 지속시간 = 원래 지속시간 × (1 − 강인함)",
        en_US: "CC duration = Base duration × (1 − Tenacity)",
        zh_CN: "控制时长 = 原始时长 × (1 − 坚韧)",
      },
      description: {
        ko_KR:
          "지속시간은 효과가 걸리는 순간에 확정되므로, 걸린 뒤에 강인함을 올려도 이미 걸린 효과는 짧아지지 않는다. 0.3초 밑으로는 줄지 않는다. 공중에 띄우기·졸음·시야 축소·정지·억제에는 듣지 않고, 둔화에도 듣지 않는다. 출처 조합에 따라 더해지기도 하고 곱해지기도 한다.",
        en_US:
          "Duration is locked in when the crowd control lands, so raising tenacity afterwards does not shorten an effect already applied. It cannot cut duration below 0.3 seconds. Airborne, drowsy, nearsight, stasis and suppression are exempt, as are slows. Sources stack additively or multiplicatively depending on the combination.",
        zh_CN:
          "持续时间在控制生效的瞬间确定，之后再提高坚韧也不会缩短已生效的效果，且最短只能减到 0.3 秒。击飞、瞌睡、视野缩小、停滞与压制不受其影响，减速同样不受影响。不同来源可能相加也可能相乘。",
      },
    },
    {
      id: "slow-resist",
      title: {
        ko_KR: "둔화 저항",
        en_US: "Slow resist",
        zh_CN: "减速抗性",
      },
      formula: {
        ko_KR: "적용 둔화 = 둔화 × (1 − 둔화 저항)",
        en_US: "Applied slow = Slow × (1 − Slow resist)",
        zh_CN: "生效减速 = 减速 × (1 − 减速抗性)",
      },
      description: {
        ko_KR:
          "강인함과는 별개의 스탯이다. 지속시간이 아니라 둔화의 세기 자체를 깎는다. 강인함은 둔화에 듣지 않고, 둔화 저항은 이동 불가 계열에 듣지 않는다.",
        en_US:
          "A separate stat from tenacity: it weakens the slow itself rather than shortening it. Tenacity does not affect slows, and slow resist does not affect disables.",
        zh_CN:
          "与坚韧是彼此独立的属性：它削弱减速的强度而非缩短时间。坚韧对减速无效，减速抗性对控制类效果无效。",
      },
    },
  ],
};
