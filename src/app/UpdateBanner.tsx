import { applyPWAUpdate, BUILD_VERSION } from "@/pwa";

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
  if (!visible || autoUpdateEnabled) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg bg-neutral-900/95 px-4 py-3 text-sm text-white shadow-lg border border-neutral-700">
      <div className="font-semibold mb-1">새 버전이 준비되었습니다.</div>
      <div className="text-xs text-neutral-200 mb-2">
        앱을 새로고침하면 최신 버전으로 업데이트됩니다.<br />
        <span className="opacity-70">현재 빌드: {BUILD_VERSION}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1 text-xs text-neutral-300">
          <input
            type="checkbox"
            className="h-3 w-3 accent-emerald-400"
            checked={autoUpdateEnabled}
            onChange={(event) => onAutoUpdateChange(event.target.checked)}
          />
          다음부터 자동으로 새 버전 적용
        </label>
        <div className="flex gap-1">
          <button type="button" className="rounded bg-neutral-700 px-2 py-1 text-xs" onClick={onDismiss}>
            나중에
          </button>
          <button
            type="button"
            className="rounded bg-emerald-500 px-2 py-1 text-xs font-semibold text-black"
            onClick={() => {
              onDismiss();
              void applyPWAUpdate(true);
            }}
          >
            지금 새로고침
          </button>
        </div>
      </div>
    </div>
  );
}
