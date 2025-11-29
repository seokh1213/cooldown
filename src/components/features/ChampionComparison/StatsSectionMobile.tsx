import React from "react";
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
import { STAT_FIELDS } from "./constants";
import { SectionProps } from "./types";

export function StatsSectionMobile({
  champions,
  version,
  championList,
  onAddChampion,
  onRemoveChampion,
}: SectionProps) {

  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <div className="min-w-full">
        <div className="relative">
          <div className="border border-border/30 rounded-lg overflow-hidden">
            <Table className="border-collapse table-fixed w-auto min-w-full">
              <TableHeader>
                <TableRow className="border-b border-border/30">
                  <TableHead className="text-left p-2 pl-3 text-xs font-semibold text-foreground sticky left-0 bg-card z-20 w-[70px] min-w-[70px] border-r border-border/30" style={{ left: 0 }}>
                    스탯
                  </TableHead>
                  {champions.map((champion) => (
                    <TableHead
                      key={champion.id}
                      className="text-center p-2 text-xs font-semibold text-foreground w-full"
                    >
                      <div className="flex flex-col items-center justify-center gap-1">
                        <img
                          src={CHAMP_ICON_URL(version, champion.id)}
                          alt={champion.name}
                          className="w-8 h-8 rounded-full"
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
                      <TableCell className="p-2 pl-3 text-xs font-medium sticky left-0 bg-card z-20 border-r border-border/30" style={{ wordBreak: 'keep-all', left: 0 }}>
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

