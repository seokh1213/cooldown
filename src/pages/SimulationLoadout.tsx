import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { summonerSpellIconUrl } from "@/data/assets/riotAssetUrls";
import { useTranslation } from "@/i18n";
import type { NormalizedSummonerSpell } from "@/types/combatNormalized";

interface SimulationLoadoutProps {
  ddragonVersion: string;
  summoners: NormalizedSummonerSpell[];
  selectedIds: string[];
  onSelect: (slot: number, id: string) => void;
}

export function SimulationLoadout(props: SimulationLoadoutProps) {
  const { t } = useTranslation();
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      <Card className="space-y-3 border-border/70 bg-card/60 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {t.pages.simulation.summonerSpellsTitle}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((slot) => {
            const selected = props.summoners.find(
              (spell) => spell.id === props.selectedIds[slot],
            );
            return (
              <label key={slot} className="flex items-center gap-2">
                {selected ? (
                  <img
                    src={summonerSpellIconUrl(props.ddragonVersion, selected.iconPath)}
                    alt=""
                    className="size-10 rounded-md"
                  />
                ) : <span className="size-10 rounded-md border border-dashed border-border" />}
                <Select
                  aria-label={`${t.pages.simulation.summonerSpellsTitle} ${slot + 1}`}
                  value={props.selectedIds[slot] ?? ""}
                  onChange={(event) => props.onSelect(slot, event.target.value)}
                  className="h-10 min-w-0 flex-1 text-xs"
                >
                  <option value="">{t.pages.simulation.selectSummonerSpell}</option>
                  {props.summoners.map((spell) => (
                    <option
                      key={spell.id}
                      value={spell.id}
                      disabled={props.selectedIds.some(
                        (id, index) => index !== slot && id === spell.id,
                      )}
                    >
                      {spell.name}
                    </option>
                  ))}
                </Select>
              </label>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {t.pages.simulation.summonerSpellHint}
        </p>
      </Card>

      <Card className="space-y-3 border-border/70 bg-card/60 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {t.pages.simulation.runesTitle}
        </div>
        <div className="flex items-center gap-2" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="size-8 rounded-full border border-border/70 bg-background/40" />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {t.pages.simulation.runesComingSoon}
        </p>
      </Card>
    </div>
  );
}
