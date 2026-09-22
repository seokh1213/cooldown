import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, Search } from "lucide-react";
import ChampionSelector from "@/components/features/ChampionSelector";
import { Button } from "@/components/ui/button";
import { ChampionIcon } from "@/components/ui/champion-icon";
import { SpriteIcon, useSpriteSheet } from "@/components/ui/sprite-icon";
import { useChampionSearch } from "@/hooks/useChampionSearch";
import { useTranslation } from "@/i18n";
import { ChampionSkinGallery } from "./ChampionSkinGallery";
import { useChampionProfile } from "./useChampionProfile";
import type { EncyclopediaPageProps } from "./types";

export function ChampionsTab(props: EncyclopediaPageProps) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [selecting, setSelecting] = useState(false);
  const [search, setSearch] = useState("");
  /*
   * 직군으로 거른다.
   *
   * 라이엇 공식 여섯 갈래를 쓴다 — 전사·마법사·암살자·원거리 딜러·탱커·서포터.
   *
   * 한때 커뮤니티 위키의 하위 직군 열넷을 썼다. 가르는 눈은 더 밝지만 칸이 잘게
   * 쪼개져 거르개로 쓸모가 없었다(Artillery 7명, Mage 1명 하는 식이다). 공식
   * 여섯이면 33~75명씩 고르게 나뉜다.
   *
   * 여럿 고르면 그중 하나라도 걸리면 남긴다. 한 챔피언이 둘에 걸치기도 한다
   * (오로라 = Mage + Assassin).
   */
  const [roles, setRoles] = useState<string[]>([]);
  const searched = useChampionSearch(props.championList, search);
  const allRoles = useMemo(
    () => [...new Set((props.championList ?? []).flatMap((champion) => champion.roles ?? []))].sort(),
    [props.championList],
  );
  const champions = useMemo(
    () => (roles.length === 0 ? searched : searched.filter((champion) => champion.roles?.some((role) => roles.includes(role)))),
    [searched, roles],
  );
  /*
   * 목록 아이콘은 스프라이트 한 장에서 잘라 쓴다. 173건이 줄줄이 날아가던 것이
   * 1건이 된다. 칸 차례는 묶음에 심어 두었으므로 목록을 넘기지 않는다.
   */
  const sprite = useSpriteSheet("champion", props.ddragonVersion);
  const toggleRole = (role: string) =>
    setRoles((current) => (current.includes(role) ? current.filter((value) => value !== role) : [...current, role]));
  const selected = props.championList?.find((champion) => champion.id === params.get("champion"));
  const identity = useMemo(() => ({ patchVersion: props.patchVersion, sources: props.sources }), [props.patchVersion, props.sources]);
  const { profile, error, retry } = useChampionProfile(selected?.id ?? "", identity, props.lang);
  const select = (id: string) => {
    const next = new URLSearchParams(params);
    next.set("champion", id);
    setParams(next);
    setSelecting(false);
  };
  return (
    <div className="py-4" data-champions-tab>
      {selected && (
        <Button variant="ghost" size="sm" className="mb-3 -ml-2 gap-1.5 text-muted-foreground" onClick={() => {
          const next = new URLSearchParams(params);
          next.delete("champion");
          setParams(next);
        }}>
          <ArrowLeft aria-hidden="true" className="size-4" />{t.championProfile.backToList}
        </Button>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {selected ? (
          <button type="button" onClick={() => setSelecting(true)} aria-label={t.comparison.select} className="flex items-center gap-3 rounded text-left focus-visible:outline-2 focus-visible:outline-primary">
            <ChampionIcon id={selected.id} ddragonVersion={props.ddragonVersion} className="block size-12 rounded" />
            <span><h1 className="text-xl font-semibold">{selected.name}</h1><span className="text-sm text-muted-foreground">{selected.title}</span></span>
            <ChevronDown aria-hidden="true" className="ml-2 size-4 text-muted-foreground" />
          </button>
        ) : (
          <div><h1 className="text-lg font-semibold">{t.championProfile.tab}</h1><p className="mt-1 text-sm text-muted-foreground">{t.championProfile.intro}</p></div>
        )}
        <span className="text-xs text-muted-foreground">{props.patchVersion}</span>
      </div>
      {!selected && (
        <div>
          <label className="mb-4 flex max-w-md items-center gap-2 rounded-md border border-input px-3 focus-within:ring-2 focus-within:ring-primary">
            <Search aria-hidden="true" className="size-4 text-muted-foreground" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} aria-label={t.comparison.select} placeholder={t.comparison.select} className="w-full bg-transparent py-2.5 text-base md:text-sm outline-none" />
          </label>
          {allRoles.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-1.5" role="group" aria-label={t.championProfile.roleFilter} data-role-filter>
              <button
                type="button"
                onClick={() => setRoles([])}
                aria-pressed={roles.length === 0}
                className={`rounded-full border px-2.5 py-1 text-xs focus-visible:outline-2 focus-visible:outline-primary ${roles.length === 0 ? "border-foreground/40 font-semibold" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                {t.championProfile.roleFilterAll}
              </button>
              {allRoles.map((role) => {
                const on = roles.includes(role);
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => toggleRole(role)}
                    aria-pressed={on}
                    data-role={role}
                    className={`rounded-full border px-2.5 py-1 text-xs focus-visible:outline-2 focus-visible:outline-primary ${on ? "border-foreground/40 font-semibold" : "border-border text-muted-foreground hover:text-foreground"}`}
                  >
                    {t.championProfile.roleNames[role] ?? role}
                  </button>
                );
              })}
            </div>
          )}
          {/*
            열 수를 화면 크기마다 못 박지 않는다.

            끊는 점마다 5·8·10·12·16 으로 적어 두었더니 그 사이 폭에서는 칸이 빠듯해져
            "레나타 글라스크" 같은 이름이 서너 줄로 접혔다. 끊는 점을 더 늘리는 것은
            같은 문제를 잘게 나눌 뿐이다.

            대신 **칸의 최소 폭**만 정하고 몇 개가 들어갈지는 브라우저가 세게 한다.
            아이콘 44px 에 두 글자 이름이 한 줄로 들어가는 폭이 76px 근방이다.
            좁아지면 한 줄에 적게 들어가고, 넓어지면 저절로 늘어난다.
          */}
          <div
            className="grid gap-x-2 gap-y-3 [grid-template-columns:repeat(auto-fill,minmax(76px,1fr))]"
            data-champion-grid
          >
            {champions.map((champion) => (
              <button key={champion.id} type="button" onClick={() => select(champion.id)} className="group flex min-w-0 flex-col items-center gap-1.5 rounded py-1 text-center focus-visible:outline-2 focus-visible:outline-primary">
                {sprite.index.has(champion.id) ? (
                  <SpriteIcon state={sprite} id={champion.id} size={44} className="block rounded bg-cover group-hover:ring-2 group-hover:ring-primary" />
                ) : (
                  <ChampionIcon id={champion.id} ddragonVersion={props.ddragonVersion} className="block size-11 rounded group-hover:ring-2 group-hover:ring-primary" />
                )}
                {/*
                  `break-keep` 으로 낱말 가운데를 자르지 않는다. 기본값은 한글을 아무
                  글자에서나 끊어서 "레나타 글라스크" 가 "레나 / 타 글 / 라스 / 크" 로
                  네 줄이 됐다. 띄어쓰기에서만 끊으면 두 줄로 끝난다.
                */}
                <span className="break-keep text-[11px] leading-tight group-hover:text-primary">{champion.name}</span>
              </button>
            ))}
          </div>
          {!champions.length && <p role="status" className="py-6 text-sm text-muted-foreground">{t.championSelector.noResults}</p>}
        </div>
      )}
      {selected && !profile && <div role="status" className="py-16 text-center text-sm text-muted-foreground">{error ? <>{t.app.loadError}<Button onClick={retry} variant="outline" size="sm" className="ml-3">{t.app.retry}</Button></> : t.championSelector.loading}</div>}
      {profile && (
        <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]" data-champion-profile={profile.champion.id}>
          <ChampionSkinGallery key={profile.champion.id + ":" + props.lang} champion={profile.champion} />
          <section aria-label={t.championProfile.story} className="border-t border-border pt-5 lg:border-t-0 lg:pt-0">
            <h2 className="text-base font-semibold">{t.championProfile.story}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t.championProfile.officialBio}</p>
            <p data-champion-lore className="mt-4 whitespace-pre-line text-sm leading-7 text-foreground/85">{profile.champion.lore || t.championProfile.noStory}</p>
          </section>
        </div>
      )}
      {selecting && <ChampionSelector championList={props.championList} selectedChampions={[]} selectionMode="single" open onClose={() => setSelecting(false)} onOpenChange={setSelecting} onSelect={(champion) => select(champion.id)} />}
    </div>
  );
}
