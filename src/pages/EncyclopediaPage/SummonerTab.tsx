import { useEffect, useMemo, useState } from "react";
import { getNormalizedSummonerSpells } from "@/data/queries/gameDataQueries";
import type { DataLocale } from "@/data/contracts/staticData";
import type { NormalizedSummonerSpell } from "@/types/combatNormalized";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/i18n";
import { Search } from "lucide-react";
import { summonerSpellIconUrl } from "@/data/assets/riotAssetUrls";
import { SafeInlineHtml } from "@/components/ui/safe-html";

/**
 * 소환사 주문 백과
 *
 * 협곡에서 쓰는 주문이 아홉이다. 그런데 화면은 목록과 상세를 좌우로 가른 꼴이라,
 * 아홉 줄을 보려고 한 번에 하나씩 눌러야 했다. 같이 놓고 견주는 것이 이 앱이 하는
 * 일인데 그 화면만 반대로 되어 있었다.
 *
 * 격자로 펼치고 **재사용 대기시간을 주인공으로** 세운다. 15초짜리 강타와 300초짜리
 * 점멸이 한눈에 갈리고, 막대 길이가 그 차이를 그대로 보인다. 아홉 장이라 한 화면에
 * 다 들어간다.
 *
 * 설명이 깨져 나오던 것도 여기서 고친다. 툴팁에는 `{{ shieldduration }}` 같은
 * 치환자가 남아 있는데 라이엇이 값을 안 채워 준다 — `datavalues` 가 빈 객체이고
 * `effect` 는 전부 0 이며 CommunityDragon 에도 없다. 아홉 중 일곱이 이 꼴이라
 * 화면에 빨간 물음표가 줄줄이 나왔다. 값 없는 자리를 보이느니 깨끗한 한 줄 설명을
 * 쓰고, 치환자가 없는 툴팁만 접어서 덧붙인다.
 */

interface SummonerTabProps {
  /** 정적 데이터 경로/캐시 키로 쓰는 Riot 공식 패치 버전 */
  patchVersion: string;
  sources: import("@/data/contracts/staticData").StaticDataSources;
  /** Data Dragon CDN 요청용 내부 버전 */
  ddragonVersion: string;
  lang: DataLocale;
}

/** 값이 안 채워진 자리가 남아 있는가. 있으면 그 툴팁은 보이지 않는다. */
function hasUnresolvedTokens(tooltip: string): boolean {
  return /\{\{/.test(tooltip);
}

function cooldownOf(spell: NormalizedSummonerSpell): number {
  return spell.cooldown?.[0] ?? 0;
}

export function SummonerTab({ patchVersion, sources, ddragonVersion, lang }: SummonerTabProps) {
  const { t } = useTranslation();
  const [spells, setSpells] = useState<NormalizedSummonerSpell[] | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    getNormalizedSummonerSpells({ patchVersion, sources }, lang).then((data) => {
      if (cancelled) return;
      // 협곡에서 쓰는 것만 둔다. 다른 모드 전용 주문까지 섞으면 견줄 대상이 흐려진다.
      const classic = data.filter((spell) => spell.modes?.includes("CLASSIC"));
      // 대기시간 차례로 세운다. 이 화면에서 가장 먼저 눈에 들어와야 하는 값이다.
      setSpells([...classic].sort((left, right) => cooldownOf(left) - cooldownOf(right)));
    });
    return () => {
      cancelled = true;
    };
  }, [patchVersion, sources, lang]);

  const term = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!spells) return [];
    if (!term) return spells;
    return spells.filter((spell) =>
      `${spell.name} ${spell.summary ?? ""}`.toLowerCase().includes(term),
    );
  }, [spells, term]);

  // 막대 길이의 기준. 가장 긴 것이 꽉 차고 나머지는 그에 견준다.
  const longest = useMemo(() => Math.max(1, ...(spells ?? []).map(cooldownOf)), [spells]);

  if (!spells) {
    return <div className="mt-4 text-sm text-muted-foreground">{t.championSelector.loading}</div>;
  }
  if (spells.length === 0) {
    return <div className="mt-4 text-sm text-muted-foreground">{t.championSelector.emptyList}</div>;
  }

  return (
    <div className="mt-4 space-y-3" data-summoner-tab>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold">{t.encyclopedia.tabs.summoner}</div>
        <div className="group relative w-full sm:w-64">
          <Search aria-hidden="true" className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t.encyclopedia.summoner.searchPlaceholder}
            className="h-8 w-full pl-8 text-xs md:text-sm"
          />
        </div>
      </div>

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
        {filtered.map((spell) => {
          const cooldown = cooldownOf(spell);
          const tooltip = spell.tooltip ?? "";
          const showTooltip = tooltip.length > 0 && !hasUnresolvedTokens(tooltip);
          return (
            <article key={spell.id} data-summoner-spell={spell.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-start gap-3">
                <img
                  src={summonerSpellIconUrl(ddragonVersion, spell.iconPath)}
                  alt=""
                  width={40}
                  height={40}
                  loading="lazy"
                  className="size-10 shrink-0 rounded-md border border-border/60 bg-black/40"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="truncate text-sm font-semibold">{spell.name}</h3>
                    {/* 대기시간이 주인공이다. 숫자를 크게, 단위를 작게. */}
                    <span className="shrink-0 tabular-nums">
                      <span className="text-base font-semibold">{cooldown}</span>
                      <span className="ml-0.5 text-[11px] text-muted-foreground">{t.common.seconds}</span>
                    </span>
                  </div>
                  {/*
                    막대는 길이만으로 말한다. 색을 쓰면 주문마다 뜻이 있는 것처럼 읽히는데
                    여기서 가르는 것은 길고 짧음 하나뿐이다.
                  */}
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <div className="h-full rounded-full bg-foreground/40" style={{ width: `${(cooldown / longest) * 100}%` }} />
                  </div>
                </div>
              </div>

              <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
                {spell.summary || spell.name}
              </p>

              {showTooltip && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                    {t.itemDetail.original}
                  </summary>
                  <SafeInlineHtml className="mt-1.5 block text-xs leading-relaxed [&_br]:block" html={tooltip} />
                </details>
              )}
            </article>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p role="status" className="py-6 text-sm text-muted-foreground">{t.championSelector.noResults}</p>
      )}

      <p className="text-[11px] text-muted-foreground">{t.encyclopedia.runes.warning}</p>
    </div>
  );
}
