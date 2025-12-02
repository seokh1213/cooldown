import { CHAMP_ICON_URL } from "@/services/api";
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
import { SectionProps } from "./types";
import { useTranslation } from "@/i18n";

export function StatsSectionMobile({
  champions,
  version,
  vsMode,
}: SectionProps) {
  const { t, lang } = useTranslation();
  const STAT_FIELDS = getStatFields(lang);

  // VS 모드 레이아웃
  if (vsMode && champions.length === 2) {
    const championA = vsMode.championA;
    const championB = vsMode.championB;
    
    return (
      <div className="overflow-x-auto -mx-4 px-4">
        <div className="min-w-full">
          <div className="relative">
            <div className="border border-border/30 rounded-lg overflow-hidden">
              <Table className="border-collapse table-fixed w-auto min-w-full">
                <TableHeader>
                  <TableRow className="border-b border-border/30 select-none">
                    <TableHead className="text-left p-1.5 pl-2 text-[10px] font-semibold text-foreground sticky left-0 bg-card z-20 w-[50px] min-w-[50px] border-r border-border/30 select-none" style={{ left: 0 }}>
                      {t.stats.label}
                    </TableHead>
                    <TableHead className="text-center p-1.5 text-[10px] font-semibold text-foreground w-1/2 border-r border-border/30 select-none">
                      <div className="flex flex-col items-center justify-center gap-0.5">
                        <img
                          src={CHAMP_ICON_URL(version, championA.id)}
                          alt={championA.name}
                          className="w-6 h-6 rounded-full"
                          draggable="false"
                        />
                        <div className="text-xs font-semibold leading-tight text-center text-foreground">
                          {championA.name}
                        </div>
                      </div>
                    </TableHead>
                    <TableHead className="text-center p-1.5 text-[10px] font-semibold text-foreground w-[40px] min-w-[40px] border-r border-border/30 bg-muted/20 select-none">
                      <div className="text-[9px] font-bold">VS</div>
                    </TableHead>
                    <TableHead className="text-center p-1.5 text-[10px] font-semibold text-foreground w-1/2 select-none">
                      <div className="flex flex-col items-center justify-center gap-0.5">
                        <img
                          src={CHAMP_ICON_URL(version, championB.id)}
                          alt={championB.name}
                          className="w-6 h-6 rounded-full"
                          draggable="false"
                        />
                        <div className="text-xs font-semibold leading-tight text-center text-foreground">
                          {championB.name}
                        </div>
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {STAT_FIELDS.map((field) => {
                    const valueA = championA.stats?.[field.key] ?? 0;
                    const valueB = championB.stats?.[field.key] ?? 0;
                    const maxValue = Math.max(valueA, valueB);
                    const minValue = Math.min(valueA, valueB);

                    return (
                      <TableRow
                        key={field.key}
                        className="border-b border-border/30 hover:bg-muted/30 transition-colors"
                      >
                        <TableCell className="p-1.5 pl-2 text-[10px] font-medium sticky left-0 bg-card z-20 border-r border-border/30 select-none" style={{ wordBreak: 'keep-all', left: 0 }}>
                          {field.label}
                        </TableCell>
                        <TableCell className={cn(
                          "p-1.5 text-[10px] text-center border-r border-border/30",
                          valueA === maxValue && maxValue !== minValue && "text-primary font-semibold",
                          valueA === minValue && maxValue !== minValue && "text-muted-foreground"
                        )}>
                          {field.format(valueA)}
                        </TableCell>
                        <TableCell className="p-1.5 border-r border-border/30 bg-muted/20 select-none"></TableCell>
                        <TableCell className={cn(
                          "p-1.5 text-[10px] text-center",
                          valueB === maxValue && maxValue !== minValue && "text-primary font-semibold",
                          valueB === minValue && maxValue !== minValue && "text-muted-foreground"
                        )}>
                          {field.format(valueB)}
                        </TableCell>
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

  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <div className="min-w-full">
        <div className="relative">
          <div className="border border-border/30 rounded-lg overflow-hidden">
            <Table className="border-collapse table-fixed w-auto min-w-full">
              <TableHeader>
                <TableRow className="border-b border-border/30 select-none">
                  <TableHead className="text-left p-2 pl-3 text-xs font-semibold text-foreground sticky left-0 bg-card z-20 w-[70px] min-w-[70px] border-r border-border/30 select-none" style={{ left: 0 }}>
                    {t.stats.label}
                  </TableHead>
                  {champions.map((champion) => (
                    <TableHead
                      key={champion.id}
                      className="text-center p-2 text-xs font-semibold text-foreground w-full select-none"
                    >
                      <div className="flex flex-col items-center justify-center gap-1">
                        <img
                          src={CHAMP_ICON_URL(version, champion.id)}
                          alt={champion.name}
                          className="w-8 h-8 rounded-full"
                          draggable="false"
                        />
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
                      <TableCell className="p-2 pl-3 text-xs font-medium sticky left-0 bg-card z-20 border-r border-border/30 select-none" style={{ wordBreak: 'keep-all', left: 0 }}>
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
                              "p-2 text-xs text-center",
                              isMax && "text-primary font-semibold",
                              isMin && "text-muted-foreground"
                            )}
                          >
                            {field.format(value)}
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

