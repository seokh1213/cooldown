import React, { useState } from "react";
import { CHAMP_ICON_URL } from "@/services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import ChampionSelector from "../ChampionSelector";
import { STAT_FIELDS } from "./constants";
import { SectionProps } from "./types";

export function StatsSection({
  champions,
  version,
  championList,
  onAddChampion,
  onRemoveChampion,
}: SectionProps) {
  const [showAddSlot, setShowAddSlot] = useState(false);

  return (
    <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
      <div className="min-w-full">
        {/* Desktop Table */}
        <div className="hidden md:block relative">
          <div className="border border-border/30 rounded-lg overflow-hidden">
            <Table className="border-collapse table-fixed w-auto">
              <TableHeader>
                <TableRow className="border-b border-border/30">
                  <TableHead className="text-left p-2 pl-3 text-xs font-semibold text-foreground sticky left-0 bg-card z-20 w-[90px] min-w-[90px] border-r border-border/30" style={{ left: 0 }}>
                    스탯
                  </TableHead>
                  {champions.map((champion, idx) => (
                    <TableHead
                      key={champion.id}
                      className={cn(
                        "text-center p-2 text-xs font-semibold text-foreground w-[100px] min-w-[100px]",
                        idx < champions.length - 1 && "border-r border-border/30"
                      )}
                    >
                      <div className="flex flex-col items-center justify-center gap-1.5 relative">
                        <div className="relative">
                          <img
                            src={CHAMP_ICON_URL(version, champion.id)}
                            alt={champion.name}
                            className="w-8 h-8 rounded-full"
                          />
                          {onRemoveChampion && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                "absolute -top-1 -right-1 h-4 w-4 rounded-full",
                                "bg-destructive/90 hover:bg-destructive text-white",
                                "hover:scale-110 transition-transform",
                                "shadow-md"
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemoveChampion(champion.id);
                              }}
                              aria-label={`Remove ${champion.name}`}
                            >
                              <X className="h-2.5 w-2.5" />
                            </Button>
                          )}
                        </div>
                        <div className="text-[10px] font-semibold leading-tight text-center break-words text-foreground">
                          {champion.name}
                        </div>
                      </div>
                    </TableHead>
                  ))}
                  {onAddChampion && (
                    <TableHead className="text-center p-2 text-xs font-semibold text-foreground w-[100px] min-w-[100px] border-l border-border/30">
                      <Button
                        onClick={() => setShowAddSlot(true)}
                        variant="outline"
                        className="w-full flex flex-row items-center justify-center gap-2 p-1.5 h-auto border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30 group"
                      >
                        <div className="w-8 h-8 rounded-full bg-muted/30 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                          <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                        <div className="text-[10px] text-muted-foreground group-hover:text-primary transition-colors whitespace-nowrap">
                          추가
                        </div>
                      </Button>
                    </TableHead>
                  )}
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
                      {champions.map((champion, idx) => {
                        const value = champion.stats?.[field.key] ?? 0;
                        const isMax = value === maxValue && maxValue !== minValue;
                        const isMin = value === minValue && maxValue !== minValue;

                        return (
                          <TableCell
                            key={champion.id}
                            className={cn(
                              "p-2 text-xs text-center",
                              idx < champions.length - 1 && "border-r border-border/30",
                              isMax && "text-primary font-semibold",
                              isMin && "text-muted-foreground"
                            )}
                          >
                            {field.format(value)}
                          </TableCell>
                        );
                      })}
                      {onAddChampion && (
                        <TableCell className="p-2 text-center border-l border-border/30">
                          <div className="w-full h-full min-h-[32px]" />
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {showAddSlot && onAddChampion && championList && (
            <ChampionSelector
              championList={championList}
              selectedChampions={champions}
              onSelect={(champion) => {
                onAddChampion(champion);
              }}
              onClose={() => setShowAddSlot(false)}
            />
          )}
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden space-y-4">
          {champions.map((champion) => (
            <Card key={champion.id}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <img
                    src={CHAMP_ICON_URL(version, champion.id)}
                    alt={champion.name}
                    className="w-12 h-12 rounded-full"
                  />
                  <div>
                    <CardTitle className="text-lg">{champion.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {champion.title}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {STAT_FIELDS.map((field) => {
                    const value = champion.stats?.[field.key] ?? 0;
                    return (
                      <div
                        key={field.key}
                        className="flex justify-between items-center py-2 border-b border-border/50 last:border-0"
                      >
                        <span className="text-sm font-medium">
                          {field.label}
                        </span>
                        <span className="text-sm">{field.format(value)}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

