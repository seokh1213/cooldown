import type { KeyboardEvent, RefObject } from "react";
import { Search, Swords, X } from "lucide-react";
import type { Champion } from "@/types";
import { championIconUrl } from "@/data/assets/riotAssetUrls";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ChampionThumbnail from "./ChampionThumbnail";

export function ChampionSearchHeader(props: {
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  versus: boolean;
  onQueryChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const {
    inputRef,
    query,
    versus,
    onQueryChange,
    onKeyDown,
    onClose,
  } = props;
  return (
    <div
      className={cn(
        "p-4 border-b border-border flex items-center gap-2 shrink-0",
        versus ? "bg-muted/30" : "bg-card",
      )}
    >
      <Search
        className={cn(
          "h-5 w-5 shrink-0",
          versus ? "text-destructive" : "text-muted-foreground",
        )}
      />
      <Input
        ref={inputRef}
        type="text"
        placeholder={
          versus
            ? t.championSelector.vsSearchPlaceholder
            : t.championSelector.searchPlaceholder
        }
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={onKeyDown}
        className="flex-1"
        autoFocus
      />
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 hover:bg-muted hover:text-foreground"
        onClick={onClose}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function ChampionSelectorList(props: {
  listRef: RefObject<HTMLDivElement | null>;
  champions: readonly Champion[] | null;
  selectedIds: ReadonlySet<string>;
  focusedIndex: number;
  query: string;
  versus: boolean;
  showEmptyState?: boolean;
  className: string;
  onSelect: (champion: Champion) => void;
}) {
  const { t } = useTranslation();
  const {
    listRef,
    champions,
    selectedIds,
    focusedIndex,
    query,
    versus,
    showEmptyState = false,
    className,
    onSelect,
  } = props;

  return (
    <div ref={listRef} className={className}>
      {champions === null ? (
        <div className="flex items-center justify-center h-full text-muted-foreground min-h-[200px]">
          {t.championSelector.loading}
        </div>
      ) : champions.length === 0 && showEmptyState ? (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground min-h-[200px] space-y-2">
          <Search className="h-12 w-12 opacity-50" />
          <p className="text-base font-medium">
            {query
              ? t.championSelector.noResults
              : t.championSelector.emptyList}
          </p>
        </div>
      ) : (
        <>
          {versus && (
            <div className="mb-3 pb-2 border-b border-destructive/20">
              <div className="flex items-center gap-2 text-destructive">
                <Swords className="h-4 w-4" />
                <span className="text-sm font-semibold">
                  {t.championSelector.selectOpponentLabel}
                </span>
              </div>
            </div>
          )}
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
            {champions.map((champion, index) => (
              <div
                key={champion.id}
                data-champion-item
                className={cn(
                  focusedIndex === index && "ring-2 ring-offset-1 rounded-md",
                  focusedIndex === index &&
                    (versus ? "ring-destructive" : "ring-primary"),
                )}
              >
                <ChampionThumbnail
                  addChampion={onSelect}
                  data={champion}
                  name={champion.name}
                  selected={!versus && selectedIds.has(champion.id)}
                  thumbnailSrc={championIconUrl(
                    champion.ddragonVersion || "",
                    champion.id,
                  )}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
