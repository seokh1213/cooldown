import React from "react";
import { Card, CardContent } from "@/components/ui/card";

type DemoStat = {
  label: string;
  value: string;
};

type DemoItem = {
  name: string;
  price: string;
  summary: string;
  stats: DemoStat[];
  effectLabel: string;
  effectText: string;
  roleTag: string;
  tierTag: string;
};

const demoItems: DemoItem[] = [
  {
    name: "공허의 지팡이",
    price: "3,000",
    summary: "마법 피해량이 증가합니다.",
    stats: [
      { label: "주문력", value: "95" },
      { label: "마법 관통력", value: "40%" },
    ],
    effectLabel: "공허의 파괴",
    effectText: "적 챔피언의 마법 저항력을 비율로 무시하고 강력한 피해를 입힙니다.",
    roleTag: "마법사 코어",
    tierTag: "전설 아이템",
  },
  {
    name: "불멸의 철갑궁",
    price: "3,000",
    summary: "위험한 순간에 생존력을 크게 높여 줍니다.",
    stats: [
      { label: "공격력", value: "55" },
      { label: "치명타 확률", value: "25%" },
    ],
    effectLabel: "생명선",
    effectText: "체력이 30% 밑으로 떨어질 만큼 피해를 입으면 3초 동안 강력한 보호막을 얻습니다.",
    roleTag: "원딜 코어",
    tierTag: "전설 아이템",
  },
  {
    name: "무한의 대검",
    price: "3,400",
    summary: "치명타 중심 빌드의 핵심 아이템입니다.",
    stats: [
      { label: "공격력", value: "70" },
      { label: "치명타 피해량", value: "+35%" },
    ],
    effectLabel: "치명적인 일격",
    effectText: "치명타 피해량이 크게 증가해 일발 역전을 노릴 수 있습니다.",
    roleTag: "원딜 코어",
    tierTag: "전설 아이템",
  },
];

interface ItemCardVariantProps {
  item: DemoItem;
}

// Variant A: LoL 인게임 툴팁 느낌 (다크 카드 + 헤더 / 본문)
const ItemCardVariantA: React.FC<ItemCardVariantProps> = ({ item }) => {
  return (
    <Card className="bg-neutral-950/95 text-slate-50 border-neutral-700 shadow-lg">
      <CardContent className="p-3 space-y-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold text-slate-200">
              {item.name}
            </span>
            <span className="mt-0.5 text-[10px] text-violet-300">
              {item.tierTag} · {item.roleTag}
            </span>
          </div>
          <span className="text-[11px] font-semibold text-amber-300">
            {item.price}
          </span>
        </div>

        <div className="h-px bg-neutral-700/80" />

        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1">
            {item.stats.map((stat) => (
              <span
                key={stat.label}
                className="inline-flex items-center rounded-sm bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-200 border border-violet-500/40"
              >
                <span className="mr-0.5 text-[9px] text-slate-300">
                  {stat.label}
                </span>
                <span className="font-semibold">{stat.value}</span>
              </span>
            ))}
          </div>

          <p className="text-[11px] leading-snug text-slate-100">
            {item.summary}
          </p>

          <div className="space-y-0.5">
            <div className="text-[10px] font-semibold text-violet-200">
              {item.effectLabel}
            </div>
            <p className="text-[11px] leading-snug text-slate-200">
              {item.effectText}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Variant B: TFT / 카드 스타일 (헤더 배지 + 스탯 그리드)
const ItemCardVariantB: React.FC<ItemCardVariantProps> = ({ item }) => {
  return (
    <Card className="bg-card text-card-foreground border-border shadow-sm">
      <CardContent className="p-3 space-y-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span>{item.tierTag}</span>
            </div>
            <div className="mt-1 text-[11px] font-semibold">{item.name}</div>
          </div>
          <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
            {item.price}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          {item.stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-md bg-muted/60 px-2 py-1 text-[10px] flex items-center justify-between"
            >
              <span className="text-muted-foreground">{stat.label}</span>
              <span className="font-semibold text-primary">{stat.value}</span>
            </div>
          ))}
        </div>

        <div className="space-y-0.5">
          <div className="text-[10px] font-semibold text-muted-foreground">
            {item.effectLabel}
          </div>
          <p className="text-[11px] leading-snug text-foreground">
            {item.effectText}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

// Variant C: ARPG 스타일 (섹션 구분선 + 리스트 느낌)
const ItemCardVariantC: React.FC<ItemCardVariantProps> = ({ item }) => {
  return (
    <Card className="bg-neutral-950 text-slate-50 border-neutral-700/80 shadow-md">
      <CardContent className="p-3 space-y-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-amber-200">
            {item.name}
          </span>
          <span className="text-[11px] font-semibold text-amber-300">
            {item.price}
          </span>
        </div>

        <div className="flex items-center justify-between text-[10px] text-slate-300">
          <span>{item.tierTag}</span>
          <span className="text-slate-400">{item.roleTag}</span>
        </div>

        <div className="h-px bg-neutral-700/80" />

        <ul className="space-y-0.5 text-[11px] leading-snug">
          {item.stats.map((stat) => (
            <li key={stat.label} className="text-emerald-300">
              + {stat.value} {stat.label}
            </li>
          ))}
        </ul>

        <div className="h-px bg-neutral-700/80" />

        <p className="text-[11px] leading-snug text-slate-100">
          <span className="font-semibold text-amber-200">
            [{item.effectLabel}]{" "}
          </span>
          {item.effectText}
        </p>
      </CardContent>
    </Card>
  );
};

export default function ItemTooltipPreviewPage() {
  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-4 md:px-8 md:py-6">
      <h1 className="text-base md:text-lg font-semibold mb-3">
        아이템 설명 UI 프리뷰
      </h1>
      <p className="text-xs text-muted-foreground mb-4">
        아래는 동일한 아이템 데이터를 세 가지 스타일로 렌더링한 비교용
        프리뷰입니다. (A: LoL 툴팁 느낌, B: TFT 카드, C: ARPG 인벤토리)
      </p>

      {demoItems.map((item) => (
        <div
          key={item.name}
          className="mb-4 md:mb-6 space-y-2 rounded-md border border-border/60 bg-card/40 p-3"
        >
          <div className="text-[11px] font-semibold text-muted-foreground mb-1">
            {item.name}
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-muted-foreground">
                Variant A – LoL Tooltip
              </div>
              <ItemCardVariantA item={item} />
            </div>
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-muted-foreground">
                Variant B – TFT / Card
              </div>
              <ItemCardVariantB item={item} />
            </div>
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-muted-foreground">
                Variant C – ARPG
              </div>
              <ItemCardVariantC item={item} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}


