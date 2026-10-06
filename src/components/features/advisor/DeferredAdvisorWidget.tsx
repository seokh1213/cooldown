import { useCallback, useEffect, useRef, useState } from "react";
import { CONSENT_STORAGE_KEY } from "@/lib/advisor/config";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import { AdvisorLauncher } from "./AdvisorLauncher";
import type { AdvisorWidget, AdvisorWidgetProps } from "./AdvisorWidget";

export function DeferredAdvisorWidget(props: AdvisorWidgetProps) {
  const { t } = useTranslation();
  const [Widget, setWidget] = useState<typeof AdvisorWidget>();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [requestedOpen, setRequestedOpen] = useState(false);
  const loading = useRef<Promise<unknown> | undefined>(undefined);

  const load = useCallback(() => {
    if (loading.current) return;
    setPending(true);
    setFailed(false);
    loading.current = import("./AdvisorWidget").then(
      (module) => { setWidget(() => module.AdvisorWidget); },
      () => { setFailed(true); },
    ).finally(() => { loading.current = undefined; setPending(false); });
  }, []);

  // Keep background model warm-up for returning users who already consented.
  useEffect(() => {
    try {
      if (localStorage.getItem(CONSENT_STORAGE_KEY) !== "granted") return;
    } catch { return; }
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(load, { timeout: 2000 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(load, 1500);
    return () => window.clearTimeout(handle);
  }, [load]);

  if (Widget) return <Widget {...props} initialOpen={requestedOpen} />;
  return (
    <>
      <AdvisorLauncher pending={pending} onClick={() => { setRequestedOpen(true); load(); }} />
      {failed && (
        <div role="alert" className="fixed bottom-24 right-4 z-50 flex items-center gap-3 rounded-md border bg-background p-3 text-sm text-muted-foreground">
          {t.app.loadError}
          {/* A fresh document can recover a failed or outdated module URL. */}
          <Button variant="outline" className="h-11" onClick={() => window.location.reload()}>{t.app.retry}</Button>
        </div>
      )}
    </>
  );
}
