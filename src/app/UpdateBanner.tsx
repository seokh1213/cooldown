import { applyPWAUpdate, BUILD_VERSION } from "@/pwa";
import { useTranslation } from "@/i18n";
import { useState } from "react";

interface UpdateBannerProps {
  visible: boolean;
  autoUpdateEnabled: boolean;
  onAutoUpdateChange: (enabled: boolean) => void;
  onDismiss: () => void;
}

export function UpdateBanner({
  visible,
  autoUpdateEnabled,
  onAutoUpdateChange,
  onDismiss,
}: UpdateBannerProps) {
  const { t } = useTranslation();
  const [applying, setApplying] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!visible || autoUpdateEnabled) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg bg-neutral-900/95 px-4 py-3 text-sm text-white shadow-lg border border-neutral-700">
      <div className="font-semibold mb-1">{t.app.updateReady}</div>
      {failed && <p role="status" className="mb-2 text-xs">{t.app.loadError} {t.app.retry}</p>}
      <div className="text-xs text-neutral-200 mb-2">
        {t.app.updateDescription}<br />
        <span className="opacity-70">{t.app.currentBuild}: {BUILD_VERSION}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1 text-xs text-neutral-300">
          <input
            type="checkbox"
            className="h-3 w-3 accent-emerald-400"
            checked={autoUpdateEnabled}
            onChange={(event) => onAutoUpdateChange(event.target.checked)}
          />
          {t.app.autoUpdate}
        </label>
        <div className="flex gap-1">
          <button type="button" className="rounded bg-neutral-700 px-2 py-1 text-xs transition-colors hover:bg-neutral-600 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white/60" onClick={onDismiss}>
            {t.app.later}
          </button>
          <button
            type="button"
            className="rounded bg-emerald-500 px-2 py-1 text-xs font-semibold text-black transition-colors hover:bg-emerald-400 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-neutral-600 disabled:text-neutral-300"
            disabled={applying}
            onClick={async () => {
              setApplying(true);
              const applied = await applyPWAUpdate();
              setApplying(false);
              setFailed(!applied);
            }}
          >
            {t.app.refreshNow}
          </button>
        </div>
      </div>
    </div>
  );
}
