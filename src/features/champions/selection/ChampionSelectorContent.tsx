import type { KeyboardEvent, RefObject } from "react";
import { Search, Star, X } from "lucide-react";
import type { Champion } from "@/domain/game/types";
import { useTranslation } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import ChampionThumbnail from "./ChampionThumbnail";
import { partitionFavoriteChampions } from "./championFavorites";

export function ChampionSearchHeader(props: {
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  onQueryChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onClose: () => void;
  favoriteEditing: boolean;
  onFavoriteEditingChange: (editing: boolean) => void;
}) {
  const { t } = useTranslation();
  const {
    inputRef,
    query,
    onQueryChange,
    onKeyDown,
    onClose,
    favoriteEditing,
    onFavoriteEditingChange,
  } = props;
  return (
    <div className="p-4 border-b border-border flex items-center gap-2 shrink-0 bg-card">
      <Search aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="text"
        name="champion-search"
        aria-label={t.championSelector.searchPlaceholder}
        autoComplete="off"
        placeholder={t.championSelector.searchPlaceholder}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={onKeyDown}
        className="flex-1"
      />
      <Button
        variant={favoriteEditing ? "secondary" : "ghost"}
        size="icon"
        className={cn(
          "h-10 w-10 shrink-0 hover:bg-muted hover:text-amber-500 md:h-8 md:w-8",
          favoriteEditing && "text-amber-500",
        )}
        onClick={() => onFavoriteEditingChange(!favoriteEditing)}
        aria-label={
          favoriteEditing
            ? t.championSelector.finishEditingFavorites
            : t.championSelector.editFavorites
        }
        aria-pressed={favoriteEditing}
        title={
          favoriteEditing
            ? t.championSelector.finishEditingFavorites
            : t.championSelector.editFavorites
        }
      >
        <Star
          aria-hidden="true"
          className={cn("h-4 w-4", favoriteEditing && "fill-current")}
        />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 hover:bg-muted hover:text-foreground"
        onClick={onClose}
        aria-label={t.championSelector.closeButton}
      >
        <X aria-hidden="true" className="h-4 w-4" />
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
  showEmptyState?: boolean;
  className: string;
  onSelect: (champion: Champion) => void;
  favoriteIds: ReadonlySet<string>;
  favoriteEditing: boolean;
  onToggleFavorite: (champion: Champion) => void;
}) {
  const { t } = useTranslation();
  const {
    listRef,
    champions,
    selectedIds,
    focusedIndex,
    query,
    showEmptyState = false,
    className,
    onSelect,
    favoriteIds,
    favoriteEditing,
    onToggleFavorite,
  } = props;

  const sections = champions
    ? partitionFavoriteChampions(champions, favoriteIds)
    : null;

  return (
    <div ref={listRef} className={className} data-champion-list>
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
          {sections && sections.favorites.length > 0 && (
            <ChampionSection
              label={t.championSelector.favoriteSection}
              champions={sections.favorites}
              indexOffset={0}
              {...{ selectedIds, focusedIndex, favoriteIds, favoriteEditing, onSelect, onToggleFavorite }}
            />
          )}
          {sections && sections.others.length > 0 && (
            <ChampionSection
              label={
                sections.favorites.length > 0
                  ? t.championSelector.allChampionsSection
                  : undefined
              }
              divided={sections.favorites.length > 0}
              champions={sections.others}
              indexOffset={sections.favorites.length}
              {...{ selectedIds, focusedIndex, favoriteIds, favoriteEditing, onSelect, onToggleFavorite }}
            />
          )}
        </>
      )}
    </div>
  );
}

function ChampionSection(props: {
  label?: string;
  divided?: boolean;
  champions: readonly Champion[];
  indexOffset: number;
  selectedIds: ReadonlySet<string>;
  focusedIndex: number;
  favoriteIds: ReadonlySet<string>;
  favoriteEditing: boolean;
  onSelect: (champion: Champion) => void;
  onToggleFavorite: (champion: Champion) => void;
}) {
  return (
    <section className={cn(props.divided && "mt-4 border-t border-border pt-3")}>
      {props.label && (
        <div className="mb-2 flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
          {props.favoriteIds.has(props.champions[0]?.id) && (
            <Star aria-hidden="true" className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
          )}
          <span>{props.label}</span>
        </div>
      )}
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
        {props.champions.map((champion, sectionIndex) => {
          const index = props.indexOffset + sectionIndex;
          return (
            <div
              key={champion.id}
              data-champion-item
              className={cn(
                props.focusedIndex === index && "rounded-md ring-2 ring-offset-1 ring-primary",
              )}
            >
              <ChampionThumbnail
                addChampion={props.onSelect}
                data={champion}
                name={champion.name}
                selected={props.selectedIds.has(champion.id)}
                favorite={props.favoriteIds.has(champion.id)}
                showFavoriteControl={props.favoriteEditing}
                onToggleFavorite={props.onToggleFavorite}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
