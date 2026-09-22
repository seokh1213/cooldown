import { useEffect, useMemo, useState } from "react";
import { getNormalizedSummonerSpells } from "@/data/queries/gameDataQueries";
import type { DataLocale } from "@/data/contracts/staticData";
import type { NormalizedSummonerSpell } from "@/types/combatNormalized";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/i18n";
import { Search } from "lucide-react";
import { summonerSpellIconUrl } from "@/data/assets/riotAssetUrls";
import { SafeBlockHtml } from "@/components/ui/safe-html";

/**
 * 소환사 주문 백과
 *
 * 협곡에서 쓰는 주문이 아홉이다. 그런데 화면은 목록과 상세를 좌우로 가른 꼴이라,
 * 아홉 줄을 보려고 한 번에 하나씩 눌러야 했다. 같이 놓고 견주는 것이 이 앱이 하는
 * 일인데 그 화면만 반대로 되어 있었다.
 *
 * 격자로 펼치고 대기시간을 크게 적는다. 아홉 장이라 한 화면에 다 들어간다.
 *
 * 한때 대기시간 옆에 막대를 그렸다. 길이로 견주라는 뜻이었는데 그래프로 읽혀
 * "이게 뭔가" 싶게 만들었다. 숫자가 이미 그 일을 하므로 걷어냈다.
 *
 * 설명은 **수치가 든 쪽을 먼저** 쓴다. 툴팁에 `{{ shieldduration }}` 같은 치환자가
 * 남아 있으면 라이엇이 값을 안 채운 것이라(아홉 중 일곱이 이 꼴이다) 그때만 한 줄
 * 설명으로 내린다. 치환자가 없는 툴팁은 "5초에 걸쳐 90 - 430의 고정 피해" 처럼
 * 실제 수치를 담고 있으므로 접지 않고 그대로 보인다.
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
          // 수치가 든 쪽을 먼저 쓴다. 치환자가 남아 있으면 값이 없는 것이라 한 줄 설명으로.
          const detailed = tooltip.length > 0 && !hasUnresolvedTokens(tooltip);
          return (
            <article key={spell.id} data-summoner-spell={spell.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-center gap-3">
                <img
                  src={summonerSpellIconUrl(ddragonVersion, spell.iconPath)}
                  alt=""
                  width={40}
                  height={40}
                  loading="lazy"
                  className="size-10 shrink-0 rounded-md border border-border/60 bg-black/40"
                />
                <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{spell.name}</h3>
                <span className="shrink-0 tabular-nums">
                  <span className="text-base font-semibold">{cooldown}</span>
                  <span className="ml-0.5 text-[11px] text-muted-foreground">{t.common.seconds}</span>
                </span>
              </div>

              {detailed ? (
                <SafeBlockHtml className="mt-2.5 block text-xs leading-relaxed [&_br]:block" html={tooltip} />
              ) : (
                <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">{spell.summary || spell.name}</p>
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
