import { createContext, useContext } from "react";
import type { AdvisorTurn } from "@/features/advisor/session/useAdvisorTurns";
import { Button } from "@/shared/ui/button";
import { useTranslation } from "@/shared/i18n";

const HistoryReferenceContext = createContext<AdvisorTurn | undefined>(undefined);

export function HistoryReference({ turn, children }: { turn?: AdvisorTurn; children: React.ReactNode }) {
  return <HistoryReferenceContext.Provider value={turn}>{children}</HistoryReferenceContext.Provider>;
}

export function useHistoryReference() {
  return useContext(HistoryReferenceContext);
}

export function HistorySaveFailure({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  const { t } = useTranslation();
  if (!failed) return null;
  return (
    <div role="alert" className="flex items-center gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
      {t.advisor.history.saveFailed}
      <Button onClick={onRetry} variant="outline" className="h-11">{t.advisor.history.retrySave}</Button>
    </div>
  );
}
