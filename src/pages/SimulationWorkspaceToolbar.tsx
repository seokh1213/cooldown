import { Check, Copy, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";

interface SimulationWorkspaceToolbarProps {
  patchVersion: string;
  restoredPatchVersion?: string;
  shareStatus: "idle" | "copied" | "failed";
  supportedAbilities: number;
  conditionalActions: number;
  excludedActions: number;
  onShare: () => void;
  onReset: () => void;
  onLevelPreset: (level: number) => void;
  onHealthPreset: (percent: number) => void;
}

export function SimulationWorkspaceToolbar(props: SimulationWorkspaceToolbarProps) {
  const { t } = useTranslation();
  return (
    <div className="mb-6 border-y border-border/70 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck aria-hidden="true" className="size-4 text-emerald-500" />
          <span>
            {t.pages.simulation.trustSummary
              .replace("{patch}", props.patchVersion)
              .replace("{supported}", String(props.supportedAbilities))
              .replace("{conditional}", String(props.conditionalActions))
              .replace("{excluded}", String(props.excludedActions))}
          </span>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={props.onShare} className="h-11 gap-1.5 sm:h-9">
          {props.shareStatus === "copied" ? <Check aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />}
          {props.shareStatus === "copied" ? t.pages.simulation.copied : t.pages.simulation.share}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={props.onReset} className="h-11 gap-1.5 text-muted-foreground sm:h-9">
          <RotateCcw aria-hidden="true" className="size-3.5" />
          {t.pages.simulation.resetSimulation}
        </Button>
      </div>
      {props.restoredPatchVersion && props.restoredPatchVersion !== props.patchVersion && (
        <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
          {t.pages.simulation.patchMismatch
            .replace("{shared}", props.restoredPatchVersion)
            .replace("{current}", props.patchVersion)}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <span className="mr-1">{t.pages.simulation.levelPresets}</span>
          {[6, 11, 16, 18].map((level) => (
            <button key={level} type="button" onClick={() => props.onLevelPreset(level)} className="size-11 rounded border border-border text-foreground transition-colors hover:border-primary hover:text-primary sm:size-auto sm:px-2 sm:py-1">
              {level}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-1">{t.pages.simulation.healthPresets}</span>
          {[25, 50, 100].map((percent) => (
            <button key={percent} type="button" onClick={() => props.onHealthPreset(percent)} className="h-11 min-w-11 rounded border border-border px-2 text-foreground transition-colors hover:border-primary hover:text-primary sm:h-auto sm:py-1">
              {percent}%
            </button>
          ))}
        </div>
      </div>
      <p aria-live="polite" className="sr-only">
        {props.shareStatus === "copied" ? t.pages.simulation.copySuccess : props.shareStatus === "failed" ? t.pages.simulation.copyFailed : ""}
      </p>
    </div>
  );
}
