import React, { useEffect, useMemo, useState } from "react";
import { getSummonerSpells } from "@/services/api";
import type { SummonerSpell } from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/i18n";
import { useDeviceType } from "@/hooks/useDeviceType";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { Search } from "lucide-react";

interface SummonerTabProps {
  version: string;
  lang: string;
}

export function SummonerTab({ version, lang }: SummonerTabProps) {
  const { t } = useTranslation();
  const deviceType = useDeviceType();
  const isMobile = deviceType === "mobile";

  const [spells, setSpells] = useState<SummonerSpell[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [search, setSearch] = useState<string>("");
  const [selectedSpell, setSelectedSpell] = useState<SummonerSpell | null>(
    null
  );
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getSummonerSpells(version, lang)
      .then((data) => {
        if (!cancelled) {
          const sorted = [...data].sort((a, b) =>
            a.name.localeCompare(b.name)
          );
          setSpells(sorted);
          if (!selectedSpell && sorted.length > 0) {
            setSelectedSpell(sorted[0]);
          }
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, lang]);

  const term = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!spells) return [];
    if (!term) return spells;
    return spells.filter((spell) => {
      const name = spell.name.toLowerCase();
      const desc = (spell.description || "").toLowerCase();
      const tooltip = (spell.tooltip || "").toLowerCase();
      return (
        name.includes(term) || desc.includes(term) || tooltip.includes(term)
      );
    });
  }, [spells, term]);

  if (loading && !spells) {
    return (
      <div className="mt-4 text-sm text-muted-foreground">
        {t.championSelector.loading}
      </div>
    );
  }

  if (!spells || spells.length === 0) {
    return (
      <div className="mt-4 text-sm text-muted-foreground">
        {t.championSelector.emptyList}
      </div>
    );
  }

  const renderDescriptionHtml = (spell: SummonerSpell) => {
    const html = spell.tooltip || spell.description || "";
    return (
      <span
        className="text-xs leading-relaxed [&_br]:block"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  };

  const listContent = (
    <div className="p-2 space-y-1">
      {filtered.map((spell) => {
        const isSelected = selectedSpell?.id === spell.id;
        return (
          <button
            key={spell.id}
            type="button"
            onClick={() => {
              setSelectedSpell(spell);
              if (isMobile) {
                setMobileDetailOpen(true);
              }
            }}
            className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
              isSelected
                ? "bg-primary/10 border border-primary/60"
                : "hover:bg-muted/60 border border-transparent"
            }`}
          >
            <img
              src={`https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${spell.image.full}`}
              alt={spell.name}
              loading="lazy"
              decoding="async"
              width={32}
              height={32}
              className="w-8 h-8 rounded-md border border-border/60 bg-black/40 flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold truncate">
                  {spell.name}
                </span>
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                  {spell.cooldown && spell.cooldown.length > 0
                    ? `${spell.cooldown[0]}${t.common.seconds}`
                    : ""}
                </span>
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
                {spell.description}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );

  const detailContent =
    selectedSpell && (
      <div className="flex flex-col gap-2 h-full min-h-0">
        <div className="flex items-start gap-3">
          <img
            src={`https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${selectedSpell.image.full}`}
            alt={selectedSpell.name}
            loading="lazy"
            decoding="async"
            width={40}
            height={40}
            className="w-10 h-10 rounded-md border border-border/60 bg-black/40 flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold truncate">
                {selectedSpell.name}
              </div>
              {selectedSpell.cooldown && selectedSpell.cooldown.length > 0 && (
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {t.common.rechargeTime}: {selectedSpell.cooldown[0]}
                  {t.common.seconds}
                </div>
              )}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5">
              <span>
                Lv {selectedSpell.summonerLevel}
              </span>
              {selectedSpell.modes && selectedSpell.modes.length > 0 && (
                <span className="truncate">
                  {selectedSpell.modes.join(", ")}
                </span>
              )}
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0 mt-2">
          <div className="pr-3">
            <div className="rounded-md border border-border/70 bg-card px-3 py-2 space-y-1.5">
              {renderDescriptionHtml(selectedSpell)}
            </div>
          </div>
        </ScrollArea>
      </div>
    );

  if (isMobile) {
    return (
      <div className="mt-4 space-y-3">
        <div className="relative group">
          <Search
            className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none transition-colors group-focus-within:text-primary"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.encyclopedia.summoner.searchPlaceholder}
            className="h-9 pl-7 text-xs border-neutral-400 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
          />
        </div>

        <div className="rounded-md border bg-card/40 max-h-[50vh]">
          <ScrollArea className="h-[50vh]">{listContent}</ScrollArea>
        </div>

        <Dialog
          open={mobileDetailOpen && !!selectedSpell}
          onOpenChange={(open) => {
            if (!open) {
              setMobileDetailOpen(false);
            }
          }}
        >
          <DialogContent className="w-[calc(100vw-32px)] max-w-lg max-h-[70vh] h-[70vh] p-0 rounded-xl overflow-hidden flex flex-col">
            <VisuallyHidden>
              <DialogTitle>{selectedSpell?.name ?? "Summoner Spell"}</DialogTitle>
              <DialogDescription>
                {selectedSpell?.name ?? "Summoner Spell"}
              </DialogDescription>
            </VisuallyHidden>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="p-4">{detailContent}</div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">
          {t.encyclopedia.tabs.summoner}
        </div>
        <div className="relative w-full sm:w-52 md:w-64 group">
          <Search
            className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none transition-colors group-focus-within:text-primary"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.encyclopedia.summoner.searchPlaceholder}
            className="h-8 pl-8 text-xs md:text-sm w-full border-neutral-400 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
          />
        </div>
      </div>

      <div className="rounded-md border bg-card/40 md:h-[calc(100vh-12rem)] flex flex-col md:flex-row">
        <div className="md:flex-1 md:border-r border-border/60 flex flex-col min-w-0 min-h-0">
          <div className="px-3 py-2 border-b border-border/60 flex items-center justify-between flex-shrink-0">
            <div className="text-[11px] font-semibold text-muted-foreground">
              {t.encyclopedia.summoner.listTitle}
            </div>
          </div>
          <ScrollArea className="flex-1 min-h-0">{listContent}</ScrollArea>
        </div>

        <div className="md:w-[340px] hidden md:flex flex-col p-3 min-h-0">
          {selectedSpell ? (
            detailContent
          ) : (
            <div className="text-xs text-muted-foreground h-full flex items-center justify-center text-center px-4">
              {t.encyclopedia.summoner.detailEmpty}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


