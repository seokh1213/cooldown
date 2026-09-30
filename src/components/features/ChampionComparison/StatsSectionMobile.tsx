import { ChampionIcon } from "@/components/ui/champion-icon";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getStatFields } from "./constants";
import { ChampionStatValue } from "./ChampionStatValue";
import { SectionProps } from "./types";
import { useTranslation } from "@/i18n";

export function StatsSectionMobile({
  champions,
  ddragonVersion,
}: SectionProps) {
  const { t, lang } = useTranslation();
  const STAT_FIELDS = getStatFields(lang);

  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <div className="min-w-full">
        <div className="relative">
          <div className="border border-border/30 rounded-lg overflow-hidden">
            <Table className="border-collapse table-fixed w-auto min-w-full">
              <TableHeader>
                <TableRow className="border-b border-border/30 select-none">
                  <TableHead className="text-left p-1.5 pl-2 text-[11px] font-semibold text-foreground sticky left-0 bg-card z-20 w-[70px] min-w-[70px] border-r border-border/30 select-none" style={{ left: 0 }}>
                    {t.stats.label}
                  </TableHead>
                  {champions.map((champion) => (
                    <TableHead
                      key={champion.id}
                      className="text-center p-1.5 text-[11px] font-semibold text-foreground w-full select-none"
                    >
                      <div className="flex flex-col items-center justify-center gap-1">
                        <ChampionIcon id={champion.id} ddragonVersion={ddragonVersion} alt={champion.name} className="block w-8 h-8 rounded-full" />
                        <div className="text-sm font-semibold leading-tight text-center text-foreground">
                          {champion.name}
                        </div>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {STAT_FIELDS.map((field) => {
                  const values = champions.map((c) => c.stats?.[field.key] ?? 0);
                  const maxValue = Math.max(...values);
                  const minValue = Math.min(...values);

                  return (
                    <TableRow
                      key={field.key}
                      className="border-b border-border/30 hover:bg-muted/30 transition-colors"
                    >
                      <TableCell className="p-1.5 pl-2 text-[11px] font-medium sticky left-0 bg-card z-20 border-r border-border/30 select-none" style={{ wordBreak: 'keep-all', left: 0 }}>
                        {field.label}
                      </TableCell>
                      {champions.map((champion) => {
                        const value = champion.stats?.[field.key] ?? 0;
                        const isMax = value === maxValue && maxValue !== minValue;
                        const isMin = value === minValue && maxValue !== minValue;

                        return (
                          <TableCell
                            key={champion.id}
                            className={cn(
                              "p-1.5 text-[11px] text-center",
                              isMax && "text-primary font-semibold",
                              isMin && "text-muted-foreground"
                            )}
                          >
                            <ChampionStatValue field={field} stats={champion.stats} />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
